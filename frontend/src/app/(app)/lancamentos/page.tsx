"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Clock, Pencil, Plus, Trash2 } from "lucide-react";
import { DndContext, DragOverlay } from "@dnd-kit/core";
import { SortableContext, rectSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useInstancias } from "@/contexts/InstanciasContext";
import { useRecorte } from "@/contexts/RecorteContext";
import { useOrdenacaoArrastavel, TRANSICAO_FIRME } from "@/hooks/useOrdenacaoArrastavel";
import { JanelaSelector } from "@/components/dominium/JanelaSelector";
import { ResumoDashboard } from "@/components/dominium/ResumoDashboard";
import { SyncStatusBadge } from "@/components/dominium/SyncStatusBadge";
import { CampoMoeda } from "@/components/dominium/CampoMoeda";
import { CampoMes } from "@/components/dominium/CampoMes";
import { CampoPrazoMeses } from "@/components/dominium/CampoPrazoMeses";
import { SeletorMesReferencia } from "@/components/dominium/SeletorMesReferencia";
import { AlcaArrastar } from "@/components/dominium/AlcaArrastar";
import { ColunasMasonry } from "@/components/dominium/ColunasMasonry";
import { Toast } from "@/components/dominium/Toast";
import { formatarMoeda } from "@/lib/format";
import { descricaoAutomatica, inserirDataDeHoje } from "@/lib/descricaoLancamento";
import { diferencaEmMeses, formatarMesInline, formatarMesLabel, somarMeses } from "@/lib/mes";
import { centavosParaNumero, numeroParaCentavos } from "@/lib/moeda";
import { calcularPlanoTemporarioPreview } from "@/lib/parcelamento";
import { validarValorCentavos } from "@/lib/validacaoLancamento";
import { PALETA_INSTANCIA, COR_SUGERIDA_POR_GRUPO } from "@/lib/cores";
import { enqueuarCriacaoLancamento, listarNaoConcluidas } from "@/lib/offline/outbox";
import { construirLancamentoOtimista } from "@/lib/offline/optimistic";
import { tentarSincronizar } from "@/lib/offline/syncManager";
import { useOutboxPendentes } from "@/lib/offline/useOutboxPendentes";
import { lerSnapshot, salvarSnapshot } from "@/lib/offline/snapshots";
import type { LancamentoLocal } from "@/lib/offline/types";
import type { DashboardData, Grupo, Instancia, Lancamento, TipoLancamento } from "@/lib/types";

// Espelha o mesmo criterio de competencia do backend
// (intervaloEfetivoNaJanela/competenciaDoLancamento em
// backend/src/utils/projecao.js e backend/src/routes/lancamentos.js): o
// lancamento tem efeito no mes-alvo se mesInicio <= mesAlvo <= mesFim (fixo
// nao tem mesFim, vai ate o infinito). Usado so pra decidir se o seletor de
// mes precisa pular apos criar um lancamento — nunca pra calcular valores.
function produzParcelaNoMes(mesInicio: string, tipo: TipoLancamento, parcelas: number | null, mesAlvo: string) {
  if (diferencaEmMeses(mesInicio, mesAlvo) < 0) return false;
  if (tipo === "fixo") return true;
  const mesFim = somarMeses(mesInicio, (parcelas || 1) - 1);
  return diferencaEmMeses(mesAlvo, mesFim) >= 0;
}

// 99% dos gastos são compras pontuais (eventualmente parceladas); receitas
// tendem a ser recorrentes (salário, aluguel recebido) — o toggle já abre no
// que é mais comum pra cada grupo.
const TIPO_PADRAO_POR_GRUPO: Record<Grupo, TipoLancamento> = {
  gasto: "temporario",
  receita: "fixo",
  investimento: "fixo",
};

const FORM_VAZIO = {
  descricao: "",
  valorCentavos: 0,
  tipo: "fixo" as TipoLancamento,
  mesInicio: "",
  prazoMeses: 1 as number | "",
  observacoes: "",
  // 'total' (default): no momento do registro o usuário tem o total da
  // compra na cabeça, não a parcela — capturar sem fricção é prioridade; a
  // conversão pro valor de parcela é feita pelo backend (calcularPlanoTemporario).
  // 'parcela': o valor digitado já é o da parcela, como sempre foi.
  modoValor: "total" as "total" | "parcela",
};

type DadosGaveta = { lancamentos: LancamentoLocal[]; totalJanela: number; carregando: boolean };

const LABEL_LANCAR: Record<Grupo, string> = {
  gasto: "Lançar gasto",
  receita: "Lançar receita",
  investimento: "Lançar",
};

const LABEL_GRUPO_BOTAO: Record<Grupo, string> = {
  gasto: "Gastos",
  receita: "Receitas",
  investimento: "Investimentos",
};

export default function LancamentosPage() {
  const { usuario } = useAuth();
  const { instancias, recarregar, reordenar } = useInstancias();
  const { janela, mesReferencia, setMesReferencia } = useRecorte();
  const pendentesUsuario = useOutboxPendentes(usuario?.id);
  const pendentesAnterioresRef = useRef(0);

  const [grupo, setGrupo] = useState<Grupo>("gasto");
  const [estado, setEstado] = useState<"geral" | "foco">("geral");
  const [instanciaFoco, setInstanciaFoco] = useState<Instancia | null>(null);
  const [lancamentoEditando, setLancamentoEditando] = useState<Lancamento | null>(null);
  const [novaInstancia, setNovaInstancia] = useState<{ nome: string; cor: string } | null>(null);
  const [instanciaEditando, setInstanciaEditando] = useState<{ id: string; nome: string; cor: string } | null>(null);
  const [instanciaParaExcluir, setInstanciaParaExcluir] = useState<Instancia | null>(null);

  const [form, setForm] = useState(FORM_VAZIO);
  const [erroForm, setErroForm] = useState("");
  const [salvando, setSalvando] = useState(false);

  const [gavetas, setGavetas] = useState<Record<string, DadosGaveta>>({});
  const [resumo, setResumo] = useState<DashboardData | null>(null);

  const instanciasDoGrupo = useMemo(
    () => instancias.filter((i) => i.grupo === grupo && i.ativa),
    [instancias, grupo]
  );

  const contextoOrdenacao = grupo === "gasto" ? "lancamentos-gasto" : "lancamentos-receita";
  const setInstanciasDoGrupo = useCallback(
    (novaOrdem: Instancia[]) => reordenar(novaOrdem.map((i) => i.id)),
    [reordenar]
  );
  const {
    sensors,
    collisionDetection,
    measuring,
    onDragStart,
    onDragMove,
    onDragEnd,
    onDragCancel,
    emArraste,
    indiceInsercao,
    itemAtivo,
    erro: erroOrdenacao,
    limparErro: limparErroOrdenacao,
  } = useOrdenacaoArrastavel(contextoOrdenacao, instanciasDoGrupo, setInstanciasDoGrupo, { colunas: 2 });

  const carregarResumo = useCallback(async () => {
    try {
      const data = await api.get<DashboardData>(`/api/dashboard?janela=${janela}&mesReferencia=${mesReferencia}`);
      setResumo(data);
    } catch {
      // Offline/erro de rede: mantém o resumo que já estava em tela.
    }
  }, [janela, mesReferencia]);

  const carregarGavetaDe = useCallback(
    async (instancia: Instancia) => {
      setGavetas((prev) => ({
        ...prev,
        [instancia.id]: { ...(prev[instancia.id] || { lancamentos: [], totalJanela: 0 }), carregando: true },
      }));

      const pendentes = usuario ? await listarNaoConcluidas(usuario.id) : [];
      const otimistas = pendentes
        .filter((op) => op.payload.instanciaId === instancia.id)
        .map((op) => construirLancamentoOtimista(op, mesReferencia));

      try {
        const data = await api.get<{ lancamentos: Lancamento[]; totalJanela: number }>(
          `/api/lancamentos?instanciaId=${instancia.id}&mesReferencia=${mesReferencia}&janela=${janela}`
        );
        const sincronizados: LancamentoLocal[] = data.lancamentos.map((l) => ({ ...l, syncStatus: "synced" }));
        // Reconciliação pelo id (== uuid gerado no cliente == id definitivo
        // no servidor, ver enqueuarCriacaoLancamento/backend). Se o servidor
        // já confirmou, a versão dele manda — nunca mostra as duas
        // representações juntas. Existe uma janela real entre o POST ser
        // aceito e a operação sair da outbox (marcarSincronizado) em que
        // ambas as listas podem conter o mesmo id; dedupe por id resolve
        // isso sem nunca comparar nome/valor/descrição/data/instância.
        const idsConfirmados = new Set(sincronizados.map((l) => l.id));
        const otimistasAindaPendentes = otimistas.filter((o) => !idsConfirmados.has(o.id));
        setGavetas((prev) => ({
          ...prev,
          [instancia.id]: {
            lancamentos: [...otimistasAindaPendentes, ...sincronizados],
            totalJanela: data.totalJanela,
            carregando: false,
          },
        }));
        if (usuario) salvarSnapshot(`lancamentos:${instancia.id}`, usuario.id, data);
      } catch {
        // Offline: sem lista do servidor — complementa com o último
        // snapshot confirmado desta instância (não só o que já estava em
        // memória desde o mount, que se perde num cold start) mesclado com
        // os otimistas, mesma dedupe por id de cima. O total oficial vem
        // do snapshot/servidor, nunca recalculado no cliente.
        const snapshot = usuario
          ? await lerSnapshot<{ lancamentos: Lancamento[]; totalJanela: number }>(`lancamentos:${instancia.id}`, usuario.id)
          : null;

        if (snapshot) {
          const sincronizados: LancamentoLocal[] = snapshot.dados.lancamentos.map((l) => ({ ...l, syncStatus: "synced" }));
          const idsConfirmados = new Set(sincronizados.map((l) => l.id));
          const otimistasAindaPendentes = otimistas.filter((o) => !idsConfirmados.has(o.id));
          setGavetas((prev) => ({
            ...prev,
            [instancia.id]: {
              lancamentos: [...otimistasAindaPendentes, ...sincronizados],
              totalJanela: snapshot.dados.totalJanela,
              carregando: false,
            },
          }));
          return;
        }

        // Sem snapshot desta instância (nunca carregada com sucesso neste
        // aparelho): mostra pelo menos o que já estava em memória desde o
        // mount, ou só os otimistas.
        setGavetas((prev) => ({
          ...prev,
          [instancia.id]: {
            lancamentos: otimistas.length > 0 ? otimistas : prev[instancia.id]?.lancamentos ?? [],
            totalJanela: prev[instancia.id]?.totalJanela ?? 0,
            carregando: false,
          },
        }));
      }
    },
    [janela, mesReferencia, usuario]
  );

  const carregarTodasGavetas = useCallback(async () => {
    await Promise.all(instanciasDoGrupo.map((i) => carregarGavetaDe(i)));
  }, [instanciasDoGrupo, carregarGavetaDe]);

  useEffect(() => {
    carregarTodasGavetas();
  }, [carregarTodasGavetas]);

  useEffect(() => {
    carregarResumo();
  }, [carregarResumo]);

  // Quando um item pendente termina de sincronizar (a contagem cai), busca de
  // novo do servidor pra reconciliar totais/valores derivados (pagas, etc.).
  useEffect(() => {
    if (pendentesUsuario.length < pendentesAnterioresRef.current) {
      carregarTodasGavetas();
      carregarResumo();
    }
    pendentesAnterioresRef.current = pendentesUsuario.length;
  }, [pendentesUsuario.length, carregarTodasGavetas, carregarResumo]);

  // Entrada no ambiente prático (destino do botão "Lançar gasto/receita" de
  // qualquer instância) e também usada pela grade interna pra trocar de
  // instância sem sair da tela.
  function abrirFoco(instancia: Instancia) {
    setInstanciaFoco(instancia);
    setLancamentoEditando(null);
    setForm({ ...FORM_VAZIO, tipo: TIPO_PADRAO_POR_GRUPO[grupo], mesInicio: mesReferencia });
    setErroForm("");
    setEstado("foco");
  }

  function abrirEdicaoLancamento(instancia: Instancia, lancamento: Lancamento) {
    setInstanciaFoco(instancia);
    setLancamentoEditando(lancamento);
    setForm({
      descricao: lancamento.descricao,
      // O banco guarda o valor da parcela — abre em modo "Parcela" com esse
      // valor. O usuário pode trocar pra "Total" e digitar o total exato da
      // fatura, se preferir forçar o número a bater com o banco.
      valorCentavos: numeroParaCentavos(lancamento.valor),
      tipo: lancamento.tipo,
      mesInicio: lancamento.mesInicio,
      prazoMeses: lancamento.tipo === "temporario" ? lancamento.parcelas ?? 1 : 1,
      observacoes: lancamento.observacoes || "",
      modoValor: "parcela",
    });
    setErroForm("");
    setEstado("foco");
  }

  const parcelasCalculadas = form.tipo === "temporario" && form.prazoMeses ? form.prazoMeses : null;

  // Prévia local (mesma fórmula do backend, ver lib/parcelamento.ts) do
  // resultado do toggle "Total": exibida antes de salvar, feedback
  // imediato — o valor persistido sempre vem do backend.
  const planoPreview =
    form.tipo === "temporario" && form.modoValor === "total" && parcelasCalculadas && form.valorCentavos > 0
      ? calcularPlanoTemporarioPreview(centavosParaNumero(form.valorCentavos), parcelasCalculadas)
      : null;

  function voltarParaGeral() {
    setEstado("geral");
    setInstanciaFoco(null);
    setLancamentoEditando(null);
    setErroForm("");
  }

  async function criarInstancia(e: React.FormEvent) {
    e.preventDefault();
    if (!novaInstancia) return;
    await api.post<{ instancia: Instancia }>("/api/instancias", {
      nome: novaInstancia.nome,
      grupo,
      cor: novaInstancia.cor,
    });
    setNovaInstancia(null);
    await recarregar();
  }

  async function salvarEdicaoInstancia(e: React.FormEvent) {
    e.preventDefault();
    if (!instanciaEditando) return;
    await api.put(`/api/instancias/${instanciaEditando.id}`, {
      nome: instanciaEditando.nome,
      cor: instanciaEditando.cor,
    });
    setInstanciaEditando(null);
    await recarregar();
  }

  async function registrarLancamento(e: React.FormEvent, manterInstancia = false) {
    e.preventDefault();
    if (!instanciaFoco) return;
    setErroForm("");

    const erroValor = validarValorCentavos(form.valorCentavos);
    if (erroValor) {
      setErroForm(erroValor);
      return;
    }
    const valorNumerico = centavosParaNumero(form.valorCentavos);
    if (form.tipo === "temporario" && (!parcelasCalculadas || parcelasCalculadas < 1)) {
      setErroForm("Informe o prazo em meses.");
      return;
    }

    const payload = {
      instanciaId: instanciaFoco.id,
      descricao: form.descricao.trim() || descricaoAutomatica(),
      valor: valorNumerico,
      tipo: form.tipo,
      parcelas: form.tipo === "temporario" ? parcelasCalculadas : null,
      mesInicio: form.mesInicio,
      observacoes: form.observacoes || null,
      // Só faz sentido pra temporário — o backend ignora fora desse caso,
      // mas evita mandar o campo à toa pra um lançamento fixo.
      modoValor: form.tipo === "temporario" ? form.modoValor : undefined,
    };

    // Edição continua online-only nesta fase (só a criação é offline-first).
    if (lancamentoEditando) {
      setSalvando(true);
      try {
        await api.put(`/api/lancamentos/${lancamentoEditando.id}/completo`, payload);
        setForm({ ...FORM_VAZIO, tipo: TIPO_PADRAO_POR_GRUPO[grupo], mesInicio: mesReferencia });
        setLancamentoEditando(null);
        await Promise.all([carregarTodasGavetas(), carregarResumo()]);
      } catch (err) {
        setErroForm(err instanceof ApiError ? err.message : "Nao foi possivel salvar o lancamento.");
      } finally {
        setSalvando(false);
      }
      return;
    }

    if (!usuario) return;

    // Regra do seletor pós-lançamento: se o mês selecionado já enxerga o
    // lançamento recém-criado (tem parcela nele), mantém onde está; senão
    // pula pro mês de início do lançamento, pra ele ficar sempre visível no
    // demonstrativo.
    const mesAlvo = produzParcelaNoMes(form.mesInicio, form.tipo, parcelasCalculadas, mesReferencia)
      ? mesReferencia
      : form.mesInicio;

    // Criação: otimista. Entra na tela na hora, fica marcada como pendente,
    // e sincroniza sozinha (agora, se der, ou quando a rede voltar).
    const operacao = await enqueuarCriacaoLancamento(usuario.id, payload);
    if (mesAlvo === mesReferencia) {
      const otimista = construirLancamentoOtimista(operacao, mesAlvo);
      setGavetas((prev) => {
        const atual = prev[instanciaFoco.id] || { lancamentos: [], totalJanela: 0, carregando: false };
        return {
          ...prev,
          [instanciaFoco.id]: { ...atual, lancamentos: [otimista, ...atual.lancamentos] },
        };
      });
    } else {
      // Ao mudar mesReferencia, o efeito de carregamento de gavetas já
      // refaz a busca (servidor + otimistas) na janela nova — não precisa
      // remendar o estado local aqui.
      setMesReferencia(mesAlvo);
    }

    if (manterInstancia) {
      setForm((f) => ({ ...f, descricao: "", valorCentavos: 0 }));
    } else {
      setForm({ ...FORM_VAZIO, tipo: TIPO_PADRAO_POR_GRUPO[grupo], mesInicio: mesAlvo });
    }
    setErroForm("");
    tentarSincronizar(usuario.id);
  }

  async function excluirLancamento(id: string) {
    await api.delete(`/api/lancamentos/${id}`);
    await Promise.all([carregarTodasGavetas(), carregarResumo()]);
  }

  async function excluirInstancia() {
    if (!instanciaParaExcluir) return;
    await api.delete(`/api/instancias/${instanciaParaExcluir.id}`);
    if (instanciaFoco?.id === instanciaParaExcluir.id) {
      voltarParaGeral();
    }
    setInstanciaParaExcluir(null);
    await Promise.all([recarregar(), carregarResumo()]);
  }

  return (
    <div className="mx-auto max-w-3xl lg:max-w-5xl">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="font-brand text-2xl text-cream-100">Lançamentos</h1>
          <p className="text-xs text-cream-100/50">Referência: {formatarMesLabel(mesReferencia)}</p>
        </div>
        <div className="flex items-center gap-2">
          <SyncStatusBadge />
          <JanelaSelector />
        </div>
      </div>

      {resumo && (
        <div className="mb-4">
          <ResumoDashboard dados={resumo} compacto />
        </div>
      )}

      <div className="mb-4">
        <SeletorMesReferencia />
      </div>

      <div className="mb-6 flex gap-2">
        {(["gasto", "receita"] as Grupo[]).map((g) => (
          <button
            key={g}
            onClick={() => {
              setGrupo(g);
              voltarParaGeral();
            }}
            className={`min-h-[44px] flex-1 rounded-xl border text-sm font-medium ${
              grupo === g ? "border-gold-500 bg-gold-500/10 text-gold-300" : "border-navy-700 text-cream-100/70"
            }`}
          >
            {LABEL_GRUPO_BOTAO[g]}
          </button>
        ))}
      </div>

      {estado === "geral" && (
        <>
          <DndContext
            sensors={sensors}
            collisionDetection={collisionDetection}
            measuring={measuring}
            onDragStart={onDragStart}
            onDragMove={onDragMove}
            onDragEnd={onDragEnd}
            onDragCancel={onDragCancel}
          >
            <SortableContext items={instanciasDoGrupo.map((i) => i.id)} strategy={rectSortingStrategy}>
              <div className="mb-4">
                <ColunasMasonry
                  itens={instanciasDoGrupo}
                  indiceInsercao={indiceInsercao}
                  renderItem={(i) => (
                    <GavetaCardOrdenavel
                      key={i.id}
                      instancia={i}
                      dados={gavetas[i.id]}
                      mesReferencia={mesReferencia}
                      janela={janela}
                      labelLancar={LABEL_LANCAR[grupo]}
                      onLancar={() => abrirFoco(i)}
                      onEditarInstancia={() => setInstanciaEditando({ id: i.id, nome: i.nome, cor: i.cor })}
                      onExcluirInstancia={() => setInstanciaParaExcluir(i)}
                      onEditarLancamento={(l) => abrirEdicaoLancamento(i, l)}
                      onExcluirLancamento={excluirLancamento}
                      emArraste={emArraste}
                    />
                  )}
                />
              </div>
            </SortableContext>
            <DragOverlay>
              {itemAtivo && (
                <GavetaCard
                  instancia={itemAtivo}
                  dados={gavetas[itemAtivo.id]}
                  mesReferencia={mesReferencia}
                  janela={janela}
                  labelLancar={LABEL_LANCAR[grupo]}
                  onEditarInstancia={() => {}}
                  onExcluirInstancia={() => {}}
                  onEditarLancamento={() => {}}
                  onExcluirLancamento={() => {}}
                  solido
                />
              )}
            </DragOverlay>
          </DndContext>

          {instanciasDoGrupo.length === 0 && (
            <div className="card-dominium mb-4 p-6 text-center text-sm text-cream-100/70">
              Nenhuma instância de {grupo === "gasto" ? "gasto" : "receita"} ainda. Crie a primeira.
            </div>
          )}

          <button
            onClick={() => setNovaInstancia({ nome: "", cor: COR_SUGERIDA_POR_GRUPO[grupo] })}
            className="flex w-full items-center justify-center gap-1 rounded-full border border-dashed border-gold-500/50 px-4 py-3 text-sm text-gold-300"
          >
            <Plus size={16} /> Nova instância
          </button>
        </>
      )}

      {estado === "foco" && instanciaFoco && (
        <div>
          <button
            onClick={voltarParaGeral}
            className="mb-4 inline-flex items-center gap-1.5 rounded-xl border border-cream-100/25 bg-navy-800/40 px-3 py-2 text-sm font-medium text-cream-100/90 hover:border-cream-100/40 hover:text-cream-100"
          >
            <ArrowLeft size={18} /> Voltar
          </button>

          {/* Grade rápida de instâncias (mesmo padrão do Lançamento Rápido do
              Dashboard): permite trocar de instância sem voltar pra visão
              geral, sem duplicar a listagem completa de cada uma. */}
          <div className="mb-4">
            <p className="mb-2 text-sm text-cream-100/70">Instância</p>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {instanciasDoGrupo.map((i) => (
                <button
                  key={i.id}
                  type="button"
                  onClick={() => abrirFoco(i)}
                  className={`flex flex-col items-center gap-1 rounded-xl border p-2.5 text-center ${
                    instanciaFoco.id === i.id ? "border-gold-500 bg-gold-500/10" : "border-navy-700"
                  }`}
                >
                  <span className="h-3 w-3 rounded-full" style={{ background: i.cor }} />
                  <span className="w-full truncate text-[11px] text-cream-100/80">{i.nome}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-start">
            <form
              onSubmit={(e) => registrarLancamento(e, false)}
              className="card-dominium flex flex-col gap-4 p-5"
            >
              {form.tipo === "temporario" ? (
                <div>
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <label className="text-sm text-cream-100/80">Valor (selecione total ou parcela)</label>
                    <div className="flex shrink-0 gap-1.5">
                      <button
                        type="button"
                        onClick={() => setForm({ ...form, modoValor: "total" })}
                        className={`rounded-lg border px-2.5 py-1 text-xs font-medium ${
                          form.modoValor === "total"
                            ? "border-gold-500 text-gold-300"
                            : "border-navy-700 text-cream-100/60"
                        }`}
                      >
                        Total
                      </button>
                      <button
                        type="button"
                        onClick={() => setForm({ ...form, modoValor: "parcela" })}
                        className={`rounded-lg border px-2.5 py-1 text-xs font-medium ${
                          form.modoValor === "parcela"
                            ? "border-gold-500 text-gold-300"
                            : "border-navy-700 text-cream-100/60"
                        }`}
                      >
                        Parcela
                      </button>
                    </div>
                  </div>
                  <CampoMoeda
                    valorCentavos={form.valorCentavos}
                    onChange={(valorCentavos) => setForm({ ...form, valorCentavos })}
                    required
                  />
                </div>
              ) : (
                <CampoMoeda
                  label="Valor (parcela/mensalidade)"
                  valorCentavos={form.valorCentavos}
                  onChange={(valorCentavos) => setForm({ ...form, valorCentavos })}
                  required
                />
              )}

              {planoPreview && (
                <p className="-mt-2 text-xs text-cream-100/50">
                  {formatarMoeda(centavosParaNumero(form.valorCentavos))} em {planoPreview.parcelas}x → parcela{" "}
                  {formatarMoeda(planoPreview.valorParcela)}
                  {planoPreview.valorUltimaParcela != null &&
                    `, última ${formatarMoeda(planoPreview.valorUltimaParcela)}`}
                </p>
              )}

              {form.tipo === "temporario" && form.modoValor === "total" && (
                <p className="-mt-2 text-xs text-cream-100/40">
                  Alguns bancos distribuem os centavos de forma diferente. Se o valor da parcela no seu app bancário
                  estiver um pouco diferente, toque em Parcela e insira o valor exato.
                </p>
              )}

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setForm({ ...form, tipo: "temporario" })}
                  className={`min-h-[44px] rounded-xl border text-sm ${
                    form.tipo === "temporario"
                      ? "border-gold-500 text-gold-300"
                      : "border-navy-700 text-cream-100/60"
                  }`}
                >
                  Temporário
                </button>
                <button
                  type="button"
                  onClick={() => setForm({ ...form, tipo: "fixo", modoValor: "parcela" })}
                  className={`min-h-[44px] rounded-xl border text-sm ${
                    form.tipo === "fixo" ? "border-gold-500 text-gold-300" : "border-navy-700 text-cream-100/60"
                  }`}
                >
                  Fixo
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <CampoMes
                  label="Mês início"
                  value={form.mesInicio}
                  onChange={(v) => setForm({ ...form, mesInicio: v })}
                />
                <CampoPrazoMeses
                  label="Prazo (meses)"
                  value={form.prazoMeses}
                  onChange={(v) => setForm({ ...form, prazoMeses: v })}
                  disabled={form.tipo === "fixo"}
                />
              </div>

              {form.tipo === "temporario" && (
                <p className="-mt-2 text-xs text-cream-100/50">
                  {parcelasCalculadas && parcelasCalculadas >= 1
                    ? `${parcelasCalculadas} parcela${parcelasCalculadas === 1 ? "" : "s"} · termina em ${formatarMesLabel(
                        somarMeses(form.mesInicio, parcelasCalculadas - 1)
                      )}.`
                    : "Informe o prazo em meses."}
                </p>
              )}

              <div>
                <label className="mb-1 block text-sm text-cream-100/80">
                  {grupo === "gasto" ? "Descrição do Gasto" : "Descrição da Receita"}
                </label>
                <div className="relative">
                  <input
                    className="input-dominium pr-28"
                    value={form.descricao}
                    onChange={(e) => setForm({ ...form, descricao: e.target.value })}
                    placeholder="Sem descrição."
                  />
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, descricao: inserirDataDeHoje(form.descricao) })}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg border border-cream-100/25 bg-navy-800/60 px-2 py-1 text-[11px] font-medium text-cream-100/70 hover:border-cream-100/40 hover:bg-navy-800 hover:text-cream-100"
                  >
                    Inserir data
                  </button>
                </div>
              </div>

              {erroForm && <p className="text-sm text-danger">{erroForm}</p>}

              {lancamentoEditando ? (
                <button type="submit" className="btn-gold" disabled={salvando}>
                  {salvando ? "Salvando alteração..." : "Alterar lançamento"}
                </button>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <button type="submit" className="btn-gold min-h-[44px] text-sm" disabled={salvando}>
                    {salvando ? "Salvando..." : "Salvar registro"}
                  </button>
                  <button
                    type="button"
                    onClick={(e) => registrarLancamento(e, true)}
                    disabled={salvando}
                    className="min-h-[44px] rounded-xl border border-gold-500/60 text-sm text-gold-300"
                  >
                    Salvar e lançar outro
                  </button>
                </div>
              )}
            </form>

            <GavetaCard
              instancia={instanciaFoco}
              dados={gavetas[instanciaFoco.id]}
              mesReferencia={mesReferencia}
              janela={janela}
              onEditarInstancia={() =>
                setInstanciaEditando({ id: instanciaFoco.id, nome: instanciaFoco.nome, cor: instanciaFoco.cor })
              }
              onExcluirInstancia={() => setInstanciaParaExcluir(instanciaFoco)}
              onEditarLancamento={(l) => abrirEdicaoLancamento(instanciaFoco, l)}
              onExcluirLancamento={excluirLancamento}
              sticky
            />
          </div>
        </div>
      )}

      {novaInstancia && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center">
          <form onSubmit={criarInstancia} className="card-dominium w-full max-w-sm rounded-b-none p-5 sm:rounded-b-2xl">
            <h2 className="mb-4 font-brand text-lg text-cream-100">Nova instância</h2>
            <div className="mb-4">
              <label className="mb-1 block text-sm text-cream-100/80">Nome</label>
              <input
                className="input-dominium"
                value={novaInstancia.nome}
                onChange={(e) => setNovaInstancia({ ...novaInstancia, nome: e.target.value })}
                required
                autoFocus
              />
            </div>
            <div className="mb-5">
              <label className="mb-2 block text-sm text-cream-100/80">Cor</label>
              <div className="flex flex-wrap gap-2">
                {PALETA_INSTANCIA.map((cor) => (
                  <button
                    type="button"
                    key={cor}
                    onClick={() => setNovaInstancia({ ...novaInstancia, cor })}
                    className="h-8 w-8 rounded-full border-2"
                    style={{ background: cor, borderColor: novaInstancia.cor === cor ? "#F7F5F0" : "transparent" }}
                  />
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setNovaInstancia(null)}
                className="flex-1 rounded-xl border border-navy-700 py-3 text-sm text-cream-100/70"
              >
                Cancelar
              </button>
              <button type="submit" className="btn-gold flex-1">
                Criar
              </button>
            </div>
          </form>
        </div>
      )}

      {instanciaEditando && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center">
          <form onSubmit={salvarEdicaoInstancia} className="card-dominium w-full max-w-sm rounded-b-none p-5 sm:rounded-b-2xl">
            <h2 className="mb-4 font-brand text-lg text-cream-100">Editar instância</h2>
            <div className="mb-4">
              <label className="mb-1 block text-sm text-cream-100/80">Nome</label>
              <input
                className="input-dominium"
                value={instanciaEditando.nome}
                onChange={(e) => setInstanciaEditando({ ...instanciaEditando, nome: e.target.value })}
                required
                autoFocus
              />
            </div>
            <div className="mb-5">
              <label className="mb-2 block text-sm text-cream-100/80">Cor</label>
              <div className="flex flex-wrap gap-2">
                {PALETA_INSTANCIA.map((cor) => (
                  <button
                    type="button"
                    key={cor}
                    onClick={() => setInstanciaEditando({ ...instanciaEditando, cor })}
                    className="h-8 w-8 rounded-full border-2"
                    style={{ background: cor, borderColor: instanciaEditando.cor === cor ? "#F7F5F0" : "transparent" }}
                  />
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setInstanciaEditando(null)}
                className="flex-1 rounded-xl border border-navy-700 py-3 text-sm text-cream-100/70"
              >
                Cancelar
              </button>
              <button type="submit" className="btn-gold flex-1">
                Salvar
              </button>
            </div>
          </form>
        </div>
      )}

      {instanciaParaExcluir && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="card-dominium w-full max-w-sm p-5 text-center">
            <p className="mb-4 text-sm text-cream-100">
              Excluir &quot;{instanciaParaExcluir.nome}&quot;? Todos os lançamentos e pagamentos vinculados
              serão apagados junto.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setInstanciaParaExcluir(null)}
                className="flex-1 rounded-xl border border-navy-700 py-3 text-sm text-cream-100/70"
              >
                Cancelar
              </button>
              <button onClick={excluirInstancia} className="flex-1 rounded-xl bg-danger py-3 text-sm font-medium text-cream-100">
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}

      {erroOrdenacao && <Toast mensagem={erroOrdenacao} tipo="erro" onFechar={limparErroOrdenacao} />}
    </div>
  );
}

const LABEL_JANELA: Record<string, string> = { mes: "no mês", "3m": "em 3 meses", "6m": "em 6 meses", "12m": "em 12 meses" };

type ArrasteProps = {
  setNodeRef: (node: HTMLElement | null) => void;
  style: React.CSSProperties;
  attributes: ReturnType<typeof useSortable>["attributes"];
  listeners: ReturnType<typeof useSortable>["listeners"];
  isDragging: boolean;
};

// Wrapper que só existe pra chamar useSortable — GavetaCard também é usado
// fora de um SortableContext (a versão sticky do estado "foco", um card
// único, não arrastável), então o hook não pode viver dentro dele.
//
// `emArraste` (true enquanto QUALQUER card estiver sendo arrastado, vindo
// de useOrdenacaoArrastavel) suprime o transform aqui — é isso que faz os
// cards de fundo ficarem parados durante o arraste. Assim que o drag
// termina e a sequência muda, `emArraste` volta a false e o transform do
// dnd-kit (agora o delta do FLIP pós-reorder, não mais o preview ao vivo)
// volta a ser aplicado, dando o reflow único e firme só ao soltar.
function GavetaCardOrdenavel(
  props: Omit<React.ComponentProps<typeof GavetaCard>, "arraste"> & { emArraste: boolean }
) {
  const { emArraste, ...resto } = props;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: props.instancia.id,
    transition: TRANSICAO_FIRME,
  });
  const arraste: ArrasteProps = {
    setNodeRef,
    style: { transform: emArraste ? undefined : CSS.Transform.toString(transform), transition },
    attributes,
    listeners,
    isDragging,
  };
  return <GavetaCard {...resto} arraste={arraste} />;
}

function GavetaCard({
  instancia,
  dados,
  mesReferencia,
  janela,
  labelLancar,
  onLancar,
  onEditarInstancia,
  onExcluirInstancia,
  onEditarLancamento,
  onExcluirLancamento,
  sticky,
  arraste,
  solido,
}: {
  instancia: Instancia;
  dados?: DadosGaveta;
  mesReferencia?: string;
  janela?: string;
  labelLancar?: string;
  onLancar?: () => void;
  onEditarInstancia: () => void;
  onExcluirInstancia: () => void;
  onEditarLancamento: (l: LancamentoLocal) => void;
  onExcluirLancamento: (id: string) => void;
  sticky?: boolean;
  arraste?: ArrasteProps;
  // Cópia sólida renderizada dentro do <DragOverlay> — sempre opaca, do
  // mesmo tamanho, com sombra de "flutuando". O card original na lista (que
  // continua sendo transformado no próprio lugar pelo SortableContext) vira
  // só um placeholder esmaecido enquanto isso, nunca os dois "sólidos" ao
  // mesmo tempo.
  solido?: boolean;
}) {
  const lancamentos = dados?.lancamentos || [];
  const totalJanela = dados?.totalJanela || 0;
  const carregando = dados?.carregando ?? true;

  return (
    <div
      ref={arraste?.setNodeRef}
      style={arraste?.style}
      className={`card-dominium p-4 ${sticky ? "lg:sticky lg:top-8" : ""} ${
        solido ? "shadow-2xl shadow-black/50" : arraste?.isDragging ? "opacity-30" : ""
      }`}
    >
      <div className="mb-1 flex items-center gap-2">
        {arraste && <AlcaArrastar attributes={arraste.attributes} listeners={arraste.listeners} />}
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: instancia.cor }} />
        <p className="min-w-0 flex-1 truncate text-sm font-medium" style={{ color: instancia.cor }}>
          {instancia.nome}
          {mesReferencia && (
            <span className="font-normal text-cream-100/50"> ({formatarMesInline(mesReferencia)})</span>
          )}
        </p>
        <button
          onClick={onEditarInstancia}
          className="p-1 text-cream-100/40 hover:text-gold-300"
          aria-label="Editar instância"
        >
          <Pencil size={14} />
        </button>
        <button
          onClick={onExcluirInstancia}
          className="p-1 text-cream-100/40 hover:text-danger"
          aria-label="Excluir instância"
        >
          <Trash2 size={14} />
        </button>
      </div>

      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="tabular text-lg font-semibold text-cream-100">
            {formatarMoeda(totalJanela)}{" "}
            <span className="text-xs font-normal text-cream-100/50">
              · {lancamentos.length} lançamento{lancamentos.length === 1 ? "" : "s"}
            </span>
          </p>
          {mesReferencia && (
            <p className="text-[11px] text-cream-100/40">
              {LABEL_JANELA[janela || "mes"]} a partir de {formatarMesLabel(mesReferencia)}
            </p>
          )}
        </div>
        {onLancar && labelLancar && (
          <button
            onClick={onLancar}
            className="shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium"
            style={{ borderColor: instancia.cor, color: instancia.cor }}
          >
            {labelLancar}
          </button>
        )}
      </div>

      {!carregando && lancamentos.length === 0 && (
        <p className="py-3 text-center text-sm text-cream-100/50">Sem lançamentos.</p>
      )}

      <div className="flex flex-col gap-2">
        {lancamentos.map((l) => {
          const sincronizado = !l.syncStatus || l.syncStatus === "synced";
          return (
            <div
              key={l.id}
              className={`flex items-center gap-3 border-t border-navy-700 pt-2 first:border-t-0 first:pt-0 ${
                sincronizado ? "" : "opacity-60"
              }`}
            >
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 truncate text-sm text-cream-100">
                  {l.descricao}
                  {!sincronizado && (
                    <span className="flex shrink-0 items-center gap-1 text-[10px] font-normal text-gold-300/80">
                      <Clock size={11} />
                      {l.syncStatus === "failed" ? "falha ao sincronizar" : "pendente"}
                    </span>
                  )}
                </p>
                {l.tipo === "fixo" ? (
                  <p className="tabular text-xs text-cream-100/60">{formatarMoeda(l.valor)}/mês · FIXO</p>
                ) : (
                  <>
                    <p className="tabular text-xs text-cream-100/60">
                      {formatarMoeda(l.valorParcela ?? l.valor)}/parcela · {l.parcelaAtual}/{l.parcelas} · resta{" "}
                      {formatarMoeda(l.totalRestante || 0)}
                    </p>
                    {/* Total da compra: (parcelas-1)*valor + (valorUltimaParcela ?? valor) —
                        mesma álgebra de projetarLancamentoNaJanela aplicada ao intervalo
                        completo, não a uma janela. valorUltimaParcela null (lançamentos
                        antigos, ou parcelas divididas sem resíduo) cai em valor pra todas. */}
                    {l.parcelas != null && (
                      <p className="tabular text-[11px] text-cream-100/40">
                        Total da compra: {formatarMoeda((l.parcelas - 1) * l.valor + (l.valorUltimaParcela ?? l.valor))}
                      </p>
                    )}
                  </>
                )}
              </div>
              {sincronizado && (
                <>
                  <button
                    onClick={() => onEditarLancamento(l)}
                    className="p-2 text-cream-100/40 hover:text-gold-300"
                    aria-label="Editar lançamento"
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    onClick={() => onExcluirLancamento(l.id)}
                    className="p-2 text-cream-100/40 hover:text-danger"
                    aria-label="Excluir lançamento"
                  >
                    <Trash2 size={15} />
                  </button>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Pencil, Plus, Trash2 } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { useInstancias } from "@/contexts/InstanciasContext";
import { useRecorte } from "@/contexts/RecorteContext";
import { JanelaSelector } from "@/components/dominium/JanelaSelector";
import { ResumoDashboard } from "@/components/dominium/ResumoDashboard";
import { CampoMoeda } from "@/components/dominium/CampoMoeda";
import { formatarMoeda } from "@/lib/format";
import { mesAtual } from "@/lib/mes";
import { centavosParaNumero, numeroParaCentavos } from "@/lib/moeda";
import { PALETA_INSTANCIA, COR_SUGERIDA_POR_GRUPO } from "@/lib/cores";
import type { DashboardData, Grupo, Instancia, Lancamento, TipoLancamento } from "@/lib/types";

const FORM_VAZIO = {
  descricao: "",
  valorCentavos: 0,
  tipo: "fixo" as TipoLancamento,
  parcelas: "",
  mesInicio: mesAtual(),
  observacoes: "",
};

type DadosGaveta = { lancamentos: Lancamento[]; totalJanela: number; carregando: boolean };

const LABEL_LANCAR: Record<Grupo, string> = {
  gasto: "Lançar gasto",
  receita: "Lançar receita",
  investimento: "Lançar",
};

export default function LancamentosPage() {
  const { instancias, recarregar } = useInstancias();
  const { janela } = useRecorte();

  const [grupo, setGrupo] = useState<Grupo>("gasto");
  const [estado, setEstado] = useState<"geral" | "foco">("geral");
  const [instanciaFoco, setInstanciaFoco] = useState<Instancia | null>(null);
  const [novaInstancia, setNovaInstancia] = useState<{ nome: string; cor: string } | null>(null);
  const [instanciaParaExcluir, setInstanciaParaExcluir] = useState<Instancia | null>(null);

  const [form, setForm] = useState(FORM_VAZIO);
  const [erroForm, setErroForm] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [editando, setEditando] = useState<{ id: string; valorCentavos: number } | null>(null);

  const [gavetas, setGavetas] = useState<Record<string, DadosGaveta>>({});
  const [resumo, setResumo] = useState<DashboardData | null>(null);

  const instanciasDoGrupo = useMemo(
    () => instancias.filter((i) => i.grupo === grupo && i.ativa),
    [instancias, grupo]
  );

  const carregarResumo = useCallback(async () => {
    const data = await api.get<DashboardData>(`/api/dashboard?janela=${janela}`);
    setResumo(data);
  }, [janela]);

  const carregarGavetaDe = useCallback(
    async (instancia: Instancia) => {
      setGavetas((prev) => ({
        ...prev,
        [instancia.id]: { ...(prev[instancia.id] || { lancamentos: [], totalJanela: 0 }), carregando: true },
      }));
      const data = await api.get<{ lancamentos: Lancamento[]; totalJanela: number }>(
        `/api/lancamentos?instanciaId=${instancia.id}&mesReferencia=${mesAtual()}&janela=${janela}`
      );
      setGavetas((prev) => ({
        ...prev,
        [instancia.id]: { lancamentos: data.lancamentos, totalJanela: data.totalJanela, carregando: false },
      }));
    },
    [janela]
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

  function abrirFoco(instancia: Instancia) {
    setInstanciaFoco(instancia);
    setForm(FORM_VAZIO);
    setErroForm("");
    setEstado("foco");
  }

  function voltarParaGeral() {
    setEstado("geral");
    setInstanciaFoco(null);
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

  async function registrarLancamento(e: React.FormEvent) {
    e.preventDefault();
    if (!instanciaFoco) return;
    setErroForm("");

    const valorNumerico = centavosParaNumero(form.valorCentavos);
    if (!valorNumerico || valorNumerico <= 0) {
      setErroForm("Informe um valor maior que zero.");
      return;
    }
    if (form.tipo === "temporario" && (!form.parcelas || parseInt(form.parcelas, 10) < 1)) {
      setErroForm("Informe o numero de parcelas (minimo 1).");
      return;
    }

    setSalvando(true);
    try {
      await api.post("/api/lancamentos", {
        instanciaId: instanciaFoco.id,
        descricao: form.descricao,
        valor: valorNumerico,
        tipo: form.tipo,
        parcelas: form.tipo === "temporario" ? parseInt(form.parcelas, 10) : null,
        mesInicio: form.mesInicio,
        observacoes: form.observacoes || null,
      });
      setForm(FORM_VAZIO);
      await Promise.all([carregarTodasGavetas(), carregarResumo()]);
      voltarParaGeral();
    } catch (err) {
      setErroForm(err instanceof ApiError ? err.message : "Nao foi possivel salvar o lancamento.");
    } finally {
      setSalvando(false);
    }
  }

  async function excluirLancamento(id: string) {
    await api.delete(`/api/lancamentos/${id}`);
    await Promise.all([carregarTodasGavetas(), carregarResumo()]);
  }

  async function salvarEdicao() {
    if (!editando) return;
    const valorNumerico = centavosParaNumero(editando.valorCentavos);
    if (!valorNumerico || valorNumerico <= 0) return;
    await api.put(`/api/lancamentos/${editando.id}`, { valor: valorNumerico });
    setEditando(null);
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
        <h1 className="font-brand text-2xl text-cream-100">Lançamentos</h1>
        <JanelaSelector />
      </div>

      {resumo && (
        <div className="mb-4">
          <ResumoDashboard dados={resumo} compacto />
        </div>
      )}

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
            {g === "gasto" ? "Gasto" : "Receita"}
          </button>
        ))}
      </div>

      {estado === "geral" && (
        <>
          <div className="mb-4 grid grid-cols-1 items-start gap-4 sm:grid-cols-2">
            {instanciasDoGrupo.map((i) => (
              <GavetaCard
                key={i.id}
                instancia={i}
                grupo={grupo}
                dados={gavetas[i.id]}
                labelLancar={LABEL_LANCAR[grupo]}
                onLancar={() => abrirFoco(i)}
                onExcluirInstancia={() => setInstanciaParaExcluir(i)}
                editando={editando}
                setEditando={setEditando}
                onSalvarEdicao={salvarEdicao}
                onExcluirLancamento={excluirLancamento}
              />
            ))}
          </div>

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
            className="mb-4 flex items-center gap-1 text-sm text-cream-100/70 hover:text-gold-300"
          >
            <ArrowLeft size={16} /> Voltar
          </button>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-start">
            <form onSubmit={registrarLancamento} className="card-dominium flex flex-col gap-4 p-5">
              <div>
                <label className="mb-1 block text-sm text-cream-100/80">Descrição</label>
                <input
                  className="input-dominium"
                  value={form.descricao}
                  onChange={(e) => setForm({ ...form, descricao: e.target.value })}
                  required
                  autoFocus
                />
              </div>

              <CampoMoeda
                label="Valor (parcela/mensalidade)"
                valorCentavos={form.valorCentavos}
                onChange={(valorCentavos) => setForm({ ...form, valorCentavos })}
                required
              />

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setForm({ ...form, tipo: "fixo", parcelas: "" })}
                  className={`min-h-[44px] rounded-xl border text-sm ${
                    form.tipo === "fixo" ? "border-gold-500 text-gold-300" : "border-navy-700 text-cream-100/60"
                  }`}
                >
                  Fixo
                </button>
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
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm text-cream-100/80">Mês início</label>
                  <input
                    className="input-dominium"
                    type="month"
                    value={form.mesInicio}
                    onChange={(e) => setForm({ ...form, mesInicio: e.target.value })}
                    required
                  />
                </div>
                {form.tipo === "temporario" && (
                  <div>
                    <label className="mb-1 block text-sm text-cream-100/80">Nº parcelas</label>
                    <input
                      className="input-dominium"
                      inputMode="numeric"
                      value={form.parcelas}
                      onChange={(e) => setForm({ ...form, parcelas: e.target.value })}
                      required
                    />
                  </div>
                )}
              </div>

              <div>
                <label className="mb-1 block text-sm text-cream-100/80">Observações (opcional)</label>
                <input
                  className="input-dominium"
                  value={form.observacoes}
                  onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
                />
              </div>

              {erroForm && <p className="text-sm text-danger">{erroForm}</p>}

              <button type="submit" className="btn-gold" disabled={salvando}>
                {salvando ? "Registrando..." : "Registrar lançamento"}
              </button>
            </form>

            <GavetaCard
              instancia={instanciaFoco}
              grupo={grupo}
              dados={gavetas[instanciaFoco.id]}
              onExcluirInstancia={() => setInstanciaParaExcluir(instanciaFoco)}
              editando={editando}
              setEditando={setEditando}
              onSalvarEdicao={salvarEdicao}
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
    </div>
  );
}

function GavetaCard({
  instancia,
  grupo,
  dados,
  labelLancar,
  onLancar,
  onExcluirInstancia,
  editando,
  setEditando,
  onSalvarEdicao,
  onExcluirLancamento,
  sticky,
}: {
  instancia: Instancia;
  grupo: Grupo;
  dados?: DadosGaveta;
  labelLancar?: string;
  onLancar?: () => void;
  onExcluirInstancia: () => void;
  editando: { id: string; valorCentavos: number } | null;
  setEditando: (v: { id: string; valorCentavos: number } | null) => void;
  onSalvarEdicao: () => void;
  onExcluirLancamento: (id: string) => void;
  sticky?: boolean;
}) {
  const lancamentos = dados?.lancamentos || [];
  const totalJanela = dados?.totalJanela || 0;
  const carregando = dados?.carregando ?? true;

  return (
    <div className={`card-dominium p-4 ${sticky ? "lg:sticky lg:top-8" : ""}`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: instancia.cor }} />
            <p className="truncate text-sm font-medium" style={{ color: instancia.cor }}>
              {instancia.nome}
            </p>
          </div>
          <p className="tabular text-lg font-semibold text-cream-100">
            {formatarMoeda(totalJanela)}{" "}
            <span className="text-xs font-normal text-cream-100/50">
              · {lancamentos.length} lançamento{lancamentos.length === 1 ? "" : "s"}
            </span>
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {onLancar && labelLancar && (
            <button
              onClick={onLancar}
              className="rounded-full border px-3 py-1.5 text-xs font-medium"
              style={{ borderColor: instancia.cor, color: instancia.cor }}
            >
              {labelLancar}
            </button>
          )}
          <button
            onClick={onExcluirInstancia}
            className="p-2 text-cream-100/40 hover:text-danger"
            aria-label="Excluir instância"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      {!carregando && lancamentos.length === 0 && (
        <p className="py-3 text-center text-sm text-cream-100/50">Sem lançamentos.</p>
      )}

      <div className="flex flex-col gap-2 lg:max-h-[calc(100vh-14rem)] lg:overflow-y-auto lg:pr-1">
        {lancamentos.map((l) => (
          <div key={l.id} className="flex items-center gap-3 border-t border-navy-700 pt-2 first:border-t-0 first:pt-0">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-cream-100">{l.descricao}</p>
              {l.tipo === "fixo" ? (
                <p className="tabular text-xs text-cream-100/60">{formatarMoeda(l.valor)}/mês · FIXO</p>
              ) : (
                <p className="tabular text-xs text-cream-100/60">
                  {formatarMoeda(l.valor)}/parcela · {l.restantes}/{l.parcelas} restantes · resta{" "}
                  {formatarMoeda(l.totalRestante || 0)}
                </p>
              )}
            </div>
            {editando?.id === l.id ? (
              <div className="flex items-center gap-1">
                <CampoMoeda
                  compacto
                  valorCentavos={editando.valorCentavos}
                  onChange={(valorCentavos) => setEditando({ id: l.id, valorCentavos })}
                  autoFocus
                />
                <button onClick={onSalvarEdicao} className="text-xs text-gold-300">
                  OK
                </button>
              </div>
            ) : (
              <button
                onClick={() => setEditando({ id: l.id, valorCentavos: numeroParaCentavos(l.valor) })}
                className="p-2 text-cream-100/40 hover:text-gold-300"
                aria-label="Editar valor"
              >
                <Pencil size={15} />
              </button>
            )}
            <button
              onClick={() => onExcluirLancamento(l.id)}
              className="p-2 text-cream-100/40 hover:text-danger"
              aria-label="Excluir lançamento"
            >
              <Trash2 size={15} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

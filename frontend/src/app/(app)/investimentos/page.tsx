"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, Palette, Pencil, Plus, Trash2 } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { useInstancias } from "@/contexts/InstanciasContext";
import { CampoMoeda } from "@/components/dominium/CampoMoeda";
import { CampoMes } from "@/components/dominium/CampoMes";
import { CampoPrazoMeses } from "@/components/dominium/CampoPrazoMeses";
import { formatarMoeda } from "@/lib/format";
import { diferencaEmMeses, formatarMesLabel, mesAtual, somarMeses } from "@/lib/mes";
import { centavosParaNumero, numeroParaCentavos } from "@/lib/moeda";
import { PALETA_INSTANCIA } from "@/lib/cores";
import type { Aporte, ContaInvestimento, Instancia, Subgrupo, TipoLancamento } from "@/lib/types";

const LABEL_SUBGRUPO: Record<Subgrupo, string> = { pessoal: "Reserva Pessoal", patrimonial: "Reserva Patrimonial" };
const COR_SUGERIDA: Record<Subgrupo, string> = { pessoal: "#B368E0", patrimonial: "#4CAF7D" };
const PALETA_INSTANCIA_CURTA = PALETA_INSTANCIA.slice(0, 7);

const FORM_VAZIO = {
  descricao: "",
  valorCentavos: 0,
  tipo: "fixo" as TipoLancamento,
  mesInicio: mesAtual(),
  mesFim: "",
  observacoes: "",
};

export default function InvestimentosPage() {
  const { recarregar: recarregarInstancias } = useInstancias();

  const [subgrupo, setSubgrupo] = useState<Subgrupo>("pessoal");
  const [contas, setContas] = useState<ContaInvestimento[]>([]);
  const [carregando, setCarregando] = useState(true);

  const [estado, setEstado] = useState<"geral" | "foco">("geral");
  const [contaFoco, setContaFoco] = useState<ContaInvestimento | null>(null);
  const [aporteEditando, setAporteEditando] = useState<Aporte | null>(null);
  const [form, setForm] = useState(FORM_VAZIO);
  const [erroForm, setErroForm] = useState("");
  const [salvando, setSalvando] = useState(false);

  const [modalProjeto, setModalProjeto] = useState<
    { modo: "criar" } | { modo: "editar"; conta: ContaInvestimento; aporte: Aporte | null } | null
  >(null);
  const [contaParaExcluir, setContaParaExcluir] = useState<Instancia | null>(null);
  const [modalResgate, setModalResgate] = useState<ContaInvestimento | null>(null);
  const [modalOpcoes, setModalOpcoes] = useState<ContaInvestimento | null>(null);
  const [modalMigrar, setModalMigrar] = useState<ContaInvestimento | null>(null);
  const [modalAtualizarValor, setModalAtualizarValor] = useState<ContaInvestimento | null>(null);
  const [modalLancarValor, setModalLancarValor] = useState<{ conta: ContaInvestimento; aporteMeta: Aporte } | null>(
    null
  );

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const data = await api.get<{ contas: ContaInvestimento[] }>(`/api/investimentos?subgrupo=${subgrupo}`);
      setContas(data.contas);
    } finally {
      setCarregando(false);
    }
  }, [subgrupo]);

  useEffect(() => {
    carregar();
    setEstado("geral");
  }, [carregar]);

  const patrimonioTotal = useMemo(() => contas.reduce((acc, c) => acc + c.patrimonio, 0), [contas]);

  function abrirFoco(conta: ContaInvestimento) {
    setContaFoco(conta);
    setAporteEditando(null);
    setForm({ ...FORM_VAZIO, mesInicio: mesAtual() });
    setErroForm("");
    setEstado("foco");
  }

  function abrirEdicaoAporte(conta: ContaInvestimento, aporte: Aporte) {
    setContaFoco(conta);
    setAporteEditando(aporte);
    setForm({
      descricao: aporte.descricao,
      valorCentavos: numeroParaCentavos(aporte.valor),
      tipo: aporte.tipo,
      mesInicio: aporte.mesInicio,
      mesFim:
        aporte.tipo === "temporario"
          ? aporte.mesFim || somarMeses(aporte.mesInicio, (aporte.parcelas || 1) - 1)
          : "",
      observacoes: aporte.observacoes || "",
    });
    setErroForm("");
    setEstado("foco");
  }

  function voltarParaGeral() {
    setEstado("geral");
    setContaFoco(null);
    setAporteEditando(null);
    setErroForm("");
  }

  // Aportes com meta so podem ser editados pelo formulario com meta/parcelas
  // (ModalProjeto) — o formulario simples (valor+parcelas direto) quebraria a
  // invariante de que a soma das parcelas sempre fecha em valorMeta.
  function abrirEdicaoValor(conta: ContaInvestimento, aporte: Aporte) {
    if (aporte.valorMeta != null) {
      setModalProjeto({ modo: "editar", conta, aporte });
    } else {
      abrirEdicaoAporte(conta, aporte);
    }
  }

  const parcelasCalculadas =
    form.tipo === "temporario" && form.mesInicio && form.mesFim
      ? diferencaEmMeses(form.mesInicio, form.mesFim) + 1
      : null;

  async function excluirConta() {
    if (!contaParaExcluir) return;
    await api.delete(`/api/instancias/${contaParaExcluir.id}`);
    setContaParaExcluir(null);
    if (contaFoco?.id === contaParaExcluir.id) voltarParaGeral();
    await Promise.all([recarregarInstancias(), carregar()]);
  }

  async function salvarAporte(e: React.FormEvent) {
    e.preventDefault();
    if (!contaFoco) return;
    setErroForm("");

    const valorNumerico = centavosParaNumero(form.valorCentavos);
    if (!valorNumerico || valorNumerico <= 0) {
      setErroForm("Informe um valor maior que zero.");
      return;
    }
    if (form.tipo === "temporario" && (!parcelasCalculadas || parcelasCalculadas < 1)) {
      setErroForm("Mês fim precisa ser igual ou posterior ao mês início.");
      return;
    }

    const payload = {
      instanciaId: contaFoco.id,
      descricao: form.descricao,
      valor: valorNumerico,
      tipo: form.tipo,
      parcelas: form.tipo === "temporario" ? parcelasCalculadas : null,
      mesInicio: form.mesInicio,
      observacoes: form.observacoes || null,
    };

    setSalvando(true);
    try {
      if (aporteEditando) {
        await api.put(`/api/investimentos/aporte/${aporteEditando.id}`, payload);
      } else {
        await api.post("/api/investimentos/aporte", payload);
      }
      await carregar();
      voltarParaGeral();
    } catch (err) {
      setErroForm(err instanceof ApiError ? err.message : "Nao foi possivel salvar o aporte.");
    } finally {
      setSalvando(false);
    }
  }

  async function excluirAporte(id: string) {
    await api.delete(`/api/investimentos/aporte/${id}`);
    await carregar();
  }

  async function excluirResgate(id: string) {
    await api.delete(`/api/investimentos/resgate/${id}`);
    await carregar();
  }

  async function excluirValorExtra(id: string) {
    await api.delete(`/api/investimentos/valor-extra/${id}`);
    await carregar();
  }

  async function concluirProjeto(conta: ContaInvestimento) {
    await api.patch(`/api/instancias/${conta.id}/ativa`);
    setModalOpcoes(null);
    if (contaFoco?.id === conta.id) voltarParaGeral();
    await Promise.all([recarregarInstancias(), carregar()]);
  }

  return (
    <div className="mx-auto max-w-3xl lg:max-w-5xl">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="font-brand text-2xl text-cream-100">Reserva</h1>
      </div>

      <div className="mb-4 flex gap-2">
        {(["pessoal", "patrimonial"] as Subgrupo[]).map((s) => (
          <button
            key={s}
            onClick={() => setSubgrupo(s)}
            className={`min-h-[44px] flex-1 rounded-xl border text-sm font-medium ${
              subgrupo === s ? "border-gold-500 bg-gold-500/10 text-gold-300" : "border-navy-700 text-cream-100/70"
            }`}
          >
            {LABEL_SUBGRUPO[s]}
          </button>
        ))}
      </div>

      <div className="card-dominium mb-6 p-4 text-center">
        <p className="text-xs text-cream-100/60">{LABEL_SUBGRUPO[subgrupo]} — total</p>
        <p className="tabular text-gold-gradient text-2xl font-semibold">{formatarMoeda(patrimonioTotal)}</p>
        <p className="mt-1 text-xs text-cream-100/40">
          {subgrupo === "pessoal"
            ? "Projetos e vontades de curto/médio prazo (trocar de carro, celular, presente...)."
            : "Formação de patrimônio de longo prazo (investimentos, previdência...)."}
        </p>
      </div>

      {estado === "geral" && (
        <>
          <div className="mb-4 grid grid-cols-1 items-start gap-4 sm:grid-cols-2">
            {contas.map((conta) => (
              <div key={conta.id} className="card-dominium p-4">
                <div className="mb-1 flex items-center gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: conta.cor }} />
                  <p className="min-w-0 flex-1 truncate text-sm font-medium" style={{ color: conta.cor }}>
                    {conta.nome}
                  </p>
                  {conta.metaBatida && (
                    <span className="flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-medium text-success">
                      <Check size={11} /> Meta batida
                    </span>
                  )}
                  <button
                    onClick={() => setModalProjeto({ modo: "editar", conta, aporte: conta.aportes[0] || null })}
                    className="p-1 text-cream-100/40 hover:text-gold-300"
                    aria-label="Editar projeto"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => setContaParaExcluir(conta)}
                    className="p-1 text-cream-100/40 hover:text-danger"
                    aria-label="Excluir conta"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>

                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="tabular text-lg font-semibold text-cream-100">
                      {formatarMoeda(conta.patrimonio)}{" "}
                      <span className="text-xs font-normal text-cream-100/50">
                        · {conta.aportes.length} valor{conta.aportes.length === 1 ? "" : "es"}
                      </span>
                    </p>
                    {(() => {
                      const metaValor = conta.aportes.find((a) => a.valorMeta != null)?.valorMeta;
                      return (
                        metaValor != null && (
                          <p className="tabular text-xs text-cream-100/50">Meta: {formatarMoeda(metaValor)}</p>
                        )
                      );
                    })()}
                  </div>
                  <button
                    onClick={() => {
                      const aporteMeta = conta.aportes.find((a) => a.valorMeta != null);
                      if (aporteMeta) {
                        setModalLancarValor({ conta, aporteMeta });
                      } else {
                        abrirFoco(conta);
                      }
                    }}
                    className="shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium"
                    style={{ borderColor: conta.cor, color: conta.cor }}
                  >
                    Lançar Valor Extra
                  </button>
                </div>

                <ListaValores
                  conta={conta}
                  onEditarValor={(a) => abrirEdicaoValor(conta, a)}
                  onExcluirValor={excluirAporte}
                  onExcluirResgate={excluirResgate}
                  onExcluirValorExtra={excluirValorExtra}
                />

                <div className="mt-3 flex flex-wrap gap-2 border-t border-navy-700 pt-3">
                  <button
                    onClick={() => setModalResgate(conta)}
                    className="rounded-xl border border-danger px-3 py-2 text-xs text-danger"
                  >
                    Resgatar
                  </button>
                  <button
                    onClick={() => setModalAtualizarValor(conta)}
                    className="rounded-xl border border-navy-700 px-3 py-2 text-xs text-cream-100/70"
                  >
                    Atualizar Valor
                  </button>
                  {conta.metaBatida && (
                    <button
                      onClick={() => setModalOpcoes(conta)}
                      className="rounded-xl border border-gold-500 px-3 py-2 text-xs text-gold-300"
                    >
                      Ver Opções
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {!carregando && contas.length === 0 && (
            <div className="card-dominium mb-4 p-6 text-center text-sm text-cream-100/70">
              Nenhuma conta de {LABEL_SUBGRUPO[subgrupo].toLowerCase()} ainda. Crie uma (ex:{" "}
              {subgrupo === "pessoal" ? '"Trocar de celular"' : '"Investimento IPCA+"'}) e lance valores.
            </div>
          )}

          <button
            onClick={() => setModalProjeto({ modo: "criar" })}
            className="flex w-full items-center justify-center gap-1 rounded-full border border-dashed border-gold-500/50 px-4 py-3 text-sm text-gold-300"
          >
            <Plus size={16} /> Novo Projeto
          </button>
        </>
      )}

      {estado === "foco" && contaFoco && (
        <div>
          <button
            onClick={voltarParaGeral}
            className="mb-4 flex items-center gap-1 text-sm text-cream-100/70 hover:text-gold-300"
          >
            <ArrowLeft size={16} /> Voltar
          </button>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-start">
            <form onSubmit={salvarAporte} className="card-dominium flex flex-col gap-4 p-5">
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
                label="Valor"
                valorCentavos={form.valorCentavos}
                onChange={(valorCentavos) => setForm({ ...form, valorCentavos })}
                required
              />

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setForm({ ...form, tipo: "fixo" })}
                  className={`min-h-[44px] rounded-xl border text-sm ${
                    form.tipo === "fixo" ? "border-gold-500 text-gold-300" : "border-navy-700 text-cream-100/60"
                  }`}
                >
                  Fixo (automático)
                </button>
                <button
                  type="button"
                  onClick={() => setForm({ ...form, tipo: "temporario", mesFim: form.mesFim || form.mesInicio })}
                  className={`min-h-[44px] rounded-xl border text-sm ${
                    form.tipo === "temporario" ? "border-gold-500 text-gold-300" : "border-navy-700 text-cream-100/60"
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
                    <label className="mb-1 block text-sm text-cream-100/80">Mês fim</label>
                    <input
                      className="input-dominium"
                      type="month"
                      value={form.mesFim}
                      min={form.mesInicio}
                      onChange={(e) => setForm({ ...form, mesFim: e.target.value })}
                      required
                    />
                  </div>
                )}
              </div>

              {form.tipo === "temporario" && (
                <p className="-mt-2 text-xs text-cream-100/50">
                  {parcelasCalculadas && parcelasCalculadas >= 1
                    ? `${parcelasCalculadas} parcela${parcelasCalculadas === 1 ? "" : "s"} calculada${
                        parcelasCalculadas === 1 ? "" : "s"
                      } automaticamente.`
                    : "Mês fim precisa ser igual ou posterior ao mês início."}
                </p>
              )}

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
                {salvando
                  ? "Salvando..."
                  : aporteEditando
                    ? "Alterar valor"
                    : "Lançar valor"}
              </button>
            </form>

            <div className="card-dominium p-4 lg:sticky lg:top-8">
              <p className="mb-1 text-sm font-medium" style={{ color: contaFoco.cor }}>
                {contaFoco.nome}
              </p>
              <p className="tabular mb-3 text-lg font-semibold text-cream-100">
                {formatarMoeda(contas.find((c) => c.id === contaFoco.id)?.patrimonio ?? contaFoco.patrimonio)}
              </p>

              <div className="lg:max-h-[calc(100vh-14rem)] lg:overflow-y-auto lg:pr-1">
                <ListaValores
                  conta={contas.find((c) => c.id === contaFoco.id) || contaFoco}
                  onEditarValor={(a) => abrirEdicaoValor(contaFoco, a)}
                  onExcluirValor={excluirAporte}
                  onExcluirResgate={excluirResgate}
                  onExcluirValorExtra={excluirValorExtra}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {modalProjeto && (
        <ModalProjeto
          modo={modalProjeto.modo}
          subgrupo={subgrupo}
          conta={modalProjeto.modo === "editar" ? modalProjeto.conta : null}
          aporte={modalProjeto.modo === "editar" ? modalProjeto.aporte : null}
          onClose={() => setModalProjeto(null)}
          onSalvo={async () => {
            setModalProjeto(null);
            await Promise.all([recarregarInstancias(), carregar()]);
          }}
        />
      )}

      {contaParaExcluir && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="card-dominium w-full max-w-sm p-5 text-center">
            <p className="mb-4 text-sm text-cream-100">
              Excluir &quot;{contaParaExcluir.nome}&quot;? Todos os valores e resgates vinculados serão apagados junto.
            </p>
            <div className="flex gap-2">
              <button onClick={() => setContaParaExcluir(null)} className="flex-1 rounded-xl border border-navy-700 py-3 text-sm text-cream-100/70">
                Cancelar
              </button>
              <button onClick={excluirConta} className="flex-1 rounded-xl bg-danger py-3 text-sm font-medium text-cream-100">
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}

      {modalResgate && (
        <ModalResgate conta={modalResgate} onClose={() => setModalResgate(null)} onSalvo={async () => { setModalResgate(null); await carregar(); }} />
      )}

      {modalOpcoes && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center">
          <div className="card-dominium w-full max-w-sm rounded-b-none p-5 text-center sm:rounded-b-2xl">
            <h2 className="mb-1 font-brand text-lg text-cream-100">Qual o destino desta reserva?</h2>
            <p className="mb-4 text-xs text-cream-100/60">
              {modalOpcoes.nome} · {formatarMoeda(modalOpcoes.patrimonio)} juntados
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => concluirProjeto(modalOpcoes)}
                className="btn-gold py-3 text-sm"
              >
                Concluir projeto (retirar o valor juntado)
              </button>
              <button
                onClick={() => {
                  const ultimoAporte = modalOpcoes.aportes.find((a) => a.metaBatida) || modalOpcoes.aportes[0];
                  setModalOpcoes(null);
                  if (ultimoAporte) abrirEdicaoValor(modalOpcoes, ultimoAporte);
                }}
                className="rounded-xl border border-navy-700 py-3 text-sm text-cream-100/80"
              >
                Continuar juntando (acrescentar parcelas)
              </button>
              {subgrupo === "pessoal" && (
                <button
                  onClick={() => {
                    setModalOpcoes(null);
                    setModalMigrar(modalOpcoes);
                  }}
                  className="rounded-xl border border-gold-500 py-3 text-sm text-gold-300"
                >
                  Migrar para Reserva Patrimonial
                </button>
              )}
              <button onClick={() => setModalOpcoes(null)} className="py-2 text-xs text-cream-100/50">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {modalMigrar && (
        <ModalMigrar
          contaOrigem={modalMigrar}
          onClose={() => setModalMigrar(null)}
          onMigrado={async () => {
            setModalMigrar(null);
            await Promise.all([recarregarInstancias(), carregar()]);
          }}
        />
      )}

      {modalAtualizarValor && (
        <ModalAtualizarValor
          conta={modalAtualizarValor}
          onClose={() => setModalAtualizarValor(null)}
          onSalvo={async () => {
            setModalAtualizarValor(null);
            await carregar();
          }}
        />
      )}

      {modalLancarValor && (
        <ModalLancarValor
          conta={modalLancarValor.conta}
          aporteMeta={modalLancarValor.aporteMeta}
          onClose={() => setModalLancarValor(null)}
          onSalvo={async () => {
            setModalLancarValor(null);
            await carregar();
          }}
        />
      )}
    </div>
  );
}

function ListaValores({
  conta,
  onEditarValor,
  onExcluirValor,
  onExcluirResgate,
  onExcluirValorExtra,
}: {
  conta: ContaInvestimento;
  onEditarValor: (a: Aporte) => void;
  onExcluirValor: (id: string) => void;
  onExcluirResgate: (id: string) => void;
  onExcluirValorExtra: (id: string) => void;
}) {
  if (conta.aportes.length === 0 && conta.resgates.length === 0) {
    return <p className="py-3 text-center text-sm text-cream-100/50">Sem valores lançados.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {conta.aportes.map((a) => {
        const extras = a.valoresExtras || [];
        const somaExtras = extras.reduce((acc, v) => acc + v.valor, 0);
        return (
          <div key={a.id} className="flex items-center gap-3 border-t border-navy-700 pt-2 first:border-t-0 first:pt-0">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-cream-100">
                {a.descricao}{" "}
                {a.tipo === "temporario" && a.parcelasRestantesComValor != null && (
                  <span className="text-xs font-normal text-cream-100/50">
                    ({a.parcelasRestantesComValor}/{a.parcelas} parcelas restantes)
                  </span>
                )}{" "}
                {a.metaBatida && <Check size={12} className="ml-1 inline text-success" />}
              </p>
              {a.tipo === "fixo" ? (
                <p className="tabular text-xs text-cream-100/60">{formatarMoeda(a.valor)}/mês · FIXO</p>
              ) : (
                <>
                  <div className="tabular text-xs text-cream-100/60">
                    <p>Valor Parcelas: {formatarMoeda(a.valor)}</p>
                    {a.ultimaParcela != null && <p>Última Parcela: {formatarMoeda(a.ultimaParcela)}</p>}
                    {a.valorMeta != null && <p>Valor da Meta: {formatarMoeda(a.valorMeta)}</p>}
                  </div>
                  {a.valorRendimento !== 0 && (
                    <p className={`tabular text-xs font-medium ${a.valorRendimento > 0 ? "text-success" : "text-danger"}`}>
                      Rendimento acumulado: {a.valorRendimento > 0 ? "+" : "-"}
                      {formatarMoeda(Math.abs(a.valorRendimento))}
                    </p>
                  )}
                  {extras.length > 0 && (
                    <div className="mt-1 rounded-lg bg-navy-800/60 p-2">
                      <p className="tabular mb-1 text-xs font-medium text-gold-300">
                        Valores extras lançados · total {formatarMoeda(somaExtras)}
                      </p>
                      <div className="flex flex-col gap-1">
                        {extras.map((v) => (
                          <div key={v.id} className="flex items-center gap-2">
                            <span className="tabular flex-1 text-xs text-cream-100/70">
                              {formatarMoeda(v.valor)} ·{" "}
                              {new Date(v.criadoEm).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
                              {v.viaRecalculo && " · recálculo"}
                            </span>
                            {v.viaRecalculo ? (
                              <button
                                onClick={() => onEditarValor(a)}
                                className="text-[11px] text-gold-300/80 hover:text-gold-300"
                              >
                                revisar projeto
                              </button>
                            ) : (
                              <button
                                onClick={() => onExcluirValorExtra(v.id)}
                                className="p-1 text-cream-100/40 hover:text-danger"
                                aria-label="Reverter valor extra"
                              >
                                <Trash2 size={13} />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
            <button
              onClick={() => onEditarValor(a)}
              className="p-2 text-cream-100/40 hover:text-gold-300"
              aria-label="Editar valor"
            >
              <Pencil size={15} />
            </button>
            <button
              onClick={() => onExcluirValor(a.id)}
              className="p-2 text-cream-100/40 hover:text-danger"
              aria-label="Excluir valor"
            >
              <Trash2 size={15} />
            </button>
          </div>
        );
      })}
      {conta.resgates.map((r) => (
        <div key={r.id} className="flex items-center gap-3 border-t border-navy-700 pt-2 first:border-t-0 first:pt-0">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm text-cream-100">{r.descricao}</p>
            <p className="tabular text-xs text-danger">{formatarMoeda(r.valor)} · resgate</p>
          </div>
          <button
            onClick={() => onExcluirResgate(r.id)}
            className="p-2 text-cream-100/40 hover:text-danger"
            aria-label="Excluir resgate"
          >
            <Trash2 size={15} />
          </button>
        </div>
      ))}
    </div>
  );
}

function ModalResgate({
  conta,
  onClose,
  onSalvo,
}: {
  conta: ContaInvestimento;
  onClose: () => void;
  onSalvo: () => void;
}) {
  const [descricao, setDescricao] = useState("Resgate");
  const [valorCentavos, setValorCentavos] = useState(0);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    const valorNumerico = centavosParaNumero(valorCentavos);
    if (!valorNumerico || valorNumerico <= 0) {
      setErro("Informe um valor maior que zero.");
      return;
    }
    setSalvando(true);
    try {
      await api.post("/api/investimentos/resgate", { instanciaId: conta.id, descricao, valor: valorNumerico });
      onSalvo();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Nao foi possivel salvar.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center">
      <form onSubmit={salvar} className="card-dominium w-full max-w-sm rounded-b-none p-5 sm:rounded-b-2xl">
        <h2 className="mb-1 font-brand text-lg text-cream-100">Resgatar</h2>
        <p className="mb-4 text-xs text-cream-100/60">{conta.nome} · {formatarMoeda(conta.patrimonio)} disponível</p>
        <div className="mb-4">
          <label className="mb-1 block text-sm text-cream-100/80">Descrição</label>
          <input className="input-dominium" value={descricao} onChange={(e) => setDescricao(e.target.value)} required />
        </div>
        <div className="mb-5">
          <CampoMoeda label="Valor" valorCentavos={valorCentavos} onChange={setValorCentavos} autoFocus required />
        </div>
        {erro && <p className="mb-3 text-sm text-danger">{erro}</p>}
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 rounded-xl border border-navy-700 py-3 text-sm text-cream-100/70">
            Cancelar
          </button>
          <button type="submit" className="flex-1 rounded-xl bg-danger py-3 text-sm font-medium text-cream-100" disabled={salvando}>
            {salvando ? "Salvando..." : "Confirmar resgate"}
          </button>
        </div>
      </form>
    </div>
  );
}

function ModalMigrar({
  contaOrigem,
  onClose,
  onMigrado,
}: {
  contaOrigem: ContaInvestimento;
  onClose: () => void;
  onMigrado: () => void;
}) {
  const [destinos, setDestinos] = useState<ContaInvestimento[]>([]);
  const [destinoId, setDestinoId] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    api.get<{ contas: ContaInvestimento[] }>("/api/investimentos?subgrupo=patrimonial").then((data) => {
      setDestinos(data.contas);
      if (data.contas[0]) setDestinoId(data.contas[0].id);
    });
  }, []);

  async function migrar(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    if (!destinoId) {
      setErro("Escolha a conta de destino.");
      return;
    }
    setSalvando(true);
    try {
      await api.post("/api/investimentos/migrar", {
        instanciaOrigemId: contaOrigem.id,
        instanciaDestinoId: destinoId,
      });
      onMigrado();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Nao foi possivel migrar.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center">
      <form onSubmit={migrar} className="card-dominium w-full max-w-sm rounded-b-none p-5 sm:rounded-b-2xl">
        <h2 className="mb-1 font-brand text-lg text-cream-100">Migrar para Reserva Patrimonial</h2>
        <p className="mb-4 text-xs text-cream-100/60">
          {contaOrigem.nome} · {formatarMoeda(contaOrigem.patrimonio)} serão transferidos
        </p>

        {destinos.length === 0 ? (
          <p className="mb-4 text-sm text-cream-100/60">
            Crie primeiro uma conta em Reserva Patrimonial para receber essa migração.
          </p>
        ) : (
          <div className="mb-5">
            <label className="mb-2 block text-sm text-cream-100/80">Conta de destino</label>
            <div className="flex flex-col gap-2">
              {destinos.map((d) => (
                <button
                  type="button"
                  key={d.id}
                  onClick={() => setDestinoId(d.id)}
                  className="flex items-center justify-between rounded-xl border px-3 py-2 text-sm"
                  style={destinoId === d.id ? { borderColor: d.cor, color: d.cor } : { borderColor: "#1F3552", color: "#F7F5F099" }}
                >
                  {d.nome}
                  <span className="tabular">{formatarMoeda(d.patrimonio)}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {erro && <p className="mb-3 text-sm text-danger">{erro}</p>}

        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 rounded-xl border border-navy-700 py-3 text-sm text-cream-100/70">
            Cancelar
          </button>
          <button type="submit" className="btn-gold flex-1" disabled={salvando || destinos.length === 0}>
            {salvando ? "Migrando..." : "Confirmar migração"}
          </button>
        </div>
      </form>
    </div>
  );
}

function ModalProjeto({
  modo,
  subgrupo,
  conta,
  aporte,
  onClose,
  onSalvo,
}: {
  modo: "criar" | "editar";
  subgrupo: Subgrupo;
  conta: ContaInvestimento | null;
  aporte: Aporte | null;
  onClose: () => void;
  onSalvo: () => void;
}) {
  const [nome, setNome] = useState(conta?.nome ?? "");
  const [cor, setCor] = useState(conta?.cor ?? COR_SUGERIDA[subgrupo]);
  const corPersonalizada = !PALETA_INSTANCIA_CURTA.includes(cor);
  const [tipo, setTipo] = useState<TipoLancamento>(aporte?.tipo ?? "temporario");
  const [mesInicio, setMesInicio] = useState(aporte?.mesInicio ?? mesAtual());
  const [observacoes, setObservacoes] = useState(aporte?.observacoes ?? "");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  // Fixo (parcela indefinida) e o modo "parcela" do temporario compartilham o
  // mesmo campo de valor de parcela.
  const [valorParcelaCentavos, setValorParcelaCentavos] = useState(aporte ? numeroParaCentavos(aporte.valor) : 0);

  const metaInicial =
    aporte?.tipo === "temporario"
      ? aporte.valorMeta ?? aporte.valor * (aporte.parcelas || 1)
      : 0;
  const [valorMetaCentavos, setValorMetaCentavos] = useState(numeroParaCentavos(metaInicial));
  const [modoTemporario, setModoTemporario] = useState<"parcela" | "prazo">("parcela");
  const [prazoMeses, setPrazoMeses] = useState<number | "">(aporte?.parcelas ?? "");

  const valorMetaNumerico = centavosParaNumero(valorMetaCentavos);
  const valorParcelaNumerico = centavosParaNumero(valorParcelaCentavos);

  const plano =
    tipo === "temporario" && valorMetaNumerico > 0
      ? modoTemporario === "parcela"
        ? valorParcelaNumerico > 0
          ? (() => {
              const parcelas = Math.ceil(valorMetaNumerico / valorParcelaNumerico);
              const ultimaBruta =
                Math.round((valorMetaNumerico - valorParcelaNumerico * (parcelas - 1)) * 100) / 100;
              return {
                parcelas,
                valorParcela: valorParcelaNumerico,
                valorUltima: Math.abs(ultimaBruta - valorParcelaNumerico) < 0.005 ? valorParcelaNumerico : ultimaBruta,
              };
            })()
          : null
        : typeof prazoMeses === "number" && prazoMeses >= 1
          ? (() => {
              const valorBase = Math.floor((valorMetaNumerico / prazoMeses) * 100) / 100;
              const ultimaBruta = Math.round((valorMetaNumerico - valorBase * (prazoMeses - 1)) * 100) / 100;
              return {
                parcelas: prazoMeses,
                valorParcela: valorBase,
                valorUltima: Math.abs(ultimaBruta - valorBase) < 0.005 ? valorBase : ultimaBruta,
              };
            })()
          : null
      : null;

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro("");

    if (tipo === "fixo") {
      if (!valorParcelaNumerico || valorParcelaNumerico <= 0) {
        setErro("Informe um valor maior que zero.");
        return;
      }
    } else {
      if (!valorMetaNumerico || valorMetaNumerico <= 0) {
        setErro("Informe o valor da meta.");
        return;
      }
      if (!plano) {
        setErro(
          modoTemporario === "parcela"
            ? "Informe o valor da parcela."
            : "Informe o prazo em meses."
        );
        return;
      }
    }

    const camposTemporario =
      tipo === "temporario"
        ? modoTemporario === "parcela"
          ? { valorMeta: valorMetaNumerico, valor: valorParcelaNumerico }
          : { valorMeta: valorMetaNumerico, prazoMeses: plano?.parcelas }
        : {};

    const payload = {
      subgrupo,
      nome,
      cor,
      tipo,
      ...(tipo === "fixo" ? { valor: valorParcelaNumerico } : camposTemporario),
      mesInicio,
      observacoes: observacoes || null,
    };

    setSalvando(true);
    try {
      if (modo === "criar") {
        await api.post("/api/investimentos/projeto", payload);
      } else if (aporte) {
        await api.put(`/api/investimentos/projeto/${conta!.id}`, { ...payload, aporteId: aporte.id });
      } else {
        await api.put(`/api/instancias/${conta!.id}`, { nome, cor });
        await api.post("/api/investimentos/aporte", {
          instanciaId: conta!.id,
          descricao: nome,
          valor: tipo === "fixo" ? valorParcelaNumerico : plano!.valorParcela,
          tipo,
          parcelas: tipo === "temporario" ? plano!.parcelas : null,
          mesInicio,
          observacoes: observacoes || null,
        });
      }
      onSalvo();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Nao foi possivel salvar o projeto.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center">
      <form
        onSubmit={salvar}
        className="card-dominium max-h-[90vh] w-full max-w-sm overflow-y-auto rounded-b-none p-5 sm:rounded-b-2xl"
      >
        <h2 className="mb-4 font-brand text-lg text-cream-100">
          {modo === "criar" ? `Novo Projeto — ${LABEL_SUBGRUPO[subgrupo]}` : "Editar Projeto"}
        </h2>

        <div className="mb-4">
          <label className="mb-1 block text-sm text-cream-100/80">Nome do projeto</label>
          <input
            className="input-dominium"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder={subgrupo === "pessoal" ? "Ex: Trocar de celular" : "Ex: Investimento IPCA+"}
            required
            autoFocus
          />
        </div>

        <div className="mb-4">
          <label className="mb-2 block text-sm text-cream-100/80">Cor</label>
          <div className="flex gap-2">
            {PALETA_INSTANCIA_CURTA.map((c) => (
              <button
                type="button"
                key={c}
                onClick={() => setCor(c)}
                className="h-8 w-8 shrink-0 rounded-full border-2"
                style={{ background: c, borderColor: cor === c ? "#F7F5F0" : "transparent" }}
              />
            ))}
            <div className="relative h-8 w-8 shrink-0">
              <input
                type="color"
                value={corPersonalizada ? cor : "#c9a24b"}
                onChange={(e) => setCor(e.target.value)}
                className="absolute inset-0 h-8 w-8 cursor-pointer opacity-0"
                aria-label="Escolher cor personalizada"
              />
              <div
                className="pointer-events-none flex h-8 w-8 items-center justify-center rounded-full border-2"
                style={{
                  background: corPersonalizada ? cor : "var(--dominium-navy-900)",
                  borderColor: corPersonalizada ? "#F7F5F0" : "var(--dominium-navy-700)",
                }}
              >
                {!corPersonalizada && <Palette size={14} className="text-cream-100/60" />}
              </div>
            </div>
          </div>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setTipo("fixo")}
            className={`min-h-[44px] rounded-xl border text-sm ${
              tipo === "fixo" ? "border-gold-500 text-gold-300" : "border-navy-700 text-cream-100/60"
            }`}
          >
            Fixo (automático)
          </button>
          <button
            type="button"
            onClick={() => setTipo("temporario")}
            className={`min-h-[44px] rounded-xl border text-sm ${
              tipo === "temporario" ? "border-gold-500 text-gold-300" : "border-navy-700 text-cream-100/60"
            }`}
          >
            Temporário
          </button>
        </div>

        <div className="mb-4">
          <CampoMoeda
            label="Valor da meta"
            valorCentavos={valorMetaCentavos}
            onChange={setValorMetaCentavos}
            disabled={tipo === "fixo"}
            required={tipo === "temporario"}
          />
        </div>

        <div className="mb-4 flex min-h-[4.5rem] items-center rounded-xl border border-gold-500/30 bg-gold-500/5 p-3">
          <p className="text-sm font-medium text-cream-100">
            {tipo === "fixo" ? (
              "Aporte automático, sem prazo definido — repete todo mês até você concluir ou pausar o projeto."
            ) : plano ? (
              <>
                <span className="text-gold-gradient font-semibold">
                  {plano.parcelas} parcela{plano.parcelas === 1 ? "" : "s"} de {formatarMoeda(plano.valorParcela)}
                  {plano.valorUltima !== plano.valorParcela ? `, última de ${formatarMoeda(plano.valorUltima)}` : ""}
                </span>
                <br />
                <span className="text-xs text-cream-100/60">
                  termina em {formatarMesLabel(somarMeses(mesInicio, plano.parcelas - 1))}
                </span>
              </>
            ) : (
              "Preencha as informações abaixo para ver a simulação."
            )}
          </p>
        </div>

        <div className="mb-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={tipo === "fixo"}
            onClick={() => setModoTemporario("parcela")}
            className={`min-h-[40px] rounded-xl border text-xs disabled:opacity-40 ${
              tipo === "temporario" && modoTemporario === "parcela"
                ? "border-gold-500 text-gold-300"
                : "border-navy-700 text-cream-100/60"
            }`}
          >
            Já sei o valor da parcela
          </button>
          <button
            type="button"
            disabled={tipo === "fixo"}
            onClick={() => setModoTemporario("prazo")}
            className={`min-h-[40px] rounded-xl border text-xs disabled:opacity-40 ${
              tipo === "temporario" && modoTemporario === "prazo"
                ? "border-gold-500 text-gold-300"
                : "border-navy-700 text-cream-100/60"
            }`}
          >
            Já sei o prazo
          </button>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-3">
          <CampoMoeda
            label="Valor da parcela"
            valorCentavos={
              tipo === "fixo"
                ? valorParcelaCentavos
                : modoTemporario === "parcela"
                  ? valorParcelaCentavos
                  : numeroParaCentavos(plano?.valorParcela ?? 0)
            }
            onChange={setValorParcelaCentavos}
            disabled={tipo === "temporario" && modoTemporario === "prazo"}
            required={tipo === "fixo" || modoTemporario === "parcela"}
          />
          <CampoPrazoMeses
            label="Prazo (meses)"
            value={tipo === "temporario" && modoTemporario === "prazo" ? prazoMeses : (plano?.parcelas ?? "")}
            onChange={setPrazoMeses}
            disabled={tipo === "fixo" || modoTemporario === "parcela"}
          />
        </div>

        <div className="mb-4">
          <CampoMes label="Mês início" value={mesInicio} onChange={setMesInicio} />
        </div>

        <div className="mb-5">
          <label className="mb-1 block text-sm text-cream-100/80">Observações (opcional)</label>
          <input
            className="input-dominium"
            value={observacoes}
            onChange={(e) => setObservacoes(e.target.value)}
            placeholder="Onde você vai guardar esse valor? Ex: Caixinha, Cofrinho, Embaixo do colchão..."
          />
        </div>

        {erro && <p className="mb-3 text-sm text-danger">{erro}</p>}

        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 rounded-xl border border-navy-700 py-3 text-sm text-cream-100/70">
            Cancelar
          </button>
          <button type="submit" className="btn-gold flex-1" disabled={salvando}>
            {salvando ? "Salvando..." : modo === "criar" ? "Criar projeto" : "Salvar"}
          </button>
        </div>
      </form>
    </div>
  );
}

function ModalAtualizarValor({
  conta,
  onClose,
  onSalvo,
}: {
  conta: ContaInvestimento;
  onClose: () => void;
  onSalvo: () => void;
}) {
  const [valorCentavos, setValorCentavos] = useState(numeroParaCentavos(conta.patrimonio));
  const [descricao, setDescricao] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  const valorNumerico = centavosParaNumero(valorCentavos);
  const diferenca = valorNumerico - conta.patrimonio;
  const temMeta = conta.aportes.some((a) => a.tipo === "temporario" && a.valorMeta != null);
  const viraAbatimento = temMeta;

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    if (valorCentavos < 0) {
      setErro("Informe um valor valido.");
      return;
    }
    setSalvando(true);
    try {
      await api.post(`/api/investimentos/${conta.id}/atualizar-valor`, {
        valorAtual: valorNumerico,
        descricao: descricao || undefined,
      });
      onSalvo();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Nao foi possivel atualizar o valor.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center">
      <form onSubmit={salvar} className="card-dominium w-full max-w-sm rounded-b-none p-5 sm:rounded-b-2xl">
        <h2 className="mb-1 font-brand text-lg text-cream-100">Atualizar Valor</h2>
        <p className="mb-4 text-xs text-cream-100/60">
          {conta.nome} · valor atual no sistema: {formatarMoeda(conta.patrimonio)}
        </p>
        <div className="mb-4">
          <CampoMoeda label="Valor real atual" valorCentavos={valorCentavos} onChange={setValorCentavos} autoFocus required />
        </div>
        {Math.abs(diferenca) >= 0.005 && (
          <p className={`mb-4 text-xs ${diferenca > 0 ? "text-success" : "text-danger"}`}>
            {viraAbatimento
              ? diferenca > 0
                ? `Diferença de ${formatarMoeda(diferenca)} vai abater as parcelas finais da meta, acelerando o objetivo.`
                : `Diferença de ${formatarMoeda(Math.abs(diferenca))} vai aumentar a última parcela da meta.`
              : diferenca > 0
                ? `Diferença de ${formatarMoeda(diferenca)} será lançada como um valor de rendimento.`
                : `Diferença de ${formatarMoeda(diferenca)} será lançada como um resgate de ajuste.`}
          </p>
        )}
        {!viraAbatimento && (
          <div className="mb-5">
            <label className="mb-1 block text-sm text-cream-100/80">
              Descrição do ajuste {diferenca > 0 ? "(padrão: Rendimento)" : "(padrão: Ajuste)"}
            </label>
            <input
              className="input-dominium"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder={diferenca >= 0 ? "Rendimento" : "Ajuste"}
            />
          </div>
        )}
        {erro && <p className="mb-3 text-sm text-danger">{erro}</p>}
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 rounded-xl border border-navy-700 py-3 text-sm text-cream-100/70">
            Cancelar
          </button>
          <button type="submit" className="btn-gold flex-1" disabled={salvando}>
            {salvando ? "Salvando..." : "Confirmar"}
          </button>
        </div>
      </form>
    </div>
  );
}

function ModalLancarValor({
  conta,
  aporteMeta,
  onClose,
  onSalvo,
}: {
  conta: ContaInvestimento;
  aporteMeta: Aporte;
  onClose: () => void;
  onSalvo: () => void;
}) {
  const [valorCentavos, setValorCentavos] = useState(0);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState<"abater" | "recalcular" | null>(null);

  const faltam = Math.max((aporteMeta.valorMeta ?? 0) - aporteMeta.acumulado, 0);

  async function salvar(endpoint: "abater" | "recalcular") {
    setErro("");
    const valorNumerico = centavosParaNumero(valorCentavos);
    if (!valorNumerico || valorNumerico <= 0) {
      setErro("Informe um valor maior que zero.");
      return;
    }
    setSalvando(endpoint);
    try {
      await api.post(`/api/investimentos/aporte/${aporteMeta.id}/${endpoint}`, { valor: valorNumerico });
      onSalvo();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Nao foi possivel lançar o valor.");
    } finally {
      setSalvando(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center">
      <div className="card-dominium w-full max-w-sm rounded-b-none p-5 sm:rounded-b-2xl">
        <h2 className="mb-1 font-brand text-lg text-cream-100">Lançar Valor Extra</h2>
        <p className="mb-4 text-xs text-cream-100/60">
          {conta.nome} · faltam {formatarMoeda(faltam)} para a meta
        </p>

        <CampoMoeda label="Valor" valorCentavos={valorCentavos} onChange={setValorCentavos} autoFocus required />

        {erro && <p className="mt-3 text-sm text-danger">{erro}</p>}

        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            onClick={() => salvar("abater")}
            className="btn-gold py-3 text-sm"
            disabled={salvando !== null}
          >
            {salvando === "abater" ? "Salvando..." : "Manter Valor da Parcela (reduz o tempo)"}
          </button>
          <button
            type="button"
            onClick={() => salvar("recalcular")}
            className="rounded-xl border border-gold-500 py-3 text-sm text-gold-300"
            disabled={salvando !== null}
          >
            {salvando === "recalcular" ? "Salvando..." : "Reduzir Valor da Parcela (mantém o tempo atual)"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-navy-700 py-3 text-sm text-cream-100/70"
            disabled={salvando !== null}
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

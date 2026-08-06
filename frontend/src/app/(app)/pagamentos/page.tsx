"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Check, Undo2 } from "lucide-react";
import { DndContext, DragOverlay, closestCenter } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { api, ApiError } from "@/lib/api";
import { formatarDataHora, formatarMoeda } from "@/lib/format";
import { formatarMesInline, formatarMesLabel, mesAtual, somarMeses } from "@/lib/mes";
import { centavosParaNumero, numeroParaCentavos } from "@/lib/moeda";
import { CampoMoeda } from "@/components/dominium/CampoMoeda";
import { AlcaArrastar } from "@/components/dominium/AlcaArrastar";
import { Toast } from "@/components/dominium/Toast";
import { useAuth } from "@/contexts/AuthContext";
import { useOrdenacaoArrastavel } from "@/hooks/useOrdenacaoArrastavel";
import { lerSnapshot, salvarSnapshot } from "@/lib/offline/snapshots";
import type { InstanciaEmAberto } from "@/lib/types";

type RespostaEmAberto = {
  mesReferencia: string;
  vencimento: string;
  emAtraso: boolean;
  instancias: InstanciaEmAberto[];
};

const SNAPSHOT = "pagamentos-em-aberto";

const MENSAGEM_OFFLINE = "Sem conexão — essa ação exige internet. Tente novamente ao reconectar.";

function mensagemErro(err: unknown) {
  return err instanceof ApiError ? err.message : MENSAGEM_OFFLINE;
}

export default function PagamentosPage() {
  const { usuario } = useAuth();
  const [mesReferencia, setMesReferencia] = useState(mesAtual());
  const [dados, setDados] = useState<RespostaEmAberto | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [deSnapshot, setDeSnapshot] = useState(false);
  const [ultimaAtualizacao, setUltimaAtualizacao] = useState<number | null>(null);
  const [semDadosOffline, setSemDadosOffline] = useState(false);
  const [erroAcao, setErroAcao] = useState("");

  const [instanciaSelecionando, setInstanciaSelecionando] = useState<string | null>(null);
  const [selecionados, setSelecionados] = useState<string[]>([]);

  const [outroValor, setOutroValor] = useState<InstanciaEmAberto | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const data = await api.get<RespostaEmAberto>(`/api/pagamentos/em-aberto?mesReferencia=${mesReferencia}`);
      setDados(data);
      setDeSnapshot(false);
      setSemDadosOffline(false);
      if (usuario) salvarSnapshot(SNAPSHOT, usuario.id, data);
    } catch {
      // Offline/erro de rede: cai pro último snapshot confirmado (a última
      // tela de pagamentos vista com sucesso, não necessariamente deste
      // mês) em vez de deixar a tela sem nenhuma mensagem.
      const snapshot = usuario ? await lerSnapshot<RespostaEmAberto>(SNAPSHOT, usuario.id) : null;
      if (snapshot) {
        setDados(snapshot.dados);
        setUltimaAtualizacao(snapshot.atualizadoEm);
        setDeSnapshot(true);
        setSemDadosOffline(false);
      } else {
        setDados(null);
        setSemDadosOffline(true);
      }
    } finally {
      setCarregando(false);
    }
  }, [mesReferencia, usuario]);

  useEffect(() => {
    carregar();
    setInstanciaSelecionando(null);
    setSelecionados([]);
  }, [carregar]);

  async function pagarTotal(instanciaId: string, confirmarDuplicado = false) {
    setErroAcao("");
    try {
      await api.post("/api/pagamentos/total", { instanciaId, mesReferencia, confirmarDuplicado });
      await carregar();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        if (confirm(`${err.message} Deseja confirmar mesmo assim?`)) {
          await pagarTotal(instanciaId, true);
        }
        return;
      }
      setErroAcao(mensagemErro(err));
    }
  }

  async function pagarSelecionados(instanciaId: string, confirmarDuplicado = false) {
    if (selecionados.length === 0) return;
    if (!confirmarDuplicado && !confirm(`Confirma o pagamento de ${selecionados.length} item(ns) selecionado(s)?`)) {
      return;
    }
    setErroAcao("");
    try {
      await api.post("/api/pagamentos/selecionados", {
        instanciaId,
        mesReferencia,
        lancamentoIds: selecionados,
        confirmarDuplicado,
      });
      setInstanciaSelecionando(null);
      setSelecionados([]);
      await carregar();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        if (confirm(`${err.message} Deseja confirmar mesmo assim?`)) {
          await pagarSelecionados(instanciaId, true);
        }
        return;
      }
      setErroAcao(mensagemErro(err));
    }
  }

  function toggleSelecionado(id: string) {
    setSelecionados((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  const instanciasVisiveis = useMemo(
    () => dados?.instancias.filter((i) => i.itens.length > 0) ?? [],
    [dados]
  );

  // Reposiciona só as instâncias visíveis (com item em aberto) dentro de
  // `dados.instancias`, preservando a posição das demais — mesmo princípio
  // de InstanciasContext.reordenar.
  const setInstanciasVisiveis = useCallback((novaOrdem: InstanciaEmAberto[]) => {
    setDados((prev) => {
      if (!prev) return prev;
      const idsSet = new Set(novaOrdem.map((i) => i.id));
      let cursor = 0;
      return { ...prev, instancias: prev.instancias.map((i) => (idsSet.has(i.id) ? novaOrdem[cursor++] : i)) };
    });
  }, []);

  const {
    sensors,
    onDragStart,
    onDragEnd,
    onDragCancel,
    itemAtivo,
    erro: erroOrdenacao,
    limparErro,
  } = useOrdenacaoArrastavel("pagamentos", instanciasVisiveis, setInstanciasVisiveis);

  async function reverterPagamento(lancamentoId: string) {
    if (
      !confirm(
        "Reverter este pagamento? O item volta para \"em aberto\". Se ele gerou um lançamento extra (excedente ou pendência), esse lançamento também será removido."
      )
    ) {
      return;
    }
    setErroAcao("");
    try {
      await api.post("/api/pagamentos/reverter", { lancamentoId, mesReferencia });
      await carregar();
    } catch (err) {
      setErroAcao(mensagemErro(err));
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-1 font-brand text-2xl text-cream-100">Pagamentos</h1>
      <p className="mb-4 h-4 text-[11px] text-cream-100/40">
        {deSnapshot && ultimaAtualizacao ? `Última atualização: ${formatarDataHora(ultimaAtualizacao)}` : ""}
      </p>

      {erroAcao && (
        <p className="mb-4 rounded-lg bg-danger/10 px-3 py-2 text-center text-xs text-danger">{erroAcao}</p>
      )}

      {semDadosOffline && (
        <div className="card-dominium mb-4 p-6 text-center text-sm text-cream-100/70">
          Sem conexão e nenhum pagamento salvo neste aparelho ainda. Abra Pagamentos uma vez online
          pra poder consultá-lo offline depois.
        </div>
      )}

      <div className="card-dominium mb-6 flex items-center justify-between p-3">
        <button
          onClick={() => setMesReferencia((m) => somarMeses(m, -1))}
          className="flex items-center gap-1 p-2 text-cream-100/70 hover:text-gold-300"
        >
          <ChevronLeft size={18} /> Anterior
        </button>
        <div className="text-center">
          <p className="text-sm font-medium text-cream-100">{formatarMesLabel(mesReferencia)}</p>
          {mesReferencia !== mesAtual() && (
            <button onClick={() => setMesReferencia(mesAtual())} className="text-xs text-gold-300">
              voltar para o mês atual
            </button>
          )}
        </div>
        <button
          onClick={() => setMesReferencia((m) => somarMeses(m, 1))}
          className="flex items-center gap-1 p-2 text-cream-100/70 hover:text-gold-300"
        >
          Seguinte <ChevronRight size={18} />
        </button>
      </div>

      {dados?.emAtraso && (
        <p className="mb-4 rounded-lg bg-danger/10 px-3 py-2 text-center text-xs text-danger">
          Referência vencida — há débitos em aberto após o vencimento.
        </p>
      )}

      {!carregando && dados && dados.instancias.length === 0 && (
        <div className="card-dominium p-6 text-center text-sm text-cream-100/70">
          Nenhuma cobrança nesta referência.
        </div>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={onDragCancel}
      >
        <SortableContext items={instanciasVisiveis.map((i) => i.id)} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col gap-4">
            {instanciasVisiveis.map((instancia) => (
              <CardPagamentoInstanciaOrdenavel
                key={instancia.id}
                instancia={instancia}
                mesReferencia={mesReferencia}
                instanciaSelecionando={instanciaSelecionando}
                selecionados={selecionados}
                toggleSelecionado={toggleSelecionado}
                setInstanciaSelecionando={setInstanciaSelecionando}
                setSelecionados={setSelecionados}
                pagarTotal={pagarTotal}
                pagarSelecionados={pagarSelecionados}
                reverterPagamento={reverterPagamento}
                onOutroValor={() => setOutroValor(instancia)}
              />
            ))}
          </div>
        </SortableContext>
        <DragOverlay>
          {itemAtivo && (
            <CardPagamentoInstancia
              instancia={itemAtivo}
              mesReferencia={mesReferencia}
              instanciaSelecionando={null}
              selecionados={[]}
              toggleSelecionado={() => {}}
              setInstanciaSelecionando={() => {}}
              setSelecionados={() => {}}
              pagarTotal={() => {}}
              pagarSelecionados={() => {}}
              reverterPagamento={() => {}}
              onOutroValor={() => {}}
              solido
            />
          )}
        </DragOverlay>
      </DndContext>

      {outroValor && (
        <SubmodalOutroValor
          instancia={outroValor}
          mesReferencia={mesReferencia}
          onClose={() => setOutroValor(null)}
          onSalvo={async () => {
            setOutroValor(null);
            await carregar();
          }}
        />
      )}

      {erroOrdenacao && <Toast mensagem={erroOrdenacao} tipo="erro" onFechar={limparErro} />}
    </div>
  );
}

type ArrasteProps = {
  setNodeRef: (node: HTMLElement | null) => void;
  style: React.CSSProperties;
  attributes: ReturnType<typeof useSortable>["attributes"];
  listeners: ReturnType<typeof useSortable>["listeners"];
  isDragging: boolean;
};

// Wrapper que só existe pra chamar useSortable — a cópia sólida dentro do
// <DragOverlay> usa o componente presentacional direto, sem passar por
// aqui (senão duplicaria o id no SortableContext).
function CardPagamentoInstanciaOrdenavel(props: Omit<React.ComponentProps<typeof CardPagamentoInstancia>, "arraste">) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: props.instancia.id,
  });
  const arraste: ArrasteProps = {
    setNodeRef,
    style: { transform: CSS.Transform.toString(transform), transition },
    attributes,
    listeners,
    isDragging,
  };
  return <CardPagamentoInstancia {...props} arraste={arraste} />;
}

function CardPagamentoInstancia({
  instancia,
  mesReferencia,
  instanciaSelecionando,
  selecionados,
  toggleSelecionado,
  setInstanciaSelecionando,
  setSelecionados,
  pagarTotal,
  pagarSelecionados,
  reverterPagamento,
  onOutroValor,
  arraste,
  solido,
}: {
  instancia: InstanciaEmAberto;
  mesReferencia: string;
  instanciaSelecionando: string | null;
  selecionados: string[];
  toggleSelecionado: (id: string) => void;
  setInstanciaSelecionando: (id: string | null) => void;
  setSelecionados: (ids: string[]) => void;
  pagarTotal: (instanciaId: string) => void;
  pagarSelecionados: (instanciaId: string) => void;
  reverterPagamento: (lancamentoId: string) => void;
  onOutroValor: () => void;
  arraste?: ArrasteProps;
  solido?: boolean;
}) {
  return (
    <div
      ref={arraste?.setNodeRef}
      style={arraste?.style}
      className={`card-dominium p-4 ${
        solido ? "shadow-2xl shadow-black/50" : arraste?.isDragging ? "opacity-30" : ""
      }`}
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {arraste && <AlcaArrastar attributes={arraste.attributes} listeners={arraste.listeners} />}
          <span className="h-3 w-3 rounded-full" style={{ background: instancia.cor }} />
          <span className="text-sm font-medium text-cream-100">
            {instancia.nome}
            <span className="font-normal text-cream-100/50"> ({formatarMesInline(mesReferencia)})</span>
          </span>
        </div>
        <span className="tabular text-sm font-semibold text-cream-100">
          {formatarMoeda(instancia.totalAberto)}
        </span>
      </div>

      <div className="mb-3 flex flex-col gap-1">
        {instancia.itens.map((item) =>
          item.pago ? (
            <div key={item.lancamentoId} className="flex items-center gap-2 text-sm">
              <Check size={14} className="shrink-0 text-success" />
              <span className="flex-1 truncate text-cream-100/50 line-through">{item.descricao}</span>
              <span className="tabular text-cream-100/40">{formatarMoeda(item.valorPago ?? item.valor)}</span>
              <button
                onClick={() => reverterPagamento(item.lancamentoId)}
                className="flex items-center gap-1 text-xs text-cream-100/50 hover:text-danger"
              >
                <Undo2 size={12} /> Reverter
              </button>
            </div>
          ) : (
            <div key={item.lancamentoId} className="flex items-center gap-2 text-sm">
              {instanciaSelecionando === instancia.id && (
                <input
                  type="checkbox"
                  checked={selecionados.includes(item.lancamentoId)}
                  onChange={() => toggleSelecionado(item.lancamentoId)}
                  className="h-4 w-4"
                />
              )}
              <span className="flex-1 truncate text-cream-100/80">{item.descricao}</span>
              <span className="tabular text-cream-100/70">{formatarMoeda(item.valor)}</span>
            </div>
          )
        )}
      </div>

      {instancia.totalAberto <= 0 ? (
        <p className="flex items-center justify-center gap-1 rounded-xl border border-success/30 py-2 text-sm text-success">
          <Check size={14} /> Tudo pago nesta referência
        </p>
      ) : (
        <>
          <div className="flex gap-2">
            <button onClick={() => pagarTotal(instancia.id)} className="btn-gold flex-1 py-2 text-sm">
              Pagar Total
            </button>
            {instanciaSelecionando === instancia.id ? (
              <button
                onClick={() => pagarSelecionados(instancia.id)}
                disabled={selecionados.length === 0}
                className="flex-1 rounded-xl border border-gold-500 py-2 text-sm text-gold-300 disabled:opacity-40"
              >
                Pagar marcados ({selecionados.length})
              </button>
            ) : (
              <button
                onClick={() => {
                  setInstanciaSelecionando(instancia.id);
                  setSelecionados([]);
                }}
                className="flex-1 rounded-xl border border-navy-700 py-2 text-sm text-cream-100/70"
              >
                Selecionar
              </button>
            )}
          </div>
          <button onClick={onOutroValor} className="mt-2 w-full text-center text-xs text-gold-300 hover:text-gold-500">
            Outro valor
          </button>
        </>
      )}
    </div>
  );
}

function SubmodalOutroValor({
  instancia,
  mesReferencia,
  onClose,
  onSalvo,
}: {
  instancia: InstanciaEmAberto;
  mesReferencia: string;
  onClose: () => void;
  onSalvo: () => void;
}) {
  const [valorCentavos, setValorCentavos] = useState(numeroParaCentavos(instancia.totalAberto));
  const [descricao, setDescricao] = useState("Ajuste");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function salvar(confirmarDuplicado = false) {
    setErro("");
    const valorNumerico = centavosParaNumero(valorCentavos);
    if (!valorNumerico || valorNumerico <= 0) {
      setErro("Informe um valor maior que zero.");
      return;
    }

    if (valorNumerico < instancia.totalAberto && !confirmarDuplicado) {
      const confirma = confirm(
        "Você está pagando menos que o devido. A diferença vira pendência no próximo mês. Confirmar?"
      );
      if (!confirma) return;
    }

    setSalvando(true);
    try {
      await api.post("/api/pagamentos/outro-valor", {
        instanciaId: instancia.id,
        mesReferencia,
        valor: valorNumerico,
        descricao,
        confirmarDuplicado,
      });
      onSalvo();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        if (confirm(`${err.message} Deseja confirmar mesmo assim?`)) {
          await salvar(true);
          return;
        }
      } else {
        setErro(err instanceof ApiError ? err.message : "Nao foi possivel registrar o pagamento.");
      }
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center">
      <div className="card-dominium w-full max-w-sm rounded-b-none p-5 sm:rounded-b-2xl">
        <h2 className="mb-1 font-brand text-lg text-cream-100">Outro valor</h2>
        <p className="mb-4 text-xs text-cream-100/60">
          {instancia.nome} · devido {formatarMoeda(instancia.totalAberto)}
        </p>

        <CampoMoeda
          label="Valor pago"
          valorCentavos={valorCentavos}
          onChange={setValorCentavos}
          autoFocus
        />
        <div className="h-4" />

        <div className="mb-5">
          <label className="mb-1 block text-sm text-cream-100/80">Descrição</label>
          <input className="input-dominium" value={descricao} onChange={(e) => setDescricao(e.target.value)} />
        </div>

        {erro && <p className="mb-3 text-sm text-danger">{erro}</p>}

        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 rounded-xl border border-navy-700 py-3 text-sm text-cream-100/70">
            Cancelar
          </button>
          <button onClick={() => salvar()} className="btn-gold flex-1" disabled={salvando}>
            {salvando ? "Salvando..." : "Confirmar"}
          </button>
        </div>
      </div>
    </div>
  );
}

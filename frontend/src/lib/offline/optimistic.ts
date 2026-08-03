import { diferencaEmMeses, somarMeses } from "@/lib/mes";
import type {
  AporteLocal,
  LancamentoLocal,
  OperacaoOutbox,
  PayloadCriarLancamento,
  PayloadCriarResgate,
  ResgateLocal,
} from "@/lib/offline/types";

// Espelha o cálculo do backend (mesFim = mesInicio + parcelas - 1 e a
// competência por mesReferencia, ver backend/src/routes/lancamentos.js,
// competenciaDoLancamento) só pra pintar a UI na hora, antes do servidor
// confirmar. mesReferencia é o mês selecionado no seletor no momento da
// criação — sem ele (ex.: fluxo de investimentos, sem seletor de mês por
// aporte) assume-se o próprio mesInicio, ou seja, parcela 1.
export function construirLancamentoOtimista(op: OperacaoOutbox, mesReferencia?: string): LancamentoLocal {
  const payload = op.payload as PayloadCriarLancamento;
  const temporario = payload.tipo === "temporario";
  const parcelas = temporario ? payload.parcelas : null;
  const mesFim = temporario && parcelas ? somarMeses(payload.mesInicio, parcelas - 1) : null;

  let parcelaAtual: number | null = null;
  let restantes: number | null = null;
  let totalRestante: number | null = null;
  if (temporario && parcelas) {
    const ref = mesReferencia ?? payload.mesInicio;
    const indice = diferencaEmMeses(payload.mesInicio, ref) + 1;
    if (indice >= 1 && indice <= parcelas) {
      parcelaAtual = indice;
      restantes = parcelas - indice;
      totalRestante = restantes * payload.valor;
    }
  }

  return {
    id: op.clienteId,
    usuarioId: op.usuarioId,
    instanciaId: payload.instanciaId,
    descricao: payload.descricao,
    valor: payload.valor,
    tipo: payload.tipo,
    parcelas,
    mesInicio: payload.mesInicio,
    mesFim,
    valorMeta: null,
    valorUltimaParcela: null,
    valorAbatido: 0,
    valorRendimento: 0,
    valorBaseAcumulado: 0,
    ativo: true,
    observacoes: payload.observacoes,
    criadoEm: new Date(op.criadoEm).toISOString(),
    pagas: temporario ? 0 : null,
    valorParcela: payload.valor,
    parcelaAtual,
    restantes,
    totalRestante,
    syncStatus: op.status,
  };
}

// Mesmo formato de POST /api/investimentos/aporte (é um Lancamento por
// baixo). Os campos só-servidor do tipo Aporte (acumulado,
// parcelasDecorridas, metaBatida...) nunca são inventados aqui — ficam
// neutros até a reconciliação por id trazer o valor real do servidor.
export function construirAporteOtimista(op: OperacaoOutbox): AporteLocal {
  const payload = op.payload as PayloadCriarLancamento;
  const base = construirLancamentoOtimista(op);
  return {
    ...base,
    acumulado: 0,
    parcelasDecorridas: 0,
    parcelasRestantesComValor: payload.tipo === "temporario" ? payload.parcelas : null,
    proximaParcela: null,
    ultimaParcela: null,
    metaBatida: false,
  };
}

// Mesmo formato de POST /api/investimentos/resgate. O backend guarda o
// valor negativo (retirada) — o otimista espelha isso pra ListaValores
// exibir igual ao que vai vir do servidor depois de sincronizar.
export function construirResgateOtimista(op: OperacaoOutbox): ResgateLocal {
  const payload = op.payload as PayloadCriarResgate;
  return {
    id: op.clienteId,
    usuarioId: op.usuarioId,
    instanciaId: payload.instanciaId,
    descricao: payload.descricao,
    valor: -Math.abs(payload.valor),
    observacoes: payload.observacoes,
    criadoEm: new Date(op.criadoEm).toISOString(),
    syncStatus: op.status,
  };
}

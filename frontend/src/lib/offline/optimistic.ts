import { somarMeses } from "@/lib/mes";
import type { OperacaoOutbox, LancamentoLocal } from "@/lib/offline/types";

// Espelha o cálculo do backend (mesFim = mesInicio + parcelas - 1, ver
// backend/src/routes/lancamentos.js) só pra pintar a UI na hora. O valor
// real (pagas/restantes/totalRestante) vem do servidor assim que sincroniza;
// aqui é sempre "0 pagas" porque é um lançamento recém-criado, sem pagamento.
export function construirLancamentoOtimista(op: OperacaoOutbox): LancamentoLocal {
  const { payload } = op;
  const temporario = payload.tipo === "temporario";
  const parcelas = temporario ? payload.parcelas : null;
  const mesFim = temporario && parcelas ? somarMeses(payload.mesInicio, parcelas - 1) : null;

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
    restantes: temporario ? parcelas : null,
    totalRestante: temporario && parcelas ? parcelas * payload.valor : null,
    syncStatus: op.status,
  };
}

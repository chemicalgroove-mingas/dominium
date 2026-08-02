import { db } from "@/lib/offline/db";
import type {
  OperacaoOutbox,
  PayloadCriarLancamento,
  PayloadCriarResgate,
  TipoOperacaoOutbox,
} from "@/lib/offline/types";

async function enqueuarOperacao(
  usuarioId: string,
  tipo: TipoOperacaoOutbox,
  endpoint: string,
  payload: PayloadCriarLancamento | PayloadCriarResgate
) {
  const operacao: OperacaoOutbox = {
    opId: crypto.randomUUID(),
    usuarioId,
    clienteId: crypto.randomUUID(),
    tipo,
    endpoint,
    payload,
    status: "pending",
    tentativas: 0,
    proximaTentativaEm: 0,
    ultimoErro: null,
    criadoEm: Date.now(),
  };
  await db.outbox.add(operacao);
  return operacao;
}

export function enqueuarCriacaoLancamento(usuarioId: string, payload: PayloadCriarLancamento) {
  return enqueuarOperacao(usuarioId, "criar-lancamento", "/api/lancamentos", payload);
}

export function enqueuarCriacaoAporte(usuarioId: string, payload: PayloadCriarLancamento) {
  return enqueuarOperacao(usuarioId, "criar-aporte", "/api/investimentos/aporte", payload);
}

export function enqueuarCriacaoResgate(usuarioId: string, payload: PayloadCriarResgate) {
  return enqueuarOperacao(usuarioId, "criar-resgate", "/api/investimentos/resgate", payload);
}

export function listarPendentes(usuarioId: string) {
  return db.outbox.where({ usuarioId }).sortBy("criadoEm");
}

export function listarNaoConcluidas(usuarioId: string) {
  return db.outbox
    .where({ usuarioId })
    .filter((op) => op.status !== "synced")
    .sortBy("criadoEm");
}

// Filtra a fila não-concluída por tipo — usado pelas telas pra montar a
// visualização otimista (ex.: só "criar-aporte" pra Reserva) sem misturar
// operações de outros domínios.
export async function listarNaoConcluidasPorTipo(usuarioId: string, tipos: TipoOperacaoOutbox[]) {
  const todas = await listarNaoConcluidas(usuarioId);
  return todas.filter((op) => tipos.includes(op.tipo));
}

export async function marcarSincronizando(opId: string) {
  await db.outbox.update(opId, { status: "syncing" });
}

export async function marcarSincronizado(opId: string) {
  await db.outbox.delete(opId);
}

export async function marcarFalhaTransitoria(opId: string, erro: string, proximaTentativaEm: number) {
  const atual = await db.outbox.get(opId);
  await db.outbox.update(opId, {
    status: "pending",
    tentativas: (atual?.tentativas ?? 0) + 1,
    ultimoErro: erro,
    proximaTentativaEm,
  });
}

export async function marcarFalhaPermanente(opId: string, erro: string) {
  await db.outbox.update(opId, { status: "failed", ultimoErro: erro });
}

export async function removerOperacao(opId: string) {
  await db.outbox.delete(opId);
}

export async function limparOutboxDoUsuario(usuarioId: string) {
  await db.outbox.where({ usuarioId }).delete();
}

// Isolamento entre contas no mesmo aparelho: nada do usuário que saiu deve
// sobrar pro próximo login (nem a fila, nem o espelho de instâncias, nem o
// snapshot de sessão, nem os snapshots de leitura das telas).
export async function limparDadosLocaisDoUsuario(usuarioId: string) {
  await db.transaction("rw", db.outbox, db.instanciasCache, db.sessaoLocal, db.snapshots, async () => {
    await db.outbox.where({ usuarioId }).delete();
    await db.instanciasCache.where({ usuarioId }).delete();
    await db.sessaoLocal.clear();
    await db.snapshots.where({ usuarioId }).delete();
  });
}

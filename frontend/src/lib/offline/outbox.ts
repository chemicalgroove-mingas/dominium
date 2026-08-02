import { db } from "@/lib/offline/db";
import type { OperacaoOutbox, PayloadCriarLancamento } from "@/lib/offline/types";

export async function enqueuarCriacaoLancamento(usuarioId: string, payload: PayloadCriarLancamento) {
  const operacao: OperacaoOutbox = {
    opId: crypto.randomUUID(),
    usuarioId,
    clienteId: crypto.randomUUID(),
    tipo: "criar-lancamento",
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

export function listarPendentes(usuarioId: string) {
  return db.outbox.where({ usuarioId }).sortBy("criadoEm");
}

export function listarNaoConcluidas(usuarioId: string) {
  return db.outbox
    .where({ usuarioId })
    .filter((op) => op.status !== "synced")
    .sortBy("criadoEm");
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
// sobrar pro próximo login (nem a fila, nem o espelho de instâncias).
export async function limparDadosLocaisDoUsuario(usuarioId: string) {
  await db.transaction("rw", db.outbox, db.instanciasCache, async () => {
    await db.outbox.where({ usuarioId }).delete();
    await db.instanciasCache.where({ usuarioId }).delete();
  });
}

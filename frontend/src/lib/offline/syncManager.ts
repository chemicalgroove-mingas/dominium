import { api, ApiError } from "@/lib/api";
import { db } from "@/lib/offline/db";
import {
  listarPendentes,
  marcarFalhaPermanente,
  marcarFalhaTransitoria,
  marcarSincronizado,
  marcarSincronizando,
} from "@/lib/offline/outbox";

const BACKOFF_MS = [5000, 15000, 30000, 60000];

const emAndamento = new Set<string>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();

function agendarProximaTentativa(usuarioId: string, delayMs: number) {
  const existente = timers.get(usuarioId);
  if (existente) clearTimeout(existente);
  const id = setTimeout(() => {
    timers.delete(usuarioId);
    tentarSincronizar(usuarioId);
  }, delayMs);
  timers.set(usuarioId, id);
}

export function cancelarTentativasAgendadas(usuarioId: string) {
  const existente = timers.get(usuarioId);
  if (existente) clearTimeout(existente);
  timers.delete(usuarioId);
}

// Drena a outbox em ordem, sequencialmente, um usuário por vez. Erros 5xx/rede
// são transitórios (retry com backoff); 4xx é permanente (fica "failed" pra
// correção manual); 401/403 pausa a fila inteira sem marcar erro — a sessão
// caducou, não o dado, e a próxima tentativa (pós-login) resolve sozinha.
export async function tentarSincronizar(usuarioId: string): Promise<void> {
  if (!usuarioId) return;
  if (typeof navigator !== "undefined" && !navigator.onLine) return;
  if (emAndamento.has(usuarioId)) return;

  emAndamento.add(usuarioId);
  try {
    const pendentes = await listarPendentes(usuarioId);
    const agora = Date.now();

    for (const op of pendentes) {
      if (op.status !== "pending" || op.proximaTentativaEm > agora) continue;

      await marcarSincronizando(op.opId);
      try {
        // Agnóstico de domínio: cada tipo de operação só difere no endpoint
        // e no formato do payload (ver lib/offline/outbox.ts) — o id do
        // cliente reaproveitado como id definitivo é o que garante retry
        // idempotente em qualquer um deles (mesmo padrão do backend em
        // lancamentos.js e investimentos.js: P2002 em retry vira sucesso).
        await api.post<unknown>(op.endpoint, {
          ...op.payload,
          id: op.clienteId,
        });
        await marcarSincronizado(op.opId);
      } catch (err) {
        if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
          await db.outbox.update(op.opId, { status: "pending" });
          break;
        }
        if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
          await marcarFalhaPermanente(op.opId, err.message);
          continue;
        }
        const delay = BACKOFF_MS[Math.min(op.tentativas, BACKOFF_MS.length - 1)];
        const mensagem = err instanceof Error ? err.message : "Falha de rede.";
        await marcarFalhaTransitoria(op.opId, mensagem, Date.now() + delay);
        agendarProximaTentativa(usuarioId, delay);
      }
    }
  } finally {
    emAndamento.delete(usuarioId);
  }
}

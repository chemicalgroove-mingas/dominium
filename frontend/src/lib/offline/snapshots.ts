import { db } from "@/lib/offline/db";
import type { Snapshot } from "@/lib/offline/types";

// Guarda a última resposta bem-sucedida de uma tela de leitura, tal como
// veio do backend — nunca recalculada no cliente. Serve só pra continuidade
// visual offline (mostrar "última atualização" em vez de zero/vazio); a
// fonte de verdade continua sendo o servidor assim que há rede.
export async function salvarSnapshot<T>(tela: string, usuarioId: string, dados: T) {
  const chave = `${tela}:${usuarioId}`;
  const registro: Snapshot<T> = { chave, usuarioId, dados, atualizadoEm: Date.now() };
  await db.snapshots.put(registro);
}

export async function lerSnapshot<T>(tela: string, usuarioId: string): Promise<Snapshot<T> | null> {
  const chave = `${tela}:${usuarioId}`;
  const registro = await db.snapshots.get(chave);
  return (registro as Snapshot<T> | undefined) ?? null;
}

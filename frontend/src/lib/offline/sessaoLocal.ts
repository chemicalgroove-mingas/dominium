import { db } from "@/lib/offline/db";
import type { Usuario } from "@/lib/types";

const CHAVE = "atual" as const;

// Espelha o maxAge do cookie de sessão (7 dias — ver cookieOptions em
// backend/src/routes/auth.js). Depois disso o snapshot local não é mais
// usado pra abrir o app offline, mesmo que ainda esteja no IndexedDB.
const VALIDADE_MS = 7 * 24 * 60 * 60 * 1000;

export async function salvarSessaoLocal(usuario: Usuario) {
  await db.sessaoLocal.put({ chave: CHAVE, usuario, atualizadoEm: Date.now() });
}

export async function lerSessaoLocalValida(): Promise<Usuario | null> {
  const registro = await db.sessaoLocal.get(CHAVE);
  if (!registro) return null;
  if (Date.now() - registro.atualizadoEm > VALIDADE_MS) return null;
  return registro.usuario;
}

export async function limparSessaoLocal() {
  await db.sessaoLocal.delete(CHAVE);
}

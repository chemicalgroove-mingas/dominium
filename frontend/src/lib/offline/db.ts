import Dexie, { type Table } from "dexie";
import type { InstanciaCache, OperacaoOutbox, SessaoLocal } from "@/lib/offline/types";

// Camada local do DOMINIUM — guarda só o necessário pra abrir o app shell
// offline e não perder o que o usuário acabou de digitar, de propósito:
//
// 1. `outbox`: operações que o usuário já fez na tela mas ainda não foram
//    confirmadas pelo servidor (o próprio dado que ele digitou, não um
//    cache de resposta de API).
// 2. `instanciasCache`: espelho de leitura só de metadados de agrupamento
//    (nome/cor/grupo) — nunca saldo, lançamento ou qualquer valor
//    monetário. Mesmo princípio do Service Worker da Fase 1: dado
//    financeiro nunca vem do cache.
// 3. `sessaoLocal`: snapshot não-sensível do último /api/auth/me bem
//    sucedido (mesmo formato já exposto ao cliente — sem senha/token),
//    usado só pra decidir se um cold start offline pode abrir o shell.
class DominiumOfflineDB extends Dexie {
  outbox!: Table<OperacaoOutbox, string>;
  instanciasCache!: Table<InstanciaCache, string>;
  sessaoLocal!: Table<SessaoLocal, string>;

  constructor() {
    super("dominium-offline");
    this.version(1).stores({
      outbox: "opId, usuarioId, status, criadoEm",
      instanciasCache: "id, usuarioId, grupo",
    });
    this.version(2).stores({
      outbox: "opId, usuarioId, status, criadoEm",
      instanciasCache: "id, usuarioId, grupo",
      sessaoLocal: "chave",
    });
  }
}

export const db = new DominiumOfflineDB();

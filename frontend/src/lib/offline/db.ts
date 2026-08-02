import Dexie, { type Table } from "dexie";
import type { InstanciaCache, OperacaoOutbox } from "@/lib/offline/types";

// Camada local do DOMINIUM — guarda só duas coisas, de propósito:
//
// 1. `outbox`: operações que o usuário já fez na tela mas ainda não foram
//    confirmadas pelo servidor (o próprio dado que ele digitou, não um
//    cache de resposta de API).
// 2. `instanciasCache`: espelho de leitura só de metadados de agrupamento
//    (nome/cor/grupo) — nunca saldo, lançamento ou qualquer valor
//    monetário. Mesmo princípio do Service Worker da Fase 1: dado
//    financeiro nunca vem do cache.
class DominiumOfflineDB extends Dexie {
  outbox!: Table<OperacaoOutbox, string>;
  instanciasCache!: Table<InstanciaCache, string>;

  constructor() {
    super("dominium-offline");
    this.version(1).stores({
      outbox: "opId, usuarioId, status, criadoEm",
      instanciasCache: "id, usuarioId, grupo",
    });
  }
}

export const db = new DominiumOfflineDB();

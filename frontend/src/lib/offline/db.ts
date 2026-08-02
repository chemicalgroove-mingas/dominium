import Dexie, { type Table } from "dexie";
import type { InstanciaCache, OperacaoOutbox, SessaoLocal, Snapshot } from "@/lib/offline/types";

// Camada local do DOMINIUM — guarda só o necessário pra abrir o app shell
// offline e não perder o que o usuário acabou de digitar, de propósito:
//
// 1. `outbox`: operações que o usuário já fez na tela mas ainda não foram
//    confirmadas pelo servidor (o próprio dado que ele digitou, não um
//    cache de resposta de API). Genérica por `tipo`/`endpoint` — várias
//    telas reaproveitam a mesma fila (ver lib/offline/outbox.ts).
// 2. `instanciasCache`: espelho de leitura só de metadados de agrupamento
//    (nome/cor/grupo) — nunca saldo, lançamento ou qualquer valor
//    monetário. Mesmo princípio do Service Worker da Fase 1: dado
//    financeiro nunca vem do cache.
// 3. `sessaoLocal`: snapshot não-sensível do último /api/auth/me bem
//    sucedido (mesmo formato já exposto ao cliente — sem senha/token),
//    usado só pra decidir se um cold start offline pode abrir o shell.
// 4. `snapshots`: última resposta bem-sucedida de uma tela de leitura
//    (Dashboard, Pagamentos, Reserva, gaveta de Lançamentos), guardada tal
//    como veio do backend, pra continuidade visual offline — nunca fonte
//    de verdade financeira, só o último dado confirmado com timestamp.
class DominiumOfflineDB extends Dexie {
  outbox!: Table<OperacaoOutbox, string>;
  instanciasCache!: Table<InstanciaCache, string>;
  sessaoLocal!: Table<SessaoLocal, string>;
  snapshots!: Table<Snapshot<unknown>, string>;

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
    this.version(3)
      .stores({
        outbox: "opId, usuarioId, status, criadoEm",
        instanciasCache: "id, usuarioId, grupo",
        sessaoLocal: "chave",
        snapshots: "chave, usuarioId",
      })
      .upgrade(async (tx) => {
        // Linhas de outbox já persistidas (todas "criar-lancamento" antes
        // desta versão) não tinham `endpoint` — preenche em vez de apagar,
        // pra não perder nenhuma operação pendente na atualização.
        await tx
          .table("outbox")
          .toCollection()
          .modify((op: OperacaoOutbox) => {
            if (!op.endpoint) op.endpoint = "/api/lancamentos";
          });
      });
  }
}

export const db = new DominiumOfflineDB();

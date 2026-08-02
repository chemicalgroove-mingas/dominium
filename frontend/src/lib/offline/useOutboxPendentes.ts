"use client";

import { useEffect, useState } from "react";
import { liveQuery } from "dexie";
import { db } from "@/lib/offline/db";
import type { OperacaoOutbox } from "@/lib/offline/types";

// Linhas sincronizadas são removidas da outbox (ver marcarSincronizado), então
// esta query já reflete só o que está pendente/sincronizando/com falha.
export function useOutboxPendentes(usuarioId: string | undefined) {
  const [operacoes, setOperacoes] = useState<OperacaoOutbox[]>([]);

  useEffect(() => {
    if (!usuarioId) return;
    const observavel = liveQuery(() => db.outbox.where({ usuarioId }).sortBy("criadoEm"));
    const inscricao = observavel.subscribe({
      next: (valor) => setOperacoes(valor),
      error: () => setOperacoes([]),
    });
    return () => inscricao.unsubscribe();
  }, [usuarioId]);

  return operacoes;
}

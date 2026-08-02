"use client";

import { CloudOff, RefreshCw, AlertTriangle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useOutboxPendentes } from "@/lib/offline/useOutboxPendentes";
import { tentarSincronizar } from "@/lib/offline/syncManager";

// Indicador discreto do estado da fila de sincronização. Fica em silêncio
// (não renderiza nada) quando tudo já sincronizou — sem toast repetitivo a
// cada sucesso, só sinaliza quando há algo pendente/falho pra olhar.
export function SyncStatusBadge() {
  const { usuario } = useAuth();
  const operacoes = useOutboxPendentes(usuario?.id);

  if (operacoes.length === 0) return null;

  const comFalha = operacoes.filter((op) => op.status === "failed");
  const sincronizando = operacoes.some((op) => op.status === "syncing");

  if (comFalha.length > 0) {
    return (
      <button
        onClick={() => usuario && tentarSincronizar(usuario.id)}
        className="flex items-center gap-1.5 rounded-lg border border-danger/40 bg-danger/10 px-2.5 py-1 text-[11px] text-danger"
      >
        <AlertTriangle size={12} />
        {comFalha.length} falha{comFalha.length > 1 ? "s" : ""} ao sincronizar — tentar de novo
      </button>
    );
  }

  return (
    <span className="flex items-center gap-1.5 rounded-lg border border-gold-500/25 px-2.5 py-1 text-[11px] text-cream-100/60">
      {sincronizando ? <RefreshCw size={12} className="animate-spin" /> : <CloudOff size={12} />}
      {sincronizando ? "Sincronizando…" : `${operacoes.length} pendente${operacoes.length > 1 ? "s" : ""}`}
    </span>
  );
}

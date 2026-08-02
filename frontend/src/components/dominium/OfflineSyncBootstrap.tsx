"use client";

import { useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { tentarSincronizar } from "@/lib/offline/syncManager";

// Dispara a fila de sincronização nos momentos em que faz sentido: app
// autenticado montando, conexão voltando, ou o PWA voltando ao primeiro
// plano. Não depende de Background Sync (suporte inconsistente no iOS).
export function OfflineSyncBootstrap() {
  const { usuario } = useAuth();

  useEffect(() => {
    if (!usuario) return;

    tentarSincronizar(usuario.id);

    const aoFicarOnline = () => tentarSincronizar(usuario.id);
    const aoMudarVisibilidade = () => {
      if (document.visibilityState === "visible") tentarSincronizar(usuario.id);
    };

    window.addEventListener("online", aoFicarOnline);
    document.addEventListener("visibilitychange", aoMudarVisibilidade);
    return () => {
      window.removeEventListener("online", aoFicarOnline);
      document.removeEventListener("visibilitychange", aoMudarVisibilidade);
    };
  }, [usuario]);

  return null;
}

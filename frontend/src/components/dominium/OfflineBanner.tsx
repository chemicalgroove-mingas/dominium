"use client";

import { WifiOff } from "lucide-react";
import { useOnlineStatus } from "@/lib/offline/useOnlineStatus";

export function OfflineBanner() {
  const online = useOnlineStatus();

  if (online) return null;

  return (
    <div
      className="fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-2 bg-danger px-4 py-2 text-center text-xs font-medium text-navy-950"
      style={{ paddingTop: "calc(0.5rem + env(safe-area-inset-top))" }}
    >
      <WifiOff size={14} />
      Sem conexão. Reconecte para ver seus dados.
      <button onClick={() => window.location.reload()} className="ml-2 underline">
        Tentar novamente
      </button>
    </div>
  );
}

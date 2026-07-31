"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { useInstancias } from "@/contexts/InstanciasContext";
import { LancamentoQuickAdd } from "./LancamentoQuickAdd";

export function Fab() {
  const [aberto, setAberto] = useState(false);
  const { instancias, carregando } = useInstancias();

  return (
    <>
      <button
        onClick={() => setAberto(true)}
        disabled={carregando || instancias.length === 0}
        aria-label="Novo lançamento"
        className="btn-gold fixed bottom-20 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full p-0 shadow-lg sm:bottom-8 disabled:opacity-40"
      >
        <Plus size={26} />
      </button>
      {aberto && <LancamentoQuickAdd onClose={() => setAberto(false)} />}
    </>
  );
}

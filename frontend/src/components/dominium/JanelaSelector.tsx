"use client";

import { useRecorte } from "@/contexts/RecorteContext";
import { JANELAS } from "@/lib/cores";

export function JanelaSelector() {
  const { janela, setJanela } = useRecorte();
  return (
    <div className="flex gap-1 rounded-xl border border-navy-700 p-1">
      {JANELAS.map((j) => (
        <button
          key={j.value}
          onClick={() => setJanela(j.value)}
          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
            janela === j.value ? "bg-gold-500 text-navy-950" : "text-cream-100/60 hover:text-cream-100"
          }`}
        >
          {j.label}
        </button>
      ))}
    </div>
  );
}

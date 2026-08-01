"use client";

import { useState } from "react";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { anoDoMes, montarMes, numeroDoMes, MESES_ABREV } from "@/lib/mes";

export function CampoMes({
  label,
  value,
  onChange,
  min,
}: {
  label?: string;
  value: string;
  onChange: (mes: string) => void;
  min?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const [anoView, setAnoView] = useState(() => (value ? anoDoMes(value) : new Date().getFullYear()));

  const mesSelecionado = value ? numeroDoMes(value) : null;
  const anoSelecionado = value ? anoDoMes(value) : null;

  return (
    <div className="relative">
      {label && <label className="mb-1 block text-sm text-cream-100/80">{label}</label>}
      <button
        type="button"
        onClick={() => {
          setAnoView(value ? anoDoMes(value) : new Date().getFullYear());
          setAberto((a) => !a);
        }}
        className="input-dominium flex items-center justify-between gap-2"
      >
        <span className="tabular">
          {value ? `${String(mesSelecionado).padStart(2, "0")}.${anoSelecionado}` : "mm.aaaa"}
        </span>
        <Calendar size={16} className="shrink-0 text-cream-100/70" />
      </button>

      {aberto && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setAberto(false)} />
          <div className="absolute z-50 mt-1 w-60 rounded-xl border border-navy-700 bg-navy-800 p-3 shadow-lg">
            <div className="mb-2 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setAnoView((a) => a - 1)}
                aria-label="Ano anterior"
                className="p-1 text-cream-100/50 hover:text-gold-300"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="tabular text-sm font-semibold text-cream-100">{anoView}</span>
              <button
                type="button"
                onClick={() => setAnoView((a) => a + 1)}
                aria-label="Próximo ano"
                className="p-1 text-cream-100/50 hover:text-gold-300"
              >
                <ChevronRight size={16} />
              </button>
            </div>
            <div className="grid grid-cols-4 gap-1">
              {MESES_ABREV.map((label2, i) => {
                const numero = i + 1;
                const mesChave = montarMes(anoView, numero);
                const selecionado = anoView === anoSelecionado && numero === mesSelecionado;
                const desabilitado = min ? mesChave < min : false;
                return (
                  <button
                    key={label2}
                    type="button"
                    disabled={desabilitado}
                    onClick={() => {
                      onChange(mesChave);
                      setAberto(false);
                    }}
                    className={`rounded-lg py-1.5 text-xs font-medium ${
                      selecionado
                        ? "border border-gold-500 bg-gold-500/10 text-gold-300"
                        : desabilitado
                          ? "text-cream-100/20"
                          : "text-cream-100/70 hover:bg-navy-700"
                    }`}
                  >
                    {label2}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

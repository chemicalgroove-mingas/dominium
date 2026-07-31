"use client";

import { digitosParaCentavos, formatarCentavos } from "@/lib/moeda";

export function CampoMoeda({
  label,
  valorCentavos,
  onChange,
  placeholder = "0,00",
  autoFocus,
  required,
  compacto = false,
}: {
  label?: string;
  valorCentavos: number;
  onChange: (centavos: number) => void;
  placeholder?: string;
  autoFocus?: boolean;
  required?: boolean;
  compacto?: boolean;
}) {
  return (
    <div className={compacto ? "w-28" : undefined}>
      {label && <label className="mb-1 block text-sm text-cream-100/80">{label}</label>}
      <div className={`input-dominium tabular flex items-center gap-1.5 ${compacto ? "py-1.5" : ""}`}>
        <span className="text-cream-100/50">R$</span>
        <input
          className="w-full min-w-0 bg-transparent outline-none"
          inputMode="numeric"
          placeholder={placeholder}
          value={valorCentavos ? formatarCentavos(valorCentavos) : ""}
          onChange={(e) => onChange(digitosParaCentavos(e.target.value))}
          autoFocus={autoFocus}
          required={required}
        />
      </div>
    </div>
  );
}

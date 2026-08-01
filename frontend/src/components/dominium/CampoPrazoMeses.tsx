"use client";

import { useState } from "react";
import { ListPlus } from "lucide-react";

const ATALHOS = [3, 6, 9, 12, 18, 24, 36, 48, 60];

export function CampoPrazoMeses({
  label,
  value,
  onChange,
  disabled = false,
}: {
  label?: string;
  value: number | "";
  onChange: (meses: number | "") => void;
  disabled?: boolean;
}) {
  const [aberto, setAberto] = useState(false);

  return (
    <div className="relative">
      {label && <label className="mb-1 block text-sm text-cream-100/80">{label}</label>}
      <div className={`input-dominium flex items-center gap-2 ${disabled ? "opacity-40" : ""}`}>
        <input
          type="number"
          inputMode="numeric"
          min={1}
          placeholder="Ex: 12"
          className="w-full min-w-0 bg-transparent outline-none disabled:cursor-not-allowed [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          value={value}
          disabled={disabled}
          onChange={(e) => {
            const digitado = e.target.value;
            onChange(digitado === "" ? "" : Math.max(1, Number(digitado)));
          }}
        />
        <button
          type="button"
          onClick={() => !disabled && setAberto((a) => !a)}
          aria-label="Escolher prazo comum"
          disabled={disabled}
          className="shrink-0 text-cream-100/70 hover:text-gold-300 disabled:cursor-not-allowed"
        >
          <ListPlus size={16} />
        </button>
      </div>

      {aberto && !disabled && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setAberto(false)} />
          <div className="absolute right-0 z-50 mt-1 w-48 rounded-xl border border-navy-700 bg-navy-800 p-2 shadow-lg">
            <div className="grid grid-cols-3 gap-1">
              {ATALHOS.map((meses) => (
                <button
                  key={meses}
                  type="button"
                  onClick={() => {
                    onChange(meses);
                    setAberto(false);
                  }}
                  className={`rounded-lg py-1.5 text-xs font-medium ${
                    value === meses
                      ? "border border-gold-500 bg-gold-500/10 text-gold-300"
                      : "text-cream-100/70 hover:bg-navy-700"
                  }`}
                >
                  {meses}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

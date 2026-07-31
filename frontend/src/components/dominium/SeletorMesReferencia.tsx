"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useRecorte } from "@/contexts/RecorteContext";
import { anoDoMes, mesAtual, numeroDoMes, MESES_ABREV } from "@/lib/mes";

export function SeletorMesReferencia() {
  const { mesReferencia, irParaMesNumero, mudarAno, voltarParaMesAtual } = useRecorte();
  const ano = anoDoMes(mesReferencia);
  const mesSelecionado = numeroDoMes(mesReferencia);
  const ehMesAtual = mesReferencia === mesAtual();

  return (
    <div className="card-dominium flex flex-col gap-3 p-3">
      <div className="flex flex-wrap gap-1.5">
        {MESES_ABREV.map((label, i) => {
          const numero = i + 1;
          const ativo = numero === mesSelecionado;
          return (
            <button
              key={label}
              onClick={() => irParaMesNumero(numero)}
              className={`min-w-[3.2rem] flex-1 rounded-lg border py-2 text-xs font-medium ${
                ativo ? "border-gold-500 bg-gold-500/10 text-gold-300" : "border-navy-700 text-cream-100/60"
              }`}
            >
              {label}
            </button>
          );
        })}
        <div className="flex items-center gap-1 rounded-lg border border-navy-700 px-2">
          <button onClick={() => mudarAno(-1)} aria-label="Ano anterior" className="p-1 text-cream-100/50 hover:text-gold-300">
            <ChevronLeft size={14} />
          </button>
          <span className="tabular text-xs font-semibold text-cream-100">{ano}</span>
          <button onClick={() => mudarAno(1)} aria-label="Próximo ano" className="p-1 text-cream-100/50 hover:text-gold-300">
            <ChevronRight size={14} />
          </button>
        </div>
      </div>
      {!ehMesAtual && (
        <button onClick={voltarParaMesAtual} className="self-start text-xs text-gold-300 hover:text-gold-500">
          voltar para o mês atual
        </button>
      )}
    </div>
  );
}

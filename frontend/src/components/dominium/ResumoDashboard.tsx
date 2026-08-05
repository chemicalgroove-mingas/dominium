"use client";

import { corComprometimento, corPorSinal, formatarMoeda } from "@/lib/format";
import type { DashboardData } from "@/lib/types";

export function ResumoDashboard({ dados, compacto = false }: { dados: DashboardData; compacto?: boolean }) {
  return (
    <div className={`grid grid-cols-2 gap-3 ${compacto ? "" : "sm:grid-cols-3"}`}>
      <div className="card-dominium card-resumo overflow-hidden p-3">
        <p className="text-[11px] text-cream-100/60">Saldo do período</p>
        <p
          className={`tabular font-semibold ${compacto ? "valor-resumo-sm" : "valor-resumo"} ${corPorSinal(dados.saldoPeriodo)}`}
        >
          {formatarMoeda(dados.saldoPeriodo)}
        </p>
      </div>
      <div className="card-dominium card-resumo overflow-hidden p-3">
        <p className="text-[11px] text-cream-100/60">Comprometimento</p>
        <p
          className={`tabular font-semibold ${compacto ? "valor-resumo-sm" : "valor-resumo"} ${corComprometimento(dados.comprometimento)}`}
        >
          {dados.comprometimento.toFixed(0)}%
        </p>
      </div>
      {!compacto && (
        <div className="card-dominium card-resumo overflow-hidden p-3">
          <p className="text-[11px] text-cream-100/60">Sobra livre/mês</p>
          <p className={`tabular valor-resumo font-semibold ${corPorSinal(dados.sobraLivreMes)}`}>
            {formatarMoeda(dados.sobraLivreMes)}
          </p>
        </div>
      )}
    </div>
  );
}

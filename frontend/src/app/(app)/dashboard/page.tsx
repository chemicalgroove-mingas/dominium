"use client";

import { useCallback, useEffect, useState } from "react";
import { Area, AreaChart, Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { api } from "@/lib/api";
import { formatarMoeda } from "@/lib/format";
import { formatarMesCurto, formatarMesLabel } from "@/lib/mes";
import { useRecorte } from "@/contexts/RecorteContext";
import { JanelaSelector } from "@/components/dominium/JanelaSelector";
import { SeletorMesReferencia } from "@/components/dominium/SeletorMesReferencia";
import type { DashboardData } from "@/lib/types";

export default function DashboardPage() {
  const { janela, mesReferencia } = useRecorte();
  const [dados, setDados] = useState<DashboardData | null>(null);

  const carregar = useCallback(async () => {
    const data = await api.get<DashboardData>(`/api/dashboard?janela=${janela}&mesReferencia=${mesReferencia}`);
    setDados(data);
  }, [janela, mesReferencia]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  if (!dados) {
    return <p className="text-cream-100/60">Carregando...</p>;
  }

  if (dados.totalInstancias === 0) {
    return (
      <div className="card-dominium mx-auto max-w-xl p-6 text-center text-sm text-cream-100/70">
        Comece criando suas instâncias em <span className="text-gold-300">Lançamentos</span> — gastos,
        receitas e contas de investimento.
      </div>
    );
  }

  const consolidadoCompleto = [
    ...dados.saldoAcumuladoHistorico,
    ...dados.saldoConsolidado,
  ];

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-brand text-2xl text-cream-100">Dashboard</h1>
          <p className="text-xs text-cream-100/50">Referência: {formatarMesLabel(mesReferencia)}</p>
        </div>
        <JanelaSelector />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="card-dominium p-4">
          <p className="text-xs text-cream-100/60">Receita no período</p>
          <p className="tabular text-2xl font-semibold text-success">{formatarMoeda(dados.receitaPeriodo)}</p>
        </div>
        <div className="card-dominium p-4">
          <p className="text-xs text-cream-100/60">Despesa no período</p>
          <p className="tabular text-2xl font-semibold text-danger">{formatarMoeda(dados.despesaPeriodo)}</p>
        </div>
        <div className="card-dominium p-4">
          <p className="text-xs text-cream-100/60">Saldo no período</p>
          <p className="tabular text-gold-gradient text-2xl font-semibold">{formatarMoeda(dados.saldoPeriodo)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="card-dominium p-4">
          <p className="text-xs text-cream-100/60">Sobra do mês</p>
          <p className="tabular text-2xl font-semibold text-success">{formatarMoeda(dados.sobraLivreMes)}</p>
        </div>
        <div className="card-dominium p-4">
          <p className="text-xs text-cream-100/60">Comprometimento</p>
          <p className="tabular text-2xl font-semibold text-cream-100">{dados.comprometimento.toFixed(0)}%</p>
        </div>
        <div className="card-dominium p-4">
          <p className="text-xs text-cream-100/60">Reserva</p>
          <p className="tabular text-gold-gradient text-2xl font-semibold">
            {formatarMoeda(dados.patrimonioInvestido)}
          </p>
        </div>
      </div>

      <SeletorMesReferencia />

      {consolidadoCompleto.length > 1 && (
        <div className="card-dominium p-4">
          <p className="mb-3 text-sm text-cream-100/70">
            Saldo ao longo do tempo <span className="text-cream-100/40">(histórico + projeção)</span>
          </p>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={consolidadoCompleto}>
              <defs>
                <linearGradient id="ouro" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#C9A24B" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="#C9A24B" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="mes" tickFormatter={formatarMesCurto} stroke="#8496AC" fontSize={12} />
              <Tooltip
                formatter={(value) => formatarMoeda(Number(value))}
                labelFormatter={(v) => formatarMesCurto(String(v))}
                contentStyle={{ background: "#16283F", border: "1px solid #1F3552", borderRadius: 8 }}
                labelStyle={{ color: "#F7F5F0" }}
              />
              <Area type="monotone" dataKey="saldoAcumulado" stroke="#C9A24B" fill="url(#ouro)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
          <p className="mt-2 text-xs text-cream-100/50">
            Histórico total acumulado: {formatarMoeda(dados.totalHistorico)}
          </p>
        </div>
      )}

      <div className="card-dominium p-4">
        <p className="mb-3 text-sm text-cream-100/70">
          Evolução mensal (receita × gasto × folga) <span className="text-cream-100/40">a partir de {formatarMesLabel(mesReferencia)}</span>
        </p>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={dados.evolucaoMensal}>
            <XAxis dataKey="mes" tickFormatter={formatarMesCurto} stroke="#8496AC" fontSize={12} />
            <Tooltip
              formatter={(value) => formatarMoeda(Number(value))}
              labelFormatter={(v) => formatarMesCurto(String(v))}
              contentStyle={{ background: "#16283F", border: "1px solid #1F3552", borderRadius: 8 }}
              labelStyle={{ color: "#F7F5F0" }}
            />
            <Bar dataKey="receita" fill="#4CAF7D" radius={[4, 4, 0, 0]} />
            <Bar dataKey="gasto" fill="#D9614F" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
        <div className="mt-3 flex flex-col gap-1">
          {dados.evolucaoMensal.map((m) => (
            <div key={m.mes} className="flex items-center gap-2 text-xs text-cream-100/60">
              <span className="w-14 shrink-0">{formatarMesCurto(m.mes)}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-navy-700">
                <div
                  className="h-full bg-gold-500"
                  style={{ width: `${Math.min(m.proximidade, 100)}%` }}
                />
              </div>
              <span className="w-12 shrink-0 text-right">{m.proximidade.toFixed(0)}%</span>
            </div>
          ))}
        </div>
      </div>

      {dados.impactoPorInstancia.length > 0 && (
        <div className="card-dominium p-4">
          <p className="mb-3 text-sm text-cream-100/70">Impacto por instância</p>
          <div className="flex flex-col gap-2">
            {dados.impactoPorInstancia.map((i) => (
              <div key={i.id} className="flex items-center gap-3">
                <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: i.cor }} />
                <span className="flex-1 truncate text-sm text-cream-100">{i.nome}</span>
                <span className="tabular text-sm font-medium text-cream-100">{formatarMoeda(i.total)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card-dominium p-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm text-cream-100/70">Patrimônio investido</p>
          <span className="tabular text-lg font-semibold text-gold-gradient">
            {formatarMoeda(dados.patrimonioInvestido)}
          </span>
        </div>
        <div className="flex flex-col gap-1">
          {dados.contasInvestimento.map((c) => (
            <div key={c.id} className="flex items-center gap-2 text-sm">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: c.cor }} />
              <span className="flex-1 truncate text-cream-100/80">{c.nome}</span>
              <span className="tabular text-cream-100">{formatarMoeda(c.patrimonio)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

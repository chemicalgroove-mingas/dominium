"use client";

import { useCallback, useEffect, useState } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { api } from "@/lib/api";
import { formatarMesAno, formatarMoeda } from "@/lib/format";
import { IconePorNome } from "@/lib/icons";
import type { DashboardData } from "@/lib/types";

export default function DashboardPage() {
  const [dados, setDados] = useState<DashboardData | null>(null);

  const carregar = useCallback(async () => {
    const data = await api.get<DashboardData>("/api/dashboard");
    setDados(data);
  }, []);

  useEffect(() => {
    carregar();
    window.addEventListener("dominium:lancamento-criado", carregar);
    return () => window.removeEventListener("dominium:lancamento-criado", carregar);
  }, [carregar]);

  if (!dados) {
    return <p className="text-cream-100/60">Carregando...</p>;
  }

  if (dados.totalInstancias === 0) {
    return (
      <div className="card-dominium mx-auto max-w-xl p-6 text-center text-sm text-cream-100/70">
        Comece criando suas instâncias em <span className="text-gold-300">Instâncias</span> — depois registre
        seus lançamentos pelo botão +.
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <h1 className="font-brand text-2xl text-cream-100">Dashboard</h1>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="card-dominium p-4">
          <p className="text-xs text-cream-100/60">Saldo total</p>
          <p className="tabular text-gold-gradient text-2xl font-semibold">{formatarMoeda(dados.saldoTotal)}</p>
        </div>
        <div className="card-dominium p-4">
          <p className="text-xs text-cream-100/60">Entradas do mês</p>
          <p className="tabular text-2xl font-semibold text-success">{formatarMoeda(dados.entradasMes)}</p>
        </div>
        <div className="card-dominium p-4">
          <p className="text-xs text-cream-100/60">Saídas do mês</p>
          <p className="tabular text-2xl font-semibold text-danger">{formatarMoeda(dados.saidasMes)}</p>
        </div>
      </div>

      {dados.evolucao.length > 1 && (
        <div className="card-dominium p-4">
          <p className="mb-3 text-sm text-cream-100/70">Evolução patrimonial</p>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={dados.evolucao}>
              <defs>
                <linearGradient id="ouro" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#C9A24B" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="#C9A24B" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="mes" tickFormatter={formatarMesAno} stroke="#8496AC" fontSize={12} />
              <Tooltip
                formatter={(value) => formatarMoeda(Number(value))}
                labelFormatter={(v) => formatarMesAno(String(v))}
                contentStyle={{ background: "#16283F", border: "1px solid #1F3552", borderRadius: 8 }}
                labelStyle={{ color: "#F7F5F0" }}
              />
              <Area type="monotone" dataKey="saldoAcumulado" stroke="#C9A24B" fill="url(#ouro)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="card-dominium p-4">
        <p className="mb-3 text-sm text-cream-100/70">Saldo por instância</p>
        <div className="flex flex-col gap-2">
          {dados.porInstancia.map((i) => (
            <div key={i.id} className="flex items-center gap-3">
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                style={{ background: `${i.cor}22` }}
              >
                <IconePorNome nome={i.icone} className="h-4 w-4" style={{ color: i.cor }} />
              </span>
              <span className="flex-1 truncate text-sm text-cream-100">{i.nome}</span>
              <span className={`tabular text-sm font-medium ${i.saldo < 0 ? "text-danger" : "text-cream-100"}`}>
                {formatarMoeda(i.saldo)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

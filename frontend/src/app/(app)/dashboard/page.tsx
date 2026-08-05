"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Area, AreaChart, Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { FileText, Plus } from "lucide-react";
import { API_URL, api } from "@/lib/api";
import { corComprometimento, corPorSinal, formatarDataHora, formatarMoeda } from "@/lib/format";
import { formatarMesCurto, formatarMesLabel } from "@/lib/mes";
import { useAuth } from "@/contexts/AuthContext";
import { useRecorte } from "@/contexts/RecorteContext";
import { JanelaSelector } from "@/components/dominium/JanelaSelector";
import { SeletorMesReferencia } from "@/components/dominium/SeletorMesReferencia";
import { LancamentoRapidoDrawer } from "@/components/dominium/LancamentoRapidoDrawer";
import { Toast } from "@/components/dominium/Toast";
import { lerSnapshot, salvarSnapshot } from "@/lib/offline/snapshots";
import { useOutboxPendentes } from "@/lib/offline/useOutboxPendentes";
import type { DashboardData, Direcao, Janela } from "@/lib/types";

const SNAPSHOT = "dashboard";
const LABEL_PERIODO_RELATORIO: Record<Janela, string> = {
  mes: "1 mês",
  "3m": "3 meses",
  "6m": "6 meses",
  "12m": "12 meses",
};

export default function DashboardPage() {
  const { usuario } = useAuth();
  const { janela, mesReferencia } = useRecorte();
  const [dados, setDados] = useState<DashboardData | null>(null);
  const [erroCarregar, setErroCarregar] = useState(false);
  const [deSnapshot, setDeSnapshot] = useState(false);
  const [ultimaAtualizacao, setUltimaAtualizacao] = useState<number | null>(null);
  const redeConfirmouRef = useRef(false);
  const [drawerAberto, setDrawerAberto] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const pendentesUsuario = useOutboxPendentes(usuario?.id);
  const pendentesAnterioresRef = useRef(0);

  // O PDF e' gerado no backend (mesmo padrao do botao "Gerar repertorio" do
  // SISBANDA) e entregue por navegacao direta pra URL, com
  // Content-Disposition: inline — o navegador abre no proprio visualizador
  // em vez de disparar o menu de compartilhar do sistema (o que acontecia no
  // Safari/iOS com o fluxo antigo de fetch -> blob -> navigator.share).
  // Chamado direto no onClick, sem await antes do window.open: no iOS o
  // gesto do usuario so "sobrevive" a chamadas sincronas.
  // direcao so importa quando janela !== "mes" (dois botoes, ver JSX abaixo);
  // em janela "mes" o default 'futuro' e' o unico recorte possivel (mes de
  // referencia sozinho), entao o botao unico nem precisa escolher.
  function gerarRelatorioPdf(direcao: Direcao = "futuro") {
    const url = `${API_URL}/api/relatorio/pdf?janela=${janela}&mesReferencia=${mesReferencia}&direcao=${direcao}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  const carregar = useCallback(async () => {
    try {
      const data = await api.get<DashboardData>(`/api/dashboard?janela=${janela}&mesReferencia=${mesReferencia}`);
      redeConfirmouRef.current = true;
      setDados(data);
      setErroCarregar(false);
      setDeSnapshot(false);
      const agora = Date.now();
      setUltimaAtualizacao(agora);
      if (usuario) salvarSnapshot(SNAPSHOT, usuario.id, data);
    } catch {
      // Offline: o Dashboard é uma das rotas que abrem no cold start (ver
      // sw.js), mas saldo/dashboard nunca vem de cache — sem rede, cai pro
      // último snapshot confirmado (nunca zero disfarçado de dado real); só
      // sem snapshot algum é que mostra o estado de erro.
      const snapshot = usuario ? await lerSnapshot<DashboardData>(SNAPSHOT, usuario.id) : null;
      if (snapshot) {
        setDados(snapshot.dados);
        setUltimaAtualizacao(snapshot.atualizadoEm);
        setDeSnapshot(true);
        setErroCarregar(false);
      } else {
        setErroCarregar(true);
      }
    }
  }, [janela, mesReferencia, usuario]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  // Quando uma operacao pendente da outbox termina de sincronizar (a
  // contagem cai), busca de novo do servidor pra refletir o Lancamento
  // Rapido no Dashboard assim que o backend confirmar — mesmo padrao usado
  // em lancamentos/page.tsx pra reconciliar apos a fila esvaziar.
  useEffect(() => {
    if (pendentesUsuario.length < pendentesAnterioresRef.current) {
      carregar();
    }
    pendentesAnterioresRef.current = pendentesUsuario.length;
  }, [pendentesUsuario.length, carregar]);

  useEffect(() => {
    // Pintura instantânea a partir do último snapshot, sem esperar a rede —
    // a busca acima (carregar) já dispara em paralelo e substitui assim que
    // resolver; isso só evita tela de "Carregando..." quando já temos algo.
    if (!usuario) return;
    lerSnapshot<DashboardData>(SNAPSHOT, usuario.id).then((snapshot) => {
      if (!snapshot || redeConfirmouRef.current) return;
      setDados(snapshot.dados);
      setUltimaAtualizacao(snapshot.atualizadoEm);
      setDeSnapshot(true);
    });
  }, [usuario]);

  if (!dados) {
    if (erroCarregar) {
      return (
        <div className="card-dominium mx-auto max-w-xl p-6 text-center text-sm text-cream-100/70">
          Sem conexão e nenhum dashboard salvo neste aparelho ainda. Abra o Dashboard uma vez
          online pra poder consultá-lo offline depois.
          <button onClick={() => carregar()} className="btn-gold mt-4 block w-full">
            Tentar novamente
          </button>
        </div>
      );
    }
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
          {deSnapshot && ultimaAtualizacao && (
            <p className="text-[11px] text-cream-100/40">Última atualização: {formatarDataHora(ultimaAtualizacao)}</p>
          )}
        </div>
        <JanelaSelector />
      </div>

      <button
        onClick={() => setDrawerAberto(true)}
        className="btn-gold flex min-h-[52px] w-full items-center justify-center gap-2 text-base"
      >
        <Plus size={20} /> Lançamento rápido
      </button>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
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
          <p className={`tabular text-2xl font-semibold ${corPorSinal(dados.saldoPeriodo)}`}>
            {formatarMoeda(dados.saldoPeriodo)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="card-dominium p-4">
          <p className="text-xs text-cream-100/60">Sobra do mês</p>
          <p className={`tabular text-2xl font-semibold ${corPorSinal(dados.sobraLivreMes)}`}>
            {formatarMoeda(dados.sobraLivreMes)}
          </p>
        </div>
        <div className="card-dominium p-4">
          <p className="text-xs text-cream-100/60">Comprometimento</p>
          <p className={`tabular text-2xl font-semibold ${corComprometimento(dados.comprometimento)}`}>
            {dados.comprometimento.toFixed(0)}%
          </p>
        </div>
      </div>

      {/* Cards combinados (Reserva/Projeção): dividem em duas colunas só a
          partir de md. O breakpoint dos cards de resumo (aqui e nas duas
          linhas acima) é md, não sm — a Sidebar (w-60, Nav.tsx) aparece
          exatamente em sm (640px) e disputa espaço com o conteúdo nesse
          mesmo ponto; entre sm e md o conteúdo real fica estreito demais
          pras colunas, e o valor quebra dentro do próprio número e vaza
          (diagnosticado renderizando o shell completo, com sidebar, em
          várias larguras — não só a grade isolada). md dá margem
          confortável nos dois lados da transição: empilhado até 767px,
          colunas largas a partir de 768px, nunca o meio-termo apertado. */}
      <div className="card-dominium grid grid-cols-1 divide-y divide-navy-700 p-4 md:grid-cols-2 md:divide-x md:divide-y-0">
        <div className="pb-3 md:pb-0 md:pr-3">
          <p className="text-[11px] text-cream-100/60">Reserva Pessoal</p>
          <p className="tabular text-lg font-semibold text-cream-100">{formatarMoeda(dados.patrimonioPessoal)}</p>
        </div>
        <div className="pt-3 md:pt-0 md:pl-3">
          <p className="text-[11px] text-cream-100/60">Reserva Patrimonial</p>
          <p className="tabular text-gold-gradient text-lg font-semibold">
            {formatarMoeda(dados.patrimonioPatrimonial)}
          </p>
        </div>
      </div>

      {dados.janela !== "mes" && (
        <div className="card-dominium grid grid-cols-1 divide-y divide-navy-700 p-4 md:grid-cols-2 md:divide-x md:divide-y-0">
          <div className="pb-3 md:pb-0 md:pr-3">
            <p className="text-[11px] text-cream-100/60">Projeção Reserva Pessoal</p>
            <p className="tabular text-lg font-semibold text-cream-100">
              {formatarMoeda(dados.projecaoPatrimonioPessoal)}
            </p>
          </div>
          <div className="pt-3 md:pt-0 md:pl-3">
            <p className="text-[11px] text-cream-100/60">Projeção Reserva Patrimonial</p>
            <p className="tabular text-gold-gradient text-lg font-semibold">
              {formatarMoeda(dados.projecaoPatrimonioPatrimonial)}
            </p>
          </div>
        </div>
      )}

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
              cursor={false}
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
        {(["pessoal", "patrimonial"] as const).map((sub) => {
          const contas = dados.contasInvestimento.filter((c) => c.subgrupo === sub);
          if (contas.length === 0) return null;
          return (
            <div key={sub} className="mb-3 last:mb-0">
              <p className="mb-1 text-[11px] uppercase tracking-wide text-cream-100/40">
                {sub === "pessoal" ? "Reserva Pessoal" : "Reserva Patrimonial"}
              </p>
              <div className="flex flex-col gap-1">
                {contas.map((c) => (
                  <div key={c.id} className="flex items-center gap-2 text-sm">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: c.cor }} />
                    <span className="flex-1 truncate text-cream-100/80">{c.nome}</span>
                    <span className="tabular text-cream-100">{formatarMoeda(c.patrimonio)}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="card-dominium p-4">
        <p className="mb-1 text-sm text-cream-100/70">Relatório do período</p>
        <p className="mb-3 text-xs text-cream-100/50">
          {LABEL_PERIODO_RELATORIO[janela]} a partir de {formatarMesLabel(mesReferencia)} — gerado na hora, não
          fica salvo no Dominium.
        </p>
        {janela === "mes" ? (
          <button
            onClick={() => gerarRelatorioPdf("futuro")}
            className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-gold-500/60 text-sm text-gold-300"
          >
            <FileText size={16} /> Gerar relatório
          </button>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => gerarRelatorioPdf("passado")}
              className="flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-gold-500/60 text-sm text-gold-300"
            >
              <FileText size={16} /> Relatório passado
            </button>
            <button
              onClick={() => gerarRelatorioPdf("futuro")}
              className="flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-gold-500/60 text-sm text-gold-300"
            >
              <FileText size={16} /> Relatório futuro
            </button>
          </div>
        )}
      </div>

      <LancamentoRapidoDrawer
        aberto={drawerAberto}
        onFechar={() => setDrawerAberto(false)}
        onToast={setToast}
      />
      {toast && <Toast mensagem={toast} onFechar={() => setToast(null)} />}
    </div>
  );
}

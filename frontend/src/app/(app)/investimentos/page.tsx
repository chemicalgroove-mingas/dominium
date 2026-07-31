"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { useInstancias } from "@/contexts/InstanciasContext";
import { formatarMoeda } from "@/lib/format";
import { PALETA_INSTANCIA, COR_SUGERIDA_POR_GRUPO } from "@/lib/cores";
import type { ContaInvestimento, Instancia } from "@/lib/types";

export default function InvestimentosPage() {
  const { recarregar: recarregarInstancias } = useInstancias();
  const [contas, setContas] = useState<ContaInvestimento[]>([]);
  const [carregando, setCarregando] = useState(true);

  const [novaConta, setNovaConta] = useState<{ nome: string; cor: string } | null>(null);
  const [novoFluxo, setNovoFluxo] = useState<{ contaId: string; tipo: "aporte" | "resgate" } | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const data = await api.get<{ contas: ContaInvestimento[] }>("/api/investimentos");
      setContas(data.contas);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function criarConta(e: React.FormEvent) {
    e.preventDefault();
    if (!novaConta) return;
    await api.post<{ instancia: Instancia }>("/api/instancias", {
      nome: novaConta.nome,
      grupo: "investimento",
      cor: novaConta.cor,
    });
    setNovaConta(null);
    await recarregarInstancias();
    await carregar();
  }

  async function excluirConta(id: string) {
    if (!confirm("Excluir esta conta e todos os fluxos vinculados?")) return;
    await api.delete(`/api/instancias/${id}`);
    await recarregarInstancias();
    await carregar();
  }

  async function excluirFluxo(id: string) {
    await api.delete(`/api/investimentos/${id}`);
    await carregar();
  }

  const patrimonioTotal = contas.reduce((acc, c) => acc + c.patrimonio, 0);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="font-brand text-2xl text-cream-100">Reserva e Investimentos</h1>
        <button
          onClick={() => setNovaConta({ nome: "", cor: COR_SUGERIDA_POR_GRUPO.investimento })}
          className="btn-gold flex items-center gap-2 px-4 py-2 text-sm"
        >
          <Plus size={16} /> Nova conta
        </button>
      </div>

      <div className="card-dominium mb-6 p-4 text-center">
        <p className="text-xs text-cream-100/60">Patrimônio investido</p>
        <p className="tabular text-gold-gradient text-2xl font-semibold">{formatarMoeda(patrimonioTotal)}</p>
      </div>

      {!carregando && contas.length === 0 && (
        <div className="card-dominium p-6 text-center text-sm text-cream-100/70">
          Crie uma conta (ex: &quot;Caixa 3438&quot;) e lance aportes ou resgates. Aportar é como pagar uma conta
          para si mesmo.
        </div>
      )}

      <div className="flex flex-col gap-4">
        {contas.map((conta) => (
          <div key={conta.id} className="card-dominium p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full" style={{ background: conta.cor }} />
                <span className="text-sm font-medium text-cream-100">{conta.nome}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="tabular text-sm font-semibold text-cream-100">
                  {formatarMoeda(conta.patrimonio)}
                </span>
                <button onClick={() => excluirConta(conta.id)} className="p-1 text-cream-100/40 hover:text-danger">
                  <Trash2 size={16} />
                </button>
              </div>
            </div>

            <div className="mb-3 flex gap-2">
              <button
                onClick={() => setNovoFluxo({ contaId: conta.id, tipo: "aporte" })}
                className="flex-1 rounded-xl border border-success py-2 text-sm text-success"
              >
                + Aporte
              </button>
              <button
                onClick={() => setNovoFluxo({ contaId: conta.id, tipo: "resgate" })}
                className="flex-1 rounded-xl border border-danger py-2 text-sm text-danger"
              >
                − Resgate
              </button>
            </div>

            <div className="flex flex-col gap-1">
              {conta.fluxos.map((f) => (
                <div key={f.id} className="flex items-center gap-2 text-sm">
                  <span className="text-cream-100/50">
                    {new Date(f.criadoEm).toLocaleDateString("pt-BR")}
                  </span>
                  <span className="flex-1 truncate text-cream-100/80">{f.descricao}</span>
                  <span className={`tabular ${f.valor < 0 ? "text-danger" : "text-success"}`}>
                    {formatarMoeda(f.valor)}
                  </span>
                  <button onClick={() => excluirFluxo(f.id)} className="p-1 text-cream-100/40 hover:text-danger">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              {conta.fluxos.length === 0 && (
                <p className="py-2 text-center text-xs text-cream-100/50">Nenhum fluxo lançado ainda.</p>
              )}
            </div>
          </div>
        ))}
      </div>

      {novaConta && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center">
          <form onSubmit={criarConta} className="card-dominium w-full max-w-sm rounded-b-none p-5 sm:rounded-b-2xl">
            <h2 className="mb-4 font-brand text-lg text-cream-100">Nova conta</h2>
            <div className="mb-4">
              <label className="mb-1 block text-sm text-cream-100/80">Nome</label>
              <input
                className="input-dominium"
                value={novaConta.nome}
                onChange={(e) => setNovaConta({ ...novaConta, nome: e.target.value })}
                placeholder="Ex: Caixa 3438"
                required
                autoFocus
              />
            </div>
            <div className="mb-5">
              <label className="mb-2 block text-sm text-cream-100/80">Cor</label>
              <div className="flex flex-wrap gap-2">
                {PALETA_INSTANCIA.map((cor) => (
                  <button
                    type="button"
                    key={cor}
                    onClick={() => setNovaConta({ ...novaConta, cor })}
                    className="h-8 w-8 rounded-full border-2"
                    style={{ background: cor, borderColor: novaConta.cor === cor ? "#F7F5F0" : "transparent" }}
                  />
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setNovaConta(null)} className="flex-1 rounded-xl border border-navy-700 py-3 text-sm text-cream-100/70">
                Cancelar
              </button>
              <button type="submit" className="btn-gold flex-1">
                Criar
              </button>
            </div>
          </form>
        </div>
      )}

      {novoFluxo && (
        <ModalFluxo
          contaId={novoFluxo.contaId}
          tipo={novoFluxo.tipo}
          onClose={() => setNovoFluxo(null)}
          onSalvo={async () => {
            setNovoFluxo(null);
            await carregar();
          }}
        />
      )}
    </div>
  );
}

function ModalFluxo({
  contaId,
  tipo,
  onClose,
  onSalvo,
}: {
  contaId: string;
  tipo: "aporte" | "resgate";
  onClose: () => void;
  onSalvo: () => void;
}) {
  const [descricao, setDescricao] = useState(tipo === "aporte" ? "Aporte" : "Resgate");
  const [valor, setValor] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    const valorNumerico = parseFloat(valor.replace(",", "."));
    if (!valorNumerico || valorNumerico <= 0) {
      setErro("Informe um valor maior que zero.");
      return;
    }
    setSalvando(true);
    try {
      await api.post("/api/investimentos", {
        instanciaId: contaId,
        descricao,
        valor: tipo === "aporte" ? valorNumerico : -valorNumerico,
      });
      onSalvo();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Nao foi possivel salvar.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center">
      <form onSubmit={salvar} className="card-dominium w-full max-w-sm rounded-b-none p-5 sm:rounded-b-2xl">
        <h2 className="mb-4 font-brand text-lg text-cream-100">
          {tipo === "aporte" ? "Novo aporte" : "Novo resgate"}
        </h2>
        <div className="mb-4">
          <label className="mb-1 block text-sm text-cream-100/80">Descrição</label>
          <input className="input-dominium" value={descricao} onChange={(e) => setDescricao(e.target.value)} required />
        </div>
        <div className="mb-5">
          <label className="mb-1 block text-sm text-cream-100/80">Valor</label>
          <input
            className="input-dominium tabular"
            inputMode="decimal"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            autoFocus
            required
          />
        </div>
        {erro && <p className="mb-3 text-sm text-danger">{erro}</p>}
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 rounded-xl border border-navy-700 py-3 text-sm text-cream-100/70">
            Cancelar
          </button>
          <button type="submit" className="btn-gold flex-1" disabled={salvando}>
            {salvando ? "Salvando..." : "Confirmar"}
          </button>
        </div>
      </form>
    </div>
  );
}

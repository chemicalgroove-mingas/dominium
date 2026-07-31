"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { formatarData, formatarMoeda } from "@/lib/format";
import { useInstancias } from "@/contexts/InstanciasContext";
import type { Lancamento, Recorte } from "@/lib/types";

export default function RecortesPage() {
  const { instancias } = useInstancias();
  const [recortes, setRecortes] = useState<Recorte[]>([]);
  const [novoNome, setNovoNome] = useState("");
  const [instanciasSelecionadas, setInstanciasSelecionadas] = useState<string[]>([]);
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [criando, setCriando] = useState(false);
  const [erro, setErro] = useState("");

  const [recorteAtivo, setRecorteAtivo] = useState<Recorte | null>(null);
  const [resultado, setResultado] = useState<Lancamento[]>([]);

  const carregarRecortes = useCallback(async () => {
    const data = await api.get<{ recortes: Recorte[] }>("/api/recortes");
    setRecortes(data.recortes);
  }, []);

  useEffect(() => {
    carregarRecortes();
  }, [carregarRecortes]);

  function toggleInstancia(id: string) {
    setInstanciasSelecionadas((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function salvarRecorte(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    try {
      await api.post("/api/recortes", {
        nome: novoNome,
        filtros: {
          de: de || null,
          ate: ate || null,
          instanciaIds: instanciasSelecionadas,
          tipos: [],
          tags: [],
        },
      });
      setNovoNome("");
      setInstanciasSelecionadas([]);
      setDe("");
      setAte("");
      setCriando(false);
      await carregarRecortes();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Nao foi possivel salvar o recorte.");
    }
  }

  async function excluirRecorte(id: string) {
    await api.delete(`/api/recortes/${id}`);
    if (recorteAtivo?.id === id) setRecorteAtivo(null);
    await carregarRecortes();
  }

  async function abrirRecorte(recorte: Recorte) {
    setRecorteAtivo(recorte);
    const params = new URLSearchParams();
    if (recorte.filtros.de) params.set("de", recorte.filtros.de);
    if (recorte.filtros.ate) params.set("ate", recorte.filtros.ate);
    const data = await api.get<{ lancamentos: Lancamento[] }>(`/api/lancamentos?${params.toString()}`);
    const filtrados = recorte.filtros.instanciaIds.length
      ? data.lancamentos.filter((l) => recorte.filtros.instanciaIds.includes(l.instanciaId))
      : data.lancamentos;
    setResultado(filtrados);
  }

  const totalResultado = resultado.reduce((acc, l) => acc + l.valor, 0);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="font-brand text-2xl text-cream-100">Recortes</h1>
        <button onClick={() => setCriando(true)} className="btn-gold flex items-center gap-2 px-4 py-2">
          <Plus size={18} /> Novo recorte
        </button>
      </div>

      {recortes.length === 0 && (
        <div className="card-dominium mb-4 p-6 text-center text-sm text-cream-100/70">
          Salve filtros que você usa com frequência — por período, instância ou tipo — e acesse com um toque.
        </div>
      )}

      <div className="mb-6 flex flex-col gap-2">
        {recortes.map((r) => (
          <div key={r.id} className="card-dominium flex items-center gap-3 p-3">
            <button onClick={() => abrirRecorte(r)} className="flex-1 text-left text-sm text-cream-100">
              {r.nome}
            </button>
            <button onClick={() => excluirRecorte(r.id)} className="p-2 text-cream-100/40 hover:text-danger">
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>

      {recorteAtivo && (
        <div className="card-dominium mb-6 p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm text-cream-100/70">{recorteAtivo.nome}</p>
            <span className={`tabular text-sm font-medium ${totalResultado < 0 ? "text-danger" : "text-success"}`}>
              {formatarMoeda(totalResultado)}
            </span>
          </div>
          <div className="flex flex-col gap-2">
            {resultado.map((l) => (
              <div key={l.id} className="flex items-center justify-between text-sm">
                <span className="truncate text-cream-100/80">
                  {l.descricao || l.instancia.nome} · {formatarData(l.data)}
                </span>
                <span className={`tabular ${l.valor < 0 ? "text-danger" : "text-success"}`}>
                  {formatarMoeda(l.valor)}
                </span>
              </div>
            ))}
            {resultado.length === 0 && <p className="text-sm text-cream-100/50">Nenhum lançamento neste recorte.</p>}
          </div>
        </div>
      )}

      {criando && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center">
          <form onSubmit={salvarRecorte} className="card-dominium w-full max-w-md rounded-b-none p-5 sm:rounded-b-2xl">
            <h2 className="mb-4 font-brand text-lg text-cream-100">Novo recorte</h2>

            <div className="mb-4">
              <label className="mb-1 block text-sm text-cream-100/80">Nome</label>
              <input
                className="input-dominium"
                value={novoNome}
                onChange={(e) => setNovoNome(e.target.value)}
                placeholder="Ex: Gastos fixos do mês"
                required
              />
            </div>

            <div className="mb-4 grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm text-cream-100/80">De</label>
                <input className="input-dominium" type="date" value={de} onChange={(e) => setDe(e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-sm text-cream-100/80">Até</label>
                <input className="input-dominium" type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
              </div>
            </div>

            <div className="mb-5">
              <label className="mb-2 block text-sm text-cream-100/80">Instâncias (opcional)</label>
              <div className="flex flex-wrap gap-2">
                {instancias.map((i) => (
                  <button
                    type="button"
                    key={i.id}
                    onClick={() => toggleInstancia(i.id)}
                    className="rounded-full border px-3 py-1.5 text-xs"
                    style={
                      instanciasSelecionadas.includes(i.id)
                        ? { borderColor: i.cor, color: i.cor }
                        : { borderColor: "#1F3552", color: "#F7F5F099" }
                    }
                  >
                    {i.nome}
                  </button>
                ))}
              </div>
            </div>

            {erro && <p className="mb-3 text-sm text-danger">{erro}</p>}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setCriando(false)}
                className="flex-1 rounded-xl border border-navy-700 py-3 text-sm text-cream-100/70"
              >
                Cancelar
              </button>
              <button type="submit" className="btn-gold flex-1">
                Salvar recorte
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { IconePorNome } from "@/lib/icons";
import { formatarData, formatarMoeda } from "@/lib/format";
import { useInstancias } from "@/contexts/InstanciasContext";
import type { Lancamento } from "@/lib/types";

export default function LancamentosPage() {
  const { instancias } = useInstancias();
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([]);
  const [filtroInstancia, setFiltroInstancia] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const query = filtroInstancia ? `?instanciaId=${filtroInstancia}` : "";
      const data = await api.get<{ lancamentos: Lancamento[] }>(`/api/lancamentos${query}`);
      setLancamentos(data.lancamentos);
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Nao foi possivel carregar os lançamentos.");
    } finally {
      setCarregando(false);
    }
  }, [filtroInstancia]);

  useEffect(() => {
    carregar();
    window.addEventListener("dominium:lancamento-criado", carregar);
    return () => window.removeEventListener("dominium:lancamento-criado", carregar);
  }, [carregar]);

  async function excluir(id: string) {
    await api.delete(`/api/lancamentos/${id}`);
    await carregar();
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="font-brand text-2xl text-cream-100">Lançamentos</h1>
      </div>

      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        <button
          onClick={() => setFiltroInstancia("")}
          className={`shrink-0 rounded-full border px-3 py-1.5 text-xs ${
            filtroInstancia === "" ? "border-gold-500 text-gold-300" : "border-navy-700 text-cream-100/60"
          }`}
        >
          Todas
        </button>
        {instancias.map((i) => (
          <button
            key={i.id}
            onClick={() => setFiltroInstancia(i.id)}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-xs ${
              filtroInstancia === i.id ? "" : "border-navy-700 text-cream-100/60"
            }`}
            style={filtroInstancia === i.id ? { borderColor: i.cor, color: i.cor } : undefined}
          >
            {i.nome}
          </button>
        ))}
      </div>

      {erro && <p className="mb-3 text-sm text-danger">{erro}</p>}
      {!carregando && lancamentos.length === 0 && (
        <div className="card-dominium p-6 text-center text-sm text-cream-100/70">
          Nenhum lançamento por aqui ainda. Use o botão + para registrar o primeiro.
        </div>
      )}

      <div className="flex flex-col gap-2">
        {lancamentos.map((l) => (
          <div key={l.id} className="card-dominium flex items-center gap-3 p-3">
            <span
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
              style={{ background: `${l.instancia.cor}22` }}
            >
              <IconePorNome nome={l.instancia.icone} className="h-4 w-4" style={{ color: l.instancia.cor }} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-cream-100">{l.descricao || l.instancia.nome}</p>
              <p className="text-xs text-cream-100/50">
                {l.instancia.nome} · {formatarData(l.data)}
              </p>
            </div>
            <span className={`tabular shrink-0 text-sm font-medium ${l.valor < 0 ? "text-danger" : "text-success"}`}>
              {formatarMoeda(l.valor)}
            </span>
            <button
              onClick={() => excluir(l.id)}
              className="shrink-0 p-2 text-cream-100/40 hover:text-danger"
              aria-label="Excluir lançamento"
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

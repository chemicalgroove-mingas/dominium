"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { IconePorNome } from "@/lib/icons";
import { useInstancias } from "@/contexts/InstanciasContext";
import type { TipoLancamento } from "@/lib/types";

export function dispatchLancamentoCriado() {
  window.dispatchEvent(new CustomEvent("dominium:lancamento-criado"));
}

export function LancamentoQuickAdd({ onClose }: { onClose: () => void }) {
  const { instancias } = useInstancias();
  const [instanciaId, setInstanciaId] = useState<string>(instancias[0]?.id || "");
  const [tipo, setTipo] = useState<TipoLancamento>("saida");
  const [valor, setValor] = useState("");
  const [descricao, setDescricao] = useState("");
  const [data, setData] = useState(() => new Date().toISOString().slice(0, 10));
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro("");

    const valorNumerico = parseFloat(valor.replace(",", "."));
    if (!instanciaId) {
      setErro("Crie uma instancia antes de lancar um valor.");
      return;
    }
    if (!valorNumerico || valorNumerico <= 0) {
      setErro("Informe um valor maior que zero.");
      return;
    }

    setSalvando(true);
    try {
      await api.post("/api/lancamentos", {
        instanciaId,
        tipo,
        valor: valorNumerico,
        descricao: descricao || null,
        data,
      });
      dispatchLancamentoCriado();
      onClose();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Nao foi possivel salvar o lancamento.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center">
      <div className="card-dominium w-full max-w-md rounded-b-none p-5 sm:rounded-b-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-brand text-lg text-cream-100">Novo lançamento</h2>
          <button onClick={onClose} aria-label="Fechar" className="p-2 text-cream-100/70">
            <X size={20} />
          </button>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setTipo("saida")}
            className={`min-h-[44px] rounded-xl border text-sm font-medium ${
              tipo === "saida" ? "border-danger bg-danger/10 text-danger" : "border-navy-700 text-cream-100/70"
            }`}
          >
            Saída
          </button>
          <button
            type="button"
            onClick={() => setTipo("entrada")}
            className={`min-h-[44px] rounded-xl border text-sm font-medium ${
              tipo === "entrada"
                ? "border-success bg-success/10 text-success"
                : "border-navy-700 text-cream-100/70"
            }`}
          >
            Entrada
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="mb-2 block text-sm text-cream-100/80">Instância</label>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {instancias.map((i) => (
                <button
                  type="button"
                  key={i.id}
                  onClick={() => setInstanciaId(i.id)}
                  className="flex shrink-0 flex-col items-center gap-1"
                >
                  <span
                    className="flex h-12 w-12 items-center justify-center rounded-full border-2 transition"
                    style={{
                      borderColor: instanciaId === i.id ? i.cor : "transparent",
                      background: `${i.cor}22`,
                    }}
                  >
                    <IconePorNome nome={i.icone} className="h-5 w-5" style={{ color: i.cor }} />
                  </span>
                  <span className="max-w-[64px] truncate text-[11px] text-cream-100/70">{i.nome}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm text-cream-100/80">Valor</label>
            <input
              className="input-dominium tabular text-2xl"
              inputMode="decimal"
              placeholder="0,00"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              autoFocus
              required
            />
          </div>

          <div>
            <label className="mb-1 block text-sm text-cream-100/80">Descrição (opcional)</label>
            <input
              className="input-dominium"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Ex: mercado, salário..."
            />
          </div>

          <div>
            <label className="mb-1 block text-sm text-cream-100/80">Data</label>
            <input
              className="input-dominium"
              type="date"
              value={data}
              onChange={(e) => setData(e.target.value)}
              required
            />
          </div>

          {erro && <p className="text-sm text-danger">{erro}</p>}

          <button type="submit" className="btn-gold" disabled={salvando}>
            {salvando ? "Salvando..." : "Salvar lançamento"}
          </button>
        </form>
      </div>
    </div>
  );
}

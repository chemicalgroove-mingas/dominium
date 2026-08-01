"use client";

import { useCallback, useEffect, useState } from "react";
import { Ban, Check, Copy, Plus, Trash2 } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import type { Voucher } from "@/lib/types";

const FILTROS: { value: string; label: string }[] = [
  { value: "todos", label: "Todos" },
  { value: "ativos", label: "Ativos" },
  { value: "usados", label: "Usados" },
  { value: "revogados", label: "Revogados" },
];

export default function VouchersAdminPage() {
  const [filtro, setFiltro] = useState("todos");
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [copiado, setCopiado] = useState<string | null>(null);
  const [modalLote, setModalLote] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const query = filtro !== "todos" ? `?status=${filtro}` : "";
      const data = await api.get<{ vouchers: Voucher[] }>(`/api/admin/vouchers${query}`);
      setVouchers(data.vouchers);
    } finally {
      setCarregando(false);
    }
  }, [filtro]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregar();
  }, [carregar]);

  async function gerarUm() {
    await api.post("/api/admin/vouchers", {});
    await carregar();
  }

  async function revogar(id: string) {
    await api.patch(`/api/admin/vouchers/${id}/revogar`);
    await carregar();
  }

  async function excluir(id: string) {
    await api.delete(`/api/admin/vouchers/${id}`);
    await carregar();
  }

  async function copiar(codigo: string) {
    await navigator.clipboard.writeText(codigo);
    setCopiado(codigo);
    setTimeout(() => setCopiado(null), 1500);
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-brand text-2xl text-cream-100">Vouchers</h1>
        <div className="flex gap-2">
          <button onClick={gerarUm} className="flex items-center gap-1 rounded-xl border border-gold-500/50 px-3 py-2 text-sm text-gold-300">
            <Plus size={16} /> Gerar
          </button>
          <button onClick={() => setModalLote(true)} className="btn-gold flex items-center gap-1 px-3 py-2 text-sm">
            <Plus size={16} /> Gerar em lote
          </button>
        </div>
      </div>

      <div className="mb-4 flex gap-2">
        {FILTROS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFiltro(f.value)}
            className={`rounded-full border px-3 py-1.5 text-xs ${
              filtro === f.value ? "border-gold-500 bg-gold-500/10 text-gold-300" : "border-navy-700 text-cream-100/60"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {!carregando && vouchers.length === 0 && (
        <div className="card-dominium p-6 text-center text-sm text-cream-100/70">Nenhum voucher nesse filtro.</div>
      )}

      <div className="flex flex-col gap-2">
        {vouchers.map((v) => (
          <div key={v.id} className="card-dominium flex items-center gap-3 p-3">
            <div className="min-w-0 flex-1">
              <p className="tabular truncate text-sm font-medium text-cream-100">{v.codigo}</p>
              <p className="text-xs text-cream-100/60">
                <StatusBadge status={v.status} expirado={v.expirado} />
                {v.usuario && ` · usado por ${v.usuario.nome} (@${v.usuario.login})`}
                {v.observacao && ` · ${v.observacao}`}
              </p>
            </div>
            <button onClick={() => copiar(v.codigo)} className="p-2 text-cream-100/40 hover:text-gold-300" aria-label="Copiar código">
              {copiado === v.codigo ? <Check size={16} className="text-success" /> : <Copy size={16} />}
            </button>
            {v.status === "ATIVO" && (
              <button onClick={() => revogar(v.id)} className="p-2 text-cream-100/40 hover:text-danger" aria-label="Revogar">
                <Ban size={16} />
              </button>
            )}
            {v.status !== "USADO" && (
              <button onClick={() => excluir(v.id)} className="p-2 text-cream-100/40 hover:text-danger" aria-label="Excluir">
                <Trash2 size={16} />
              </button>
            )}
          </div>
        ))}
      </div>

      {modalLote && (
        <ModalLote
          onClose={() => setModalLote(false)}
          onGerado={() => {
            setModalLote(false);
            carregar();
          }}
        />
      )}
    </div>
  );
}

function StatusBadge({ status, expirado }: { status: Voucher["status"]; expirado: boolean }) {
  const cor =
    status === "ATIVO"
      ? expirado
        ? "text-cream-100/50"
        : "text-success"
      : status === "USADO"
        ? "text-gold-300"
        : "text-danger";
  return <span className={cor}>{expirado && status === "ATIVO" ? "EXPIRADO" : status}</span>;
}

function ModalLote({ onClose, onGerado }: { onClose: () => void; onGerado: () => void }) {
  const [quantidade, setQuantidade] = useState("10");
  const [prefixo, setPrefixo] = useState("DOM");
  const [comprimento, setComprimento] = useState("4");
  const [observacao, setObservacao] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [resultado, setResultado] = useState<number | null>(null);

  async function gerar(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    const qtd = parseInt(quantidade, 10);
    const comp = parseInt(comprimento, 10);
    if (!qtd || qtd < 1) {
      setErro("Informe uma quantidade válida.");
      return;
    }
    setSalvando(true);
    try {
      const data = await api.post<{ quantidade: number }>("/api/admin/vouchers/lote", {
        quantidade: qtd,
        prefixo,
        comprimento: comp,
        observacao: observacao || null,
      });
      setResultado(data.quantidade);
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Nao foi possivel gerar os vouchers.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center">
      <div className="card-dominium w-full max-w-sm rounded-b-none p-5 sm:rounded-b-2xl">
        <h2 className="mb-4 font-brand text-lg text-cream-100">Gerar em lote</h2>

        {resultado !== null ? (
          <div className="flex flex-col gap-4 text-center">
            <p className="text-sm text-success">{resultado} vouchers únicos gerados com sucesso.</p>
            <button onClick={onGerado} className="btn-gold">
              Ver na lista
            </button>
          </div>
        ) : (
          <form onSubmit={gerar} className="flex flex-col gap-4">
            <div>
              <label className="mb-1 block text-sm text-cream-100/80">Quantidade</label>
              <input
                className="input-dominium"
                inputMode="numeric"
                value={quantidade}
                onChange={(e) => setQuantidade(e.target.value)}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm text-cream-100/80">Prefixo</label>
                <input className="input-dominium uppercase" value={prefixo} onChange={(e) => setPrefixo(e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-sm text-cream-100/80">Comprimento</label>
                <input className="input-dominium" inputMode="numeric" value={comprimento} onChange={(e) => setComprimento(e.target.value)} />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm text-cream-100/80">Observação (opcional)</label>
              <input className="input-dominium" value={observacao} onChange={(e) => setObservacao(e.target.value)} />
            </div>
            {erro && <p className="text-sm text-danger">{erro}</p>}
            <div className="flex gap-2">
              <button type="button" onClick={onClose} className="flex-1 rounded-xl border border-navy-700 py-3 text-sm text-cream-100/70">
                Cancelar
              </button>
              <button type="submit" className="btn-gold flex-1" disabled={salvando}>
                {salvando ? "Gerando..." : "Gerar"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { Archive, ArchiveRestore, Pencil, Plus, Trash2 } from "lucide-react";
import { useInstancias } from "@/contexts/InstanciasContext";
import { api, ApiError } from "@/lib/api";
import { IconePorNome, ICONES_DISPONIVEIS } from "@/lib/icons";
import { CORES_INSTANCIA, TIPOS_INSTANCIA } from "@/lib/cores";
import { formatarMoeda } from "@/lib/format";
import type { Instancia } from "@/lib/types";

type FormState = {
  id?: string;
  nome: string;
  tipo: string;
  cor: string;
  icone: string;
  metaValor: string;
};

const FORM_VAZIO: FormState = {
  nome: "",
  tipo: "conta",
  cor: CORES_INSTANCIA[0],
  icone: ICONES_DISPONIVEIS[0],
  metaValor: "",
};

export default function InstanciasPage() {
  const { instancias, recarregar } = useInstancias();
  const [form, setForm] = useState<FormState | null>(null);
  const [erro, setErro] = useState("");
  const [confirmarExclusao, setConfirmarExclusao] = useState<Instancia | null>(null);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    setErro("");

    const payload = {
      nome: form.nome,
      tipo: form.tipo,
      cor: form.cor,
      icone: form.icone,
      metaValor: form.metaValor ? parseFloat(form.metaValor.replace(",", ".")) : null,
    };

    try {
      if (form.id) {
        await api.put(`/api/instancias/${form.id}`, payload);
      } else {
        await api.post("/api/instancias", payload);
      }
      setForm(null);
      await recarregar();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Nao foi possivel salvar.");
    }
  }

  async function arquivar(instancia: Instancia) {
    await api.patch(`/api/instancias/${instancia.id}/arquivar`);
    await recarregar();
  }

  async function excluir(instancia: Instancia, confirmar = false) {
    try {
      await api.delete(`/api/instancias/${instancia.id}${confirmar ? "?confirmar=true" : ""}`);
      setConfirmarExclusao(null);
      await recarregar();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setConfirmarExclusao(instancia);
      }
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-brand text-2xl text-cream-100">Suas instâncias</h1>
        <button onClick={() => setForm(FORM_VAZIO)} className="btn-gold flex items-center gap-2 px-4 py-2">
          <Plus size={18} /> Nova
        </button>
      </div>

      {instancias.length === 0 && (
        <div className="card-dominium p-6 text-center text-sm text-cream-100/70">
          Você ainda não criou nenhuma instância. Crie a primeira — pode ser uma conta, um cartão, uma
          categoria ou um objetivo. O sistema se organiza do jeito que você quiser.
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {instancias.map((i) => (
          <div key={i.id} className="card-dominium flex items-center gap-3 p-4">
            <span
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
              style={{ background: `${i.cor}22` }}
            >
              <IconePorNome nome={i.icone} className="h-5 w-5" style={{ color: i.cor }} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-cream-100">{i.nome}</p>
              <p className="tabular text-xs text-cream-100/60">{formatarMoeda(i.saldoLancado)}</p>
            </div>
            <div className="flex shrink-0 gap-1">
              <button
                onClick={() =>
                  setForm({
                    id: i.id,
                    nome: i.nome,
                    tipo: i.tipo,
                    cor: i.cor,
                    icone: i.icone,
                    metaValor: i.metaValor ? String(i.metaValor) : "",
                  })
                }
                className="p-2 text-cream-100/50 hover:text-gold-300"
                aria-label="Editar"
              >
                <Pencil size={16} />
              </button>
              <button
                onClick={() => arquivar(i)}
                className="p-2 text-cream-100/50 hover:text-gold-300"
                aria-label="Arquivar"
              >
                {i.arquivada ? <ArchiveRestore size={16} /> : <Archive size={16} />}
              </button>
              <button
                onClick={() => excluir(i)}
                className="p-2 text-cream-100/50 hover:text-danger"
                aria-label="Excluir"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {form && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center">
          <form onSubmit={salvar} className="card-dominium w-full max-w-md rounded-b-none p-5 sm:rounded-b-2xl">
            <h2 className="mb-4 font-brand text-lg text-cream-100">
              {form.id ? "Editar instância" : "Nova instância"}
            </h2>

            <div className="mb-4">
              <label className="mb-1 block text-sm text-cream-100/80">Nome</label>
              <input
                className="input-dominium"
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
                required
              />
            </div>

            <div className="mb-4">
              <label className="mb-1 block text-sm text-cream-100/80">Tipo</label>
              <select
                className="input-dominium"
                value={form.tipo}
                onChange={(e) => setForm({ ...form, tipo: e.target.value })}
              >
                {TIPOS_INSTANCIA.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            {form.tipo === "objetivo" && (
              <div className="mb-4">
                <label className="mb-1 block text-sm text-cream-100/80">Meta (R$, opcional)</label>
                <input
                  className="input-dominium"
                  inputMode="decimal"
                  value={form.metaValor}
                  onChange={(e) => setForm({ ...form, metaValor: e.target.value })}
                />
              </div>
            )}

            <div className="mb-4">
              <label className="mb-2 block text-sm text-cream-100/80">Cor</label>
              <div className="flex flex-wrap gap-2">
                {CORES_INSTANCIA.map((cor) => (
                  <button
                    type="button"
                    key={cor}
                    onClick={() => setForm({ ...form, cor })}
                    className="h-8 w-8 rounded-full border-2"
                    style={{ background: cor, borderColor: form.cor === cor ? "#F7F5F0" : "transparent" }}
                    aria-label={cor}
                  />
                ))}
              </div>
            </div>

            <div className="mb-5">
              <label className="mb-2 block text-sm text-cream-100/80">Ícone</label>
              <div className="grid grid-cols-8 gap-2">
                {ICONES_DISPONIVEIS.map((nome) => (
                  <button
                    type="button"
                    key={nome}
                    onClick={() => setForm({ ...form, icone: nome })}
                    className="flex h-9 w-9 items-center justify-center rounded-lg border"
                    style={{
                      borderColor: form.icone === nome ? form.cor : "transparent",
                      background: form.icone === nome ? `${form.cor}22` : "transparent",
                    }}
                  >
                    <IconePorNome nome={nome} className="h-4 w-4 text-cream-100/80" />
                  </button>
                ))}
              </div>
            </div>

            {erro && <p className="mb-3 text-sm text-danger">{erro}</p>}

            <div className="flex gap-2">
              <button type="button" onClick={() => setForm(null)} className="flex-1 rounded-xl border border-navy-700 py-3 text-sm text-cream-100/70">
                Cancelar
              </button>
              <button type="submit" className="btn-gold flex-1">
                Salvar
              </button>
            </div>
          </form>
        </div>
      )}

      {confirmarExclusao && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="card-dominium w-full max-w-sm p-5 text-center">
            <p className="mb-4 text-sm text-cream-100">
              &quot;{confirmarExclusao.nome}&quot; possui lançamentos vinculados. Excluir mesmo assim? O
              histórico associado também será apagado.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmarExclusao(null)}
                className="flex-1 rounded-xl border border-navy-700 py-3 text-sm text-cream-100/70"
              >
                Cancelar
              </button>
              <button
                onClick={() => excluir(confirmarExclusao, true)}
                className="flex-1 rounded-xl bg-danger py-3 text-sm font-medium text-cream-100"
              >
                Excluir tudo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

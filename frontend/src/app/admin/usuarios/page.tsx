"use client";

import { useCallback, useEffect, useState } from "react";
import { KeyRound, Power, Trash2 } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import type { UsuarioAdmin } from "@/lib/types";

export default function UsuariosAdminPage() {
  const [usuarios, setUsuarios] = useState<UsuarioAdmin[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [modalSenha, setModalSenha] = useState<UsuarioAdmin | null>(null);
  const [confirmarExclusao, setConfirmarExclusao] = useState<UsuarioAdmin | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const data = await api.get<{ usuarios: UsuarioAdmin[] }>("/api/admin/usuarios");
      setUsuarios(data.usuarios);
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Nao foi possivel carregar os usuarios.");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregar();
  }, [carregar]);

  async function alternarStatus(usuario: UsuarioAdmin) {
    const novoStatus = usuario.status === "ATIVO" ? "INATIVO" : "ATIVO";
    await api.patch(`/api/admin/usuarios/${usuario.id}/status`, { status: novoStatus });
    await carregar();
  }

  async function excluir() {
    if (!confirmarExclusao) return;
    await api.delete(`/api/admin/usuarios/${confirmarExclusao.id}`);
    setConfirmarExclusao(null);
    await carregar();
  }

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-4 font-brand text-2xl text-cream-100">Usuários</h1>

      {erro && <p className="mb-3 text-sm text-danger">{erro}</p>}
      {!carregando && usuarios.length === 0 && (
        <div className="card-dominium p-6 text-center text-sm text-cream-100/70">
          Nenhum usuário cadastrado ainda. Gere um voucher em Vouchers para o primeiro acesso.
        </div>
      )}

      <div className="flex flex-col gap-2">
        {usuarios.map((u) => (
          <div key={u.id} className="card-dominium flex items-center gap-3 p-4">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-cream-100">{u.nome}</p>
              <p className="text-xs text-cream-100/60">
                @{u.login} ·{" "}
                <span className={u.status === "ATIVO" ? "text-success" : "text-danger"}>{u.status}</span>
                {u.ultimoLogin && ` · último login ${new Date(u.ultimoLogin).toLocaleString("pt-BR")}`}
              </p>
            </div>
            <button
              onClick={() => alternarStatus(u)}
              className={`p-2 ${u.status === "ATIVO" ? "text-success hover:text-danger" : "text-cream-100/40 hover:text-success"}`}
              aria-label={u.status === "ATIVO" ? "Desativar" : "Ativar"}
              title={u.status === "ATIVO" ? "Desativar" : "Ativar"}
            >
              <Power size={16} />
            </button>
            <button
              onClick={() => setModalSenha(u)}
              className="p-2 text-cream-100/40 hover:text-gold-300"
              aria-label="Alterar senha"
              title="Alterar senha"
            >
              <KeyRound size={16} />
            </button>
            <button
              onClick={() => setConfirmarExclusao(u)}
              className="p-2 text-cream-100/40 hover:text-danger"
              aria-label="Excluir"
              title="Excluir"
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>

      {modalSenha && (
        <ModalAlterarSenha
          usuario={modalSenha}
          onClose={() => setModalSenha(null)}
          onSalvo={() => setModalSenha(null)}
        />
      )}

      {confirmarExclusao && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="card-dominium w-full max-w-sm p-5 text-center">
            <p className="mb-4 text-sm text-cream-100">
              Excluir &quot;{confirmarExclusao.nome}&quot;? O histórico financeiro dele é preservado, mas o
              acesso é revogado imediatamente.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmarExclusao(null)}
                className="flex-1 rounded-xl border border-navy-700 py-3 text-sm text-cream-100/70"
              >
                Cancelar
              </button>
              <button onClick={excluir} className="flex-1 rounded-xl bg-danger py-3 text-sm font-medium text-cream-100">
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ModalAlterarSenha({
  usuario,
  onClose,
  onSalvo,
}: {
  usuario: UsuarioAdmin;
  onClose: () => void;
  onSalvo: () => void;
}) {
  const [novaSenha, setNovaSenha] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    if (novaSenha.length < 8) {
      setErro("A senha precisa ter pelo menos 8 caracteres.");
      return;
    }
    setSalvando(true);
    try {
      await api.patch(`/api/admin/usuarios/${usuario.id}/senha`, { novaSenha });
      onSalvo();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Nao foi possivel alterar a senha.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center">
      <form onSubmit={salvar} className="card-dominium w-full max-w-sm rounded-b-none p-5 sm:rounded-b-2xl">
        <h2 className="mb-1 font-brand text-lg text-cream-100">Alterar senha</h2>
        <p className="mb-4 text-xs text-cream-100/60">
          {usuario.nome} (@{usuario.login}) precisará trocar essa senha no próximo login.
        </p>
        <div className="mb-5">
          <label className="mb-1 block text-sm text-cream-100/80">Nova senha</label>
          <input
            className="input-dominium"
            type="password"
            value={novaSenha}
            onChange={(e) => setNovaSenha(e.target.value)}
            minLength={8}
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

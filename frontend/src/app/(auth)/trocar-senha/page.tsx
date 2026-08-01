"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import type { Usuario } from "@/lib/types";

export default function TrocarSenhaPage() {
  const { usuario, recarregar } = useAuth();
  const router = useRouter();
  const [senhaAtual, setSenhaAtual] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro("");

    if (novaSenha.length < 8) {
      setErro("A nova senha precisa ter pelo menos 8 caracteres.");
      return;
    }
    if (novaSenha !== confirmacao) {
      setErro("As senhas nao coincidem.");
      return;
    }

    setCarregando(true);
    try {
      const data = await api.post<{ usuario: Usuario }>("/api/auth/trocar-senha", {
        senhaAtual,
        novaSenha,
        confirmacao,
      });
      await recarregar();
      router.push(data.usuario.role === "ADMIN" ? "/admin/usuarios" : "/dashboard");
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Nao foi possivel trocar a senha.");
    } finally {
      setCarregando(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card-dominium flex flex-col gap-4 p-6">
      <div>
        <h2 className="font-brand text-lg text-cream-100">Troca de senha obrigatória</h2>
        {usuario && <p className="mt-1 text-xs text-cream-100/60">Olá, {usuario.nome}. Defina uma nova senha para continuar.</p>}
      </div>
      <div>
        <label className="mb-1 block text-sm text-cream-100/80">Senha atual</label>
        <input
          className="input-dominium"
          type="password"
          value={senhaAtual}
          onChange={(e) => setSenhaAtual(e.target.value)}
          autoFocus
          required
        />
      </div>
      <div>
        <label className="mb-1 block text-sm text-cream-100/80">Nova senha</label>
        <input
          className="input-dominium"
          type="password"
          value={novaSenha}
          onChange={(e) => setNovaSenha(e.target.value)}
          minLength={8}
          required
        />
      </div>
      <div>
        <label className="mb-1 block text-sm text-cream-100/80">Confirmar nova senha</label>
        <input
          className="input-dominium"
          type="password"
          value={confirmacao}
          onChange={(e) => setConfirmacao(e.target.value)}
          minLength={8}
          required
        />
      </div>
      {erro && <p className="text-sm text-danger">{erro}</p>}
      <button type="submit" className="btn-gold mt-2" disabled={carregando}>
        {carregando ? "Salvando..." : "Trocar senha e continuar"}
      </button>
    </form>
  );
}

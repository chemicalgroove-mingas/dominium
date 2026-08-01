"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuth, ApiError } from "@/contexts/AuthContext";

export default function LoginPage() {
  const { login } = useAuth();
  const [loginValue, setLoginValue] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    setCarregando(true);
    try {
      await login(loginValue, senha);
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Nao foi possivel entrar. Tente novamente.");
    } finally {
      setCarregando(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card-dominium flex flex-col gap-4 p-6">
      <div>
        <label className="mb-1 block text-sm text-cream-100/80">Login</label>
        <input
          className="input-dominium"
          value={loginValue}
          onChange={(e) => setLoginValue(e.target.value)}
          autoCapitalize="none"
          autoFocus
          required
        />
      </div>
      <div>
        <label className="mb-1 block text-sm text-cream-100/80">Senha</label>
        <input
          className="input-dominium"
          type="password"
          placeholder="Sua senha"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          required
        />
      </div>
      {erro && <p className="text-sm text-danger">{erro}</p>}
      <button type="submit" className="btn-gold mt-2" disabled={carregando}>
        {carregando ? "Entrando..." : "Entrar"}
      </button>
      <div className="flex flex-col gap-2 pt-2 text-center text-sm">
        <Link href="/cadastro" className="text-cream-100/70 hover:text-cream-100">
          Tenho um voucher — criar conta
        </Link>
      </div>
    </form>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuth, ApiError } from "@/contexts/AuthContext";
import { formatarCpf } from "@/lib/cpf";

export default function LoginPage() {
  const { login } = useAuth();
  const [cpf, setCpf] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    setCarregando(true);
    try {
      await login(cpf, senha);
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Nao foi possivel entrar. Tente novamente.");
    } finally {
      setCarregando(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card-dominium flex flex-col gap-4 p-6">
      <div>
        <label className="mb-1 block text-sm text-cream-100/80">CPF</label>
        <input
          className="input-dominium"
          inputMode="numeric"
          placeholder="000.000.000-00"
          value={cpf}
          onChange={(e) => setCpf(formatarCpf(e.target.value))}
          maxLength={14}
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
        <Link href="/recuperar-senha" className="text-gold-300 hover:text-gold-500">
          Esqueci minha senha
        </Link>
        <Link href="/cadastro" className="text-cream-100/70 hover:text-cream-100">
          Ainda nao tenho conta — cadastrar
        </Link>
      </div>
    </form>
  );
}

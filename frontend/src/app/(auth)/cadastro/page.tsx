"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuth, ApiError } from "@/contexts/AuthContext";
import { formatarCpf, cpfValido } from "@/lib/cpf";

export default function CadastroPage() {
  const { cadastrar } = useAuth();
  const [nome, setNome] = useState("");
  const [cpf, setCpf] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro("");

    if (!cpfValido(cpf)) {
      setErro("CPF invalido. Confira os numeros digitados.");
      return;
    }
    if (senha.length < 8) {
      setErro("A senha precisa ter pelo menos 8 caracteres.");
      return;
    }
    if (senha !== confirmacao) {
      setErro("As senhas nao coincidem.");
      return;
    }

    setCarregando(true);
    try {
      await cadastrar({ nome, cpf, email, senha });
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Nao foi possivel criar sua conta.");
    } finally {
      setCarregando(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card-dominium flex flex-col gap-4 p-6">
      <div>
        <label className="mb-1 block text-sm text-cream-100/80">Nome completo</label>
        <input className="input-dominium" value={nome} onChange={(e) => setNome(e.target.value)} required />
      </div>
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
        <label className="mb-1 block text-sm text-cream-100/80">Email</label>
        <input
          className="input-dominium"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </div>
      <div>
        <label className="mb-1 block text-sm text-cream-100/80">Senha</label>
        <input
          className="input-dominium"
          type="password"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          minLength={8}
          required
        />
      </div>
      <div>
        <label className="mb-1 block text-sm text-cream-100/80">Confirmar senha</label>
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
        {carregando ? "Criando conta..." : "Criar minha conta"}
      </button>
      <Link href="/login" className="pt-2 text-center text-sm text-cream-100/70 hover:text-cream-100">
        Ja tenho conta — entrar
      </Link>
    </form>
  );
}

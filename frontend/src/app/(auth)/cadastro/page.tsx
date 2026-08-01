"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuth, ApiError } from "@/contexts/AuthContext";

export default function CadastroPage() {
  const { cadastrar } = useAuth();
  const [nome, setNome] = useState("");
  const [loginValue, setLoginValue] = useState("");
  const [senha, setSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [voucher, setVoucher] = useState("");
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro("");

    if (loginValue.trim().length < 3) {
      setErro("O login precisa ter pelo menos 3 caracteres.");
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
    if (!voucher.trim()) {
      setErro("Informe o voucher recebido.");
      return;
    }

    setCarregando(true);
    try {
      await cadastrar({ nome, login: loginValue, senha, confirmacao, voucher });
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Nao foi possivel criar sua conta.");
    } finally {
      setCarregando(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card-dominium flex flex-col gap-4 p-6">
      <div>
        <label className="mb-1 block text-sm text-cream-100/80">Nome</label>
        <input className="input-dominium" value={nome} onChange={(e) => setNome(e.target.value)} required />
      </div>
      <div>
        <label className="mb-1 block text-sm text-cream-100/80">Login</label>
        <input
          className="input-dominium"
          value={loginValue}
          onChange={(e) => setLoginValue(e.target.value)}
          placeholder="Como voce vai entrar (ex: seu primeiro nome)"
          autoCapitalize="none"
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
      <div>
        <label className="mb-1 block text-sm text-cream-100/80">Voucher</label>
        <input
          className="input-dominium tabular uppercase"
          value={voucher}
          onChange={(e) => setVoucher(e.target.value)}
          placeholder="DOM-XXXX-XXXX-XXXX"
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

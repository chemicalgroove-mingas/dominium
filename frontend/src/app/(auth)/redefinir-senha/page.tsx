"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";

function RedefinirSenhaForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token") || "";
  const [senha, setSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro("");

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
      await api.post("/api/auth/redefinir-senha", { token, senha });
      router.push("/dashboard");
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Nao foi possivel redefinir a senha.");
    } finally {
      setCarregando(false);
    }
  }

  if (!token) {
    return (
      <div className="card-dominium flex flex-col gap-4 p-6 text-center">
        <p className="text-sm text-danger">Link invalido. Solicite a recuperacao novamente.</p>
        <Link href="/recuperar-senha" className="text-sm text-gold-300 hover:text-gold-500">
          Solicitar novo link
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="card-dominium flex flex-col gap-4 p-6">
      <div>
        <label className="mb-1 block text-sm text-cream-100/80">Nova senha</label>
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
        {carregando ? "Salvando..." : "Redefinir senha"}
      </button>
    </form>
  );
}

export default function RedefinirSenhaPage() {
  return (
    <Suspense fallback={null}>
      <RedefinirSenhaForm />
    </Suspense>
  );
}

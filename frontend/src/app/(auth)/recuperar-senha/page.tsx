"use client";

import { useState } from "react";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import { formatarCpf } from "@/lib/cpf";

export default function RecuperarSenhaPage() {
  const [cpf, setCpf] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    setCarregando(true);
    try {
      const res = await api.post<{ mensagem: string }>("/api/auth/solicitar-recuperacao", { cpf });
      setMensagem(res.mensagem);
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Nao foi possivel processar o pedido.");
    } finally {
      setCarregando(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card-dominium flex flex-col gap-4 p-6">
      <p className="text-sm text-cream-100/70">
        Informe seu CPF. Se houver uma conta cadastrada, enviaremos um link de redefinicao para o email
        associado.
      </p>
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
      {mensagem && <p className="text-sm text-success">{mensagem}</p>}
      {erro && <p className="text-sm text-danger">{erro}</p>}
      <button type="submit" className="btn-gold mt-2" disabled={carregando}>
        {carregando ? "Enviando..." : "Enviar link de recuperacao"}
      </button>
      <Link href="/login" className="pt-2 text-center text-sm text-cream-100/70 hover:text-cream-100">
        Voltar para o login
      </Link>
    </form>
  );
}

"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";

function ConfirmarEmailConteudo() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";
  const [status, setStatus] = useState<"carregando" | "ok" | "erro">("carregando");
  const [mensagem, setMensagem] = useState("");

  useEffect(() => {
    if (!token) {
      setStatus("erro");
      setMensagem("Link invalido.");
      return;
    }
    api
      .get(`/api/auth/confirmar-email?token=${encodeURIComponent(token)}`)
      .then(() => setStatus("ok"))
      .catch((err) => {
        setStatus("erro");
        setMensagem(err instanceof ApiError ? err.message : "Nao foi possivel confirmar o email.");
      });
  }, [token]);

  return (
    <div className="card-dominium flex flex-col items-center gap-4 p-6 text-center">
      {status === "carregando" && <p className="text-sm text-cream-100/70">Confirmando...</p>}
      {status === "ok" && <p className="text-sm text-success">Email confirmado com sucesso!</p>}
      {status === "erro" && <p className="text-sm text-danger">{mensagem}</p>}
      <Link href="/dashboard" className="text-sm text-gold-300 hover:text-gold-500">
        Ir para o dashboard
      </Link>
    </div>
  );
}

export default function ConfirmarEmailPage() {
  return (
    <Suspense fallback={null}>
      <ConfirmarEmailConteudo />
    </Suspense>
  );
}

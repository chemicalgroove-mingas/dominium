"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import type { Usuario } from "@/lib/types";

type AuthContextValue = {
  usuario: Usuario | null;
  carregando: boolean;
  login: (cpf: string, senha: string) => Promise<void>;
  cadastrar: (dados: { nome: string; cpf: string; email: string; senha: string }) => Promise<void>;
  logout: () => Promise<void>;
  recarregar: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [carregando, setCarregando] = useState(true);
  const router = useRouter();

  const recarregar = useCallback(async () => {
    try {
      const data = await api.get<{ usuario: Usuario }>("/api/auth/me");
      setUsuario(data.usuario);
    } catch {
      setUsuario(null);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    recarregar();
  }, [recarregar]);

  const login = useCallback(async (cpf: string, senha: string) => {
    const data = await api.post<{ usuario: Usuario }>("/api/auth/login", { cpf, senha });
    setUsuario(data.usuario);
    router.push("/dashboard");
  }, [router]);

  const cadastrar = useCallback(
    async (dados: { nome: string; cpf: string; email: string; senha: string }) => {
      const data = await api.post<{ usuario: Usuario }>("/api/auth/cadastro", dados);
      setUsuario(data.usuario);
      router.push("/dashboard");
    },
    [router]
  );

  const logout = useCallback(async () => {
    await api.post("/api/auth/logout");
    setUsuario(null);
    router.push("/login");
  }, [router]);

  return (
    <AuthContext.Provider value={{ usuario, carregando, login, cadastrar, logout, recarregar }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth deve ser usado dentro de AuthProvider");
  return ctx;
}

export { ApiError };

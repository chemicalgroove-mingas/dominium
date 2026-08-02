"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import type { Usuario } from "@/lib/types";

type AuthContextValue = {
  usuario: Usuario | null;
  carregando: boolean;
  login: (login: string, senha: string) => Promise<void>;
  cadastrar: (dados: { nome: string; login: string; senha: string; confirmacao: string; voucher: string }) => Promise<void>;
  logout: () => Promise<void>;
  recarregar: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

// Navegacao pos-autenticacao usa window.location (nao router.push do Next) de
// proposito: em Safari 15.6 (iPad Air 2 e afins) uma transicao client-side do
// App Router pode falhar silenciosamente se a hidratacao teve qualquer
// soluco; uma navegacao de pagina inteira sempre funciona.
function redirecionarAposAutenticar(usuario: Usuario) {
  if (usuario.deveTrocarSenha) {
    window.location.href = "/trocar-senha";
  } else if (usuario.role === "ADMIN") {
    window.location.href = "/admin/usuarios";
  } else {
    window.location.href = "/dashboard";
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [carregando, setCarregando] = useState(true);

  const recarregar = useCallback(async () => {
    try {
      const data = await api.get<{ usuario: Usuario }>("/api/auth/me");
      setUsuario(data.usuario);
    } catch {
      setUsuario(null);
      // Sessao invalida (cookie presente mas token expirado/usuario inexistente):
      // limpa o cookie no servidor para nao entrar em loop com o proxy, que so
      // checa presenca do cookie, nao validade.
      try {
        await api.post("/api/auth/logout");
      } catch {
        // ignora — se o backend estiver fora do ar, so seguimos sem sessao
      }
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    // Busca a sessao atual ao montar — mesmo padrao ja usado no resto do app
    // (ver InstanciasContext, Dashboard, etc.) para carregar dados assincronos on-mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    recarregar();
  }, [recarregar]);

  const login = useCallback(async (loginValue: string, senha: string) => {
    const data = await api.post<{ usuario: Usuario }>("/api/auth/login", { login: loginValue, senha });
    setUsuario(data.usuario);
    redirecionarAposAutenticar(data.usuario);
  }, []);

  const cadastrar = useCallback(
    async (dados: { nome: string; login: string; senha: string; confirmacao: string; voucher: string }) => {
      const data = await api.post<{ usuario: Usuario }>("/api/auth/cadastro", dados);
      setUsuario(data.usuario);
      redirecionarAposAutenticar(data.usuario);
    },
    []
  );

  const logout = useCallback(async () => {
    await api.post("/api/auth/logout");
    setUsuario(null);
    window.location.href = "/login";
  }, []);

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

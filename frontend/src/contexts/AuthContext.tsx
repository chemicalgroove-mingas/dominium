"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import type { Usuario } from "@/lib/types";
import { limparDadosLocaisDoUsuario, listarNaoConcluidas } from "@/lib/offline/outbox";
import { cancelarTentativasAgendadas, tentarSincronizar } from "@/lib/offline/syncManager";
import { lerSessaoLocalValida, limparSessaoLocal, salvarSessaoLocal } from "@/lib/offline/sessaoLocal";

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
      // Snapshot não-sensível (mesmo formato já exposto ao cliente, sem
      // senha/token) — só pra permitir abrir o app shell num cold start
      // offline. Nunca substitui esta checagem real assim que há rede.
      await salvarSessaoLocal(data.usuario);
    } catch (err) {
      if (err instanceof ApiError) {
        // O servidor respondeu e recusou — sessao realmente invalida (cookie
        // presente mas token expirado/usuario inexistente), nao problema de
        // rede. Limpa o cookie no servidor para nao entrar em loop com o
        // proxy, que so checa presenca do cookie, nao validade.
        setUsuario(null);
        await limparSessaoLocal();
        try {
          await api.post("/api/auth/logout");
        } catch {
          // ignora — se o backend estiver fora do ar, so seguimos sem sessao
        }
      } else {
        // Falha de rede (offline): não dá pra confirmar nem invalidar a
        // sessão agora. Se existe um snapshot local válido (estabelecido
        // enquanto online, dentro da janela de validade do cookie), usa ele
        // pra abrir o app com o que já foi sincronizado localmente — sem
        // isso, todo cold start offline cairia direto no login.
        const sessaoLocal = await lerSessaoLocalValida();
        setUsuario(sessaoLocal);
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

  useEffect(() => {
    // Assim que a rede volta, revalida de verdade contra o servidor — se a
    // sessão restaurada localmente não for mais válida, desloga pra valer
    // neste momento (não antes, e nunca só por inferência local).
    window.addEventListener("online", recarregar);
    return () => window.removeEventListener("online", recarregar);
  }, [recarregar]);

  const login = useCallback(async (loginValue: string, senha: string) => {
    const data = await api.post<{ usuario: Usuario }>("/api/auth/login", { login: loginValue, senha });
    setUsuario(data.usuario);
    await salvarSessaoLocal(data.usuario);
    redirecionarAposAutenticar(data.usuario);
  }, []);

  const cadastrar = useCallback(
    async (dados: { nome: string; login: string; senha: string; confirmacao: string; voucher: string }) => {
      const data = await api.post<{ usuario: Usuario }>("/api/auth/cadastro", dados);
      setUsuario(data.usuario);
      await salvarSessaoLocal(data.usuario);
      redirecionarAposAutenticar(data.usuario);
    },
    []
  );

  const logout = useCallback(async () => {
    if (usuario) {
      const pendentes = await listarNaoConcluidas(usuario.id);
      if (pendentes.length > 0) {
        const tentarAgora = window.confirm(
          `Você tem ${pendentes.length} lançamento(s) ainda não sincronizado(s). ` +
            "Clique OK para tentar sincronizar agora, ou Cancelar para decidir sair mesmo assim."
        );
        if (tentarAgora) {
          await tentarSincronizar(usuario.id);
          const restantes = await listarNaoConcluidas(usuario.id);
          if (restantes.length > 0) {
            window.alert(
              "Ainda não deu pra sincronizar (sem conexão ou erro). Você continua logado — tente de novo quando a rede voltar."
            );
            return;
          }
        } else {
          const descartar = window.confirm(
            `Sair mesmo assim? ${pendentes.length} lançamento(s) pendente(s) serão perdidos.`
          );
          if (!descartar) return;
        }
      }
      cancelarTentativasAgendadas(usuario.id);
      await limparDadosLocaisDoUsuario(usuario.id);
    }

    await api.post("/api/auth/logout");
    setUsuario(null);
    // Limpa o cache do service worker por garantia (so guarda app shell, nunca
    // dados, mas evita residuo de sessao anterior em dispositivo compartilhado).
    if (typeof caches !== "undefined") {
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map((key) => caches.delete(key)));
      } catch {
        // ignora — limpeza de cache nao deve bloquear o logout
      }
    }
    window.location.href = "/login";
  }, [usuario]);

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

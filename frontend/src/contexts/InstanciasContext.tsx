"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Instancia } from "@/lib/types";
import { useAuth } from "@/contexts/AuthContext";

type InstanciasContextValue = {
  instancias: Instancia[];
  carregando: boolean;
  recarregar: () => Promise<void>;
};

const InstanciasContext = createContext<InstanciasContextValue | null>(null);

export function InstanciasProvider({ children }: { children: React.ReactNode }) {
  const { usuario } = useAuth();
  const [instancias, setInstancias] = useState<Instancia[]>([]);
  const [carregando, setCarregando] = useState(true);

  const recarregar = useCallback(async () => {
    setCarregando(true);
    try {
      const data = await api.get<{ instancias: Instancia[] }>("/api/instancias");
      setInstancias(data.instancias);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    if (usuario) recarregar();
  }, [usuario, recarregar]);

  return (
    <InstanciasContext.Provider value={{ instancias, carregando, recarregar }}>
      {children}
    </InstanciasContext.Provider>
  );
}

export function useInstancias() {
  const ctx = useContext(InstanciasContext);
  if (!ctx) throw new Error("useInstancias deve ser usado dentro de InstanciasProvider");
  return ctx;
}

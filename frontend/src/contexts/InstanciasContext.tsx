"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Grupo, Instancia } from "@/lib/types";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/lib/offline/db";

type InstanciasContextValue = {
  instancias: Instancia[];
  carregando: boolean;
  recarregar: () => Promise<void>;
  porGrupo: (grupo: Grupo) => Instancia[];
  reordenar: (ids: string[]) => void;
};

const InstanciasContext = createContext<InstanciasContextValue | null>(null);

export function InstanciasProvider({ children }: { children: React.ReactNode }) {
  const { usuario } = useAuth();
  const [instancias, setInstancias] = useState<Instancia[]>([]);
  const [carregando, setCarregando] = useState(true);

  const recarregar = useCallback(async () => {
    if (!usuario) return;
    setCarregando(true);
    try {
      const data = await api.get<{ instancias: Instancia[] }>("/api/instancias");
      setInstancias(data.instancias);
      // Espelho local só de metadados de agrupamento (nome/cor/grupo) — nunca
      // saldo/valor — pra permitir escolher onde lançar mesmo reabrindo o PWA
      // offline. Mesmo princípio do Service Worker: dado financeiro nunca
      // vem do cache, só isso aqui (que não é financeiro).
      await db.transaction("rw", db.instanciasCache, async () => {
        await db.instanciasCache.where({ usuarioId: usuario.id }).delete();
        await db.instanciasCache.bulkPut(data.instancias);
      });
    } catch {
      // Offline/erro de rede: mantém em tela o que já tinha (espelho local
      // ou fetch anterior) em vez de quebrar.
    } finally {
      setCarregando(false);
    }
  }, [usuario]);

  useEffect(() => {
    // Pintura instantânea a partir do espelho local; a rede revalida em seguida
    // no efeito abaixo (que já existia, chamando recarregar()).
    if (!usuario) return;
    db.instanciasCache
      .where({ usuarioId: usuario.id })
      .toArray()
      .then((cache) => {
        if (cache.length > 0) setInstancias(cache);
      });
  }, [usuario]);

  useEffect(() => {
    if (usuario) recarregar();
  }, [usuario, recarregar]);

  const porGrupo = useCallback(
    (grupo: Grupo) => instancias.filter((i) => i.grupo === grupo && i.ativa),
    [instancias]
  );

  // Reordenação otimista (drag-and-drop): reposiciona só os itens de `ids`
  // (o subconjunto de um contexto/tela) nos mesmos índices que já ocupavam
  // na lista mista de grupos, preservando os demais intocados.
  const reordenar = useCallback((ids: string[]) => {
    setInstancias((prev) => {
      const porId = new Map(prev.map((i) => [i.id, i]));
      const idsSet = new Set(ids);
      const novos = ids.map((id) => porId.get(id)).filter((i): i is Instancia => !!i);
      let cursor = 0;
      return prev.map((i) => (idsSet.has(i.id) ? novos[cursor++] : i));
    });
  }, []);

  return (
    <InstanciasContext.Provider value={{ instancias, carregando, recarregar, porGrupo, reordenar }}>
      {children}
    </InstanciasContext.Provider>
  );
}

export function useInstancias() {
  const ctx = useContext(InstanciasContext);
  if (!ctx) throw new Error("useInstancias deve ser usado dentro de InstanciasProvider");
  return ctx;
}

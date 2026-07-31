"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { anoDoMes, mesAtual, montarMes, somarMeses } from "@/lib/mes";
import type { Janela } from "@/lib/types";

type RecorteContextValue = {
  janela: Janela;
  setJanela: (j: Janela) => void;
  mesReferencia: string;
  setMesReferencia: (m: string) => void;
  irParaMesNumero: (mesNumero: number) => void;
  mudarAno: (delta: number) => void;
  voltarParaMesAtual: () => void;
};

const RecorteContext = createContext<RecorteContextValue | null>(null);

export function RecorteProvider({ children }: { children: React.ReactNode }) {
  const [janela, setJanela] = useState<Janela>("mes");
  const [mesReferencia, setMesReferencia] = useState<string>(mesAtual());

  const irParaMesNumero = useCallback(
    (mesNumero: number) => {
      setMesReferencia((atual) => montarMes(anoDoMes(atual), mesNumero));
    },
    []
  );

  const mudarAno = useCallback((delta: number) => {
    setMesReferencia((atual) => somarMeses(atual, delta * 12));
  }, []);

  const voltarParaMesAtual = useCallback(() => setMesReferencia(mesAtual()), []);

  return (
    <RecorteContext.Provider
      value={{ janela, setJanela, mesReferencia, setMesReferencia, irParaMesNumero, mudarAno, voltarParaMesAtual }}
    >
      {children}
    </RecorteContext.Provider>
  );
}

export function useRecorte() {
  const ctx = useContext(RecorteContext);
  if (!ctx) throw new Error("useRecorte deve ser usado dentro de RecorteProvider");
  return ctx;
}

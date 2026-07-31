"use client";

import { createContext, useContext, useState } from "react";
import type { Janela } from "@/lib/types";

type RecorteContextValue = {
  janela: Janela;
  setJanela: (j: Janela) => void;
};

const RecorteContext = createContext<RecorteContextValue | null>(null);

export function RecorteProvider({ children }: { children: React.ReactNode }) {
  const [janela, setJanela] = useState<Janela>("mes");
  return <RecorteContext.Provider value={{ janela, setJanela }}>{children}</RecorteContext.Provider>;
}

export function useRecorte() {
  const ctx = useContext(RecorteContext);
  if (!ctx) throw new Error("useRecorte deve ser usado dentro de RecorteProvider");
  return ctx;
}

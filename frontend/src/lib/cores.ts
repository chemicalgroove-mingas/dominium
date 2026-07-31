import type { Grupo, Janela } from "./types";

// Cores sugeridas por grupo (o usuario pode escolher qualquer uma livremente).
export const PALETA_INSTANCIA = [
  "#5B8DEF", // azul — sugestao para gasto
  "#4CAF7D", // verde — sugestao para receita
  "#B368E0", // roxo — sugestao para investimento
  "#C9A24B",
  "#D9614F",
  "#E0A039",
  "#3FB6C6",
  "#E0698A",
  "#8496AC",
  "#7CB342",
];

export const COR_SUGERIDA_POR_GRUPO: Record<Grupo, string> = {
  gasto: "#5B8DEF",
  receita: "#4CAF7D",
  investimento: "#B368E0",
};

export const LABEL_GRUPO: Record<Grupo, string> = {
  gasto: "Gasto",
  receita: "Receita",
  investimento: "Investimento",
};

export const JANELAS: { value: Janela; label: string }[] = [
  { value: "mes", label: "Mês" },
  { value: "3m", label: "3 meses" },
  { value: "6m", label: "6 meses" },
  { value: "12m", label: "12 meses" },
];

"use client";

import type { ReactElement } from "react";
import type { PosicaoInsercao } from "@/hooks/useOrdenacaoDuasColunas";
import { BarraGuiaArraste } from "./BarraGuiaArraste";

// Renderiza UMA lista (uma coluna no desktop, ou a lista mesclada inteira
// no mobile) com a barra guia na posição certa. A contagem de posição local
// pula o item ativo (que continua renderizado, esmaecido, no próprio
// lugar) — é a mesma exclusão que useOrdenacaoDuasColunas já faz ao
// calcular `posicaoLocal`, então os dois nunca divergem (mesma fonte).
export function ListaOrdenavel<T extends { id: string }>({
  itens,
  listaIndex,
  posicaoInsercao,
  idAtivo,
  renderItem,
}: {
  itens: T[];
  listaIndex: number;
  posicaoInsercao: PosicaoInsercao | null;
  idAtivo: string | null;
  renderItem: (item: T) => ReactElement;
}) {
  const nos: ReactElement[] = [];
  let posicaoLocal = 0;
  itens.forEach((item) => {
    const ehAtivo = item.id === idAtivo;
    if (!ehAtivo && posicaoInsercao?.lista === listaIndex && posicaoInsercao.posicaoLocal === posicaoLocal) {
      nos.push(<BarraGuiaArraste key={`guia-${listaIndex}-${posicaoLocal}`} />);
    }
    nos.push(renderItem(item));
    if (!ehAtivo) posicaoLocal += 1;
  });
  if (posicaoInsercao?.lista === listaIndex && posicaoInsercao.posicaoLocal === posicaoLocal) {
    nos.push(<BarraGuiaArraste key={`guia-${listaIndex}-fim`} />);
  }

  return <div className="flex flex-col gap-4">{nos}</div>;
}

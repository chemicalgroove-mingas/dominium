"use client";

import type { ReactElement } from "react";
import { BarraGuiaArraste } from "./BarraGuiaArraste";

// Masonry de 2 colunas SEM CSS columns (quebraria o drag-and-drop): a
// sequência 1D é dividida por índice em duas metades — a esquerda recebe a
// primeira metade empilhada, a direita a continuação. Cada coluna é um
// flex-col comum, cards colados sem buraco, independente da altura do
// vizinho da outra coluna. No mobile (grid-cols-1) as duas colunas
// empilham uma sobre a outra, o que preserva a ordem de leitura (esquerda
// inteira, depois a direita) — não precisa de lógica separada pra 1 coluna.
//
// O SortableContext (no componente pai) continua enxergando a sequência
// completa via `itens` — a divisão em colunas é só de renderização.
export function ColunasMasonry<T extends { id: string }>({
  itens,
  indiceInsercao,
  renderItem,
}: {
  itens: T[];
  indiceInsercao: number | null;
  renderItem: (item: T) => ReactElement;
}) {
  const meio = Math.ceil(itens.length / 2);
  const esquerda = itens.slice(0, meio);
  const direita = itens.slice(meio);

  function coluna(lista: T[], offset: number) {
    const nos: ReactElement[] = [];
    lista.forEach((item, i) => {
      const indiceGlobal = offset + i;
      if (indiceInsercao === indiceGlobal) {
        nos.push(<BarraGuiaArraste key={`guia-${indiceGlobal}`} />);
      }
      nos.push(renderItem(item));
    });
    if (indiceInsercao === offset + lista.length) {
      nos.push(<BarraGuiaArraste key={`guia-${offset + lista.length}`} />);
    }
    return nos;
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:items-start">
      <div className="flex flex-col gap-4">{coluna(esquerda, 0)}</div>
      <div className="flex flex-col gap-4">{coluna(direita, meio)}</div>
    </div>
  );
}

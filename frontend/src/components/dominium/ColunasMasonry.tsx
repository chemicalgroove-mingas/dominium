"use client";

import type { ReactElement } from "react";
import { metadeMasonry, type ColunaMasonry } from "@/lib/masonryOrdenacao";
import type { PosicaoMasonry } from "@/hooks/useOrdenacaoArrastavel";
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
  posicaoInsercao,
  idAtivo,
  renderItem,
}: {
  itens: T[];
  posicaoInsercao: PosicaoMasonry | null;
  idAtivo: string | null;
  renderItem: (item: T) => ReactElement;
}) {
  const meio = metadeMasonry(itens.length);
  const esquerda = itens.slice(0, meio);
  const direita = itens.slice(meio);

  // `posicaoInsercao` já vem normalizado (useOrdenacaoArrastavel) pra
  // sempre representar onde o card vai cair de fato — a mesma fonte usada
  // pelo onDragEnd pra montar o arrayMove. Aqui só espelhamos essa posição
  // visualmente: a contagem local pula o item ativo (que ainda está
  // renderizado, esmaecido, no próprio lugar) — é a mesma exclusão que
  // colisaoMasonry já faz ao calcular `posicaoLocal`, então os dois nunca
  // divergem.
  function coluna(lista: T[], colunaId: ColunaMasonry) {
    const nos: ReactElement[] = [];
    let posicaoLocal = 0;
    lista.forEach((item) => {
      const ehAtivo = item.id === idAtivo;
      if (!ehAtivo && posicaoInsercao?.coluna === colunaId && posicaoInsercao.posicaoLocal === posicaoLocal) {
        nos.push(<BarraGuiaArraste key={`guia-${colunaId}-${posicaoLocal}`} />);
      }
      nos.push(renderItem(item));
      if (!ehAtivo) posicaoLocal += 1;
    });
    if (posicaoInsercao?.coluna === colunaId && posicaoInsercao.posicaoLocal === posicaoLocal) {
      nos.push(<BarraGuiaArraste key={`guia-${colunaId}-fim`} />);
    }
    return nos;
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:items-start">
      <div className="flex flex-col gap-4">{coluna(esquerda, "esquerda")}</div>
      <div className="flex flex-col gap-4">{coluna(direita, "direita")}</div>
    </div>
  );
}

"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { TRANSICAO_FIRME } from "@/hooks/useOrdenacaoArrastavel";

type RenderProps = {
  attributes: ReturnType<typeof useSortable>["attributes"];
  listeners: ReturnType<typeof useSortable>["listeners"];
  setNodeRef: ReturnType<typeof useSortable>["setNodeRef"];
  style: React.CSSProperties;
  isDragging: boolean;
};

// Wrapper via render-prop pra tornar QUALQUER card arrastável sem precisar
// extraí-lo pra um componente à parte — útil quando o card tem muitos
// closures/callbacks do componente pai (caso da Reserva). Só precisa estar
// dentro de um <SortableContext> com `id` na lista de items.
//
// `emArraste` (true enquanto QUALQUER card estiver sendo arrastado) suprime
// o transform — os cards de fundo ficam parados durante o arraste, só a
// barra guia se move. Ao soltar, `emArraste` volta a false e o transform
// (agora o delta do FLIP pós-reorder) volta a valer, dando o reflow único.
export function ItemArrastavel({
  id,
  emArraste,
  children,
}: {
  id: string;
  emArraste: boolean;
  children: (props: RenderProps) => React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    transition: TRANSICAO_FIRME,
  });
  return children({
    attributes,
    listeners,
    setNodeRef,
    style: { transform: emArraste ? undefined : CSS.Transform.toString(transform), transition },
    isDragging,
  });
}

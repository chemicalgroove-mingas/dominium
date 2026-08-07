"use client";

import { GripVertical } from "lucide-react";
import type { useSortable } from "@dnd-kit/sortable";

type Props = {
  attributes: ReturnType<typeof useSortable>["attributes"];
  listeners: ReturnType<typeof useSortable>["listeners"];
};

// Único ponto de onde o card pode ser arrastado — attributes/listeners do
// dnd-kit vão só aqui, nunca no container do card inteiro, pra tocar/clicar
// em qualquer outro lugar do card continuar funcionando normal (usar,
// editar, selecionar). touch-none evita o navegador "roubar" o gesto como
// scroll durante a janela de long-press no touch.
export function AlcaArrastar({ attributes, listeners }: Props) {
  return (
    <button
      type="button"
      className="shrink-0 touch-none cursor-grab p-1 text-cream-100/30 hover:text-cream-100/60 active:cursor-grabbing"
      aria-label="Arrastar para reordenar"
      {...attributes}
      {...listeners}
    >
      <GripVertical size={16} />
    </button>
  );
}

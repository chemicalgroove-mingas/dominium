"use client";

import { useCallback, useMemo, useState } from "react";
import {
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { api } from "@/lib/api";

// Ordem manual por contexto (ver OrdenacaoInstancia no backend — Etapa 1,
// PR #17). O drag só deve iniciar pela alça (AlcaArrastar), nunca pelo card
// inteiro — por isso os `listeners` do useSortable vão só na alça, nunca no
// container. Salvamento é otimista: reordena a lista local na hora e chama o
// PATCH em paralelo; se falhar, desfaz e avisa via `erro`.
export function useOrdenacaoArrastavel<T extends { id: string }>(
  contexto: string,
  itens: T[],
  setItens: (itens: T[]) => void
) {
  const [erro, setErro] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  // TouchSensor com delay de long-press: se o dedo mover mais que a
  // tolerância antes do delay passar, o dnd-kit cancela a ativação do drag e
  // deixa o gesto virar scroll normal da página — é assim que "segurar pra
  // arrastar" convive com "arrastar o dedo pra rolar" no mesmo elemento.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } })
  );

  const onDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  }, []);

  const onDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveId(null);
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const anterior = itens;
      const oldIndex = anterior.findIndex((i) => i.id === active.id);
      const newIndex = anterior.findIndex((i) => i.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;

      const reordenados = arrayMove(anterior, oldIndex, newIndex);
      setItens(reordenados);

      api
        .patch("/api/instancias/ordenacao", {
          contexto,
          instanciaIds: reordenados.map((i) => i.id),
        })
        .catch(() => {
          setItens(anterior);
          setErro("Não foi possível salvar a nova ordem. Tente novamente.");
        });
    },
    [contexto, itens, setItens]
  );

  const onDragCancel = useCallback(() => setActiveId(null), []);

  const idsAtuais = useMemo(() => itens.map((i) => i.id), [itens]);
  // O item ativo é usado pra renderizar o <DragOverlay> — a cópia sólida,
  // de tamanho fixo, que segue o cursor/dedo. Sem isso o card original (que
  // continua no grid, sendo transformado no próprio lugar) fica deformado —
  // é exatamente o problema que o DragOverlay existe pra resolver.
  const itemAtivo = useMemo(() => itens.find((i) => i.id === activeId) ?? null, [itens, activeId]);

  return {
    sensors,
    onDragStart,
    onDragEnd,
    onDragCancel,
    activeId,
    itemAtivo,
    idsAtuais,
    erro,
    limparErro: () => setErro(null),
  };
}

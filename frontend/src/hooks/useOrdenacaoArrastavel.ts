"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
  MeasuringStrategy,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
  type MeasuringConfiguration,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { api } from "@/lib/api";

// Zona central de cada card que precisa ser cruzada pra ele virar o novo
// destino — ver colisaoQuantizada abaixo.
const MARGEM_ZONA_CENTRAL = 0.25;

// Config de transição dos itens sortable — ~200ms com easing decidido (o
// "delay firme" do iPhone), não a animação elástica/contínua padrão do
// dnd-kit. Reusada pelos 3 useSortable (um por tela).
export const TRANSICAO_FIRME = { duration: 200, easing: "ease" };

// Mede os retângulos dos cards só uma vez, antes do drag começar — sem isso
// o dnd-kit re-mede a cada frame conforme os vizinhos animam, e essa
// realimentação (rect novo -> colisão nova -> transform novo -> rect novo...)
// é uma das causas da "convulsão" contínua no grid 2D.
export const MEDICAO_ESTAVEL: MeasuringConfiguration = {
  droppable: { strategy: MeasuringStrategy.BeforeDragging },
};

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
  const overEstavelRef = useRef<UniqueIdentifier | null>(null);

  // TouchSensor com delay de long-press: se o dedo mover mais que a
  // tolerância antes do delay passar, o dnd-kit cancela a ativação do drag e
  // deixa o gesto virar scroll normal da página — é assim que "segurar pra
  // arrastar" convive com "arrastar o dedo pra rolar" no mesmo elemento.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } })
  );

  // Estilo "reorganizar ícones no iPhone": o destino só muda quando o
  // ponteiro cruza a zona central (25% de margem de cada lado) de outro
  // card — não na primeira sobreposição de borda. Fora de qualquer zona
  // central (a faixa "morta" entre dois cards vizinhos) mantém o destino
  // anterior em vez de recalcular a cada pixel; isso, combinado com
  // MEDICAO_ESTAVEL (rects medidos uma vez, não a cada frame), é o que
  // elimina a convulsão contínua no grid 2D.
  const colisaoQuantizada: CollisionDetection = useCallback((args) => {
    const { active, droppableRects, droppableContainers, pointerCoordinates } = args;
    if (!pointerCoordinates) return [];

    for (const container of droppableContainers) {
      if (container.id === active.id) continue;
      const rect = droppableRects.get(container.id);
      if (!rect) continue;

      const margemX = rect.width * MARGEM_ZONA_CENTRAL;
      const margemY = rect.height * MARGEM_ZONA_CENTRAL;
      const dentroDaZonaCentral =
        pointerCoordinates.x >= rect.left + margemX &&
        pointerCoordinates.x <= rect.right - margemX &&
        pointerCoordinates.y >= rect.top + margemY &&
        pointerCoordinates.y <= rect.bottom - margemY;

      if (dentroDaZonaCentral) {
        overEstavelRef.current = container.id;
        return [{ id: container.id }];
      }
    }

    // Zona morta: nenhum card teve sua zona central cruzada agora — mantém
    // o último destino estável em vez de trocar (isso é a "hysteresis" que
    // impede o pisca-pisca de destino perto das bordas dos cards).
    return overEstavelRef.current ? [{ id: overEstavelRef.current }] : [];
  }, []);

  const onDragStart = useCallback((event: DragStartEvent) => {
    overEstavelRef.current = null;
    setActiveId(String(event.active.id));
  }, []);

  const onDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveId(null);
      overEstavelRef.current = null;
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

  const onDragCancel = useCallback(() => {
    setActiveId(null);
    overEstavelRef.current = null;
  }, []);

  const idsAtuais = useMemo(() => itens.map((i) => i.id), [itens]);
  // O item ativo é usado pra renderizar o <DragOverlay> — a cópia sólida,
  // de tamanho fixo, que segue o cursor/dedo. Sem isso o card original (que
  // continua no grid, sendo transformado no próprio lugar) fica deformado —
  // é exatamente o problema que o DragOverlay existe pra resolver.
  const itemAtivo = useMemo(() => itens.find((i) => i.id === activeId) ?? null, [itens, activeId]);

  return {
    sensors,
    collisionDetection: colisaoQuantizada,
    measuring: MEDICAO_ESTAVEL,
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

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

// Config de transição dos itens sortable — ~200ms com easing decidido (o
// "delay firme" do iPhone/Pinterest). Só entra em jogo quando a sequência
// realmente muda (reflow único ao soltar, via animateLayoutChanges do
// dnd-kit) — durante o arraste em si o transform é suprimido (ver
// `emArraste` em cada wrapper de card), então os cards de fundo não se
// movem, só a barra guia (índice de inserção) reage.
export const TRANSICAO_FIRME = { duration: 200, easing: "ease" };

// Mede os retângulos dos cards só uma vez, antes do drag começar — evita
// que o dnd-kit re-meça a cada frame conforme o layout muda.
export const MEDICAO_ESTAVEL: MeasuringConfiguration = {
  droppable: { strategy: MeasuringStrategy.BeforeDragging },
};

// Ordem manual por contexto (ver OrdenacaoInstancia no backend — Etapa 1,
// PR #17). O drag só deve iniciar pela alça (AlcaArrastar), nunca pelo card
// inteiro. Mecânica "estilo iPhone/Pinterest": os cards de fundo ficam
// parados durante o arraste — só uma barra guia indica o índice de inserção
// (calculado a cada frame contra os retângulos medidos, mas só vira
// re-render quando o índice de fato muda — nunca recomputa layout por
// frame). A sequência só se reacomoda (uma vez, com transição firme) quando
// o card é solto. Salvamento é otimista: reordena a lista local e chama o
// PATCH em paralelo; se falhar, desfaz e avisa via `erro`.
export function useOrdenacaoArrastavel<T extends { id: string }>(
  contexto: string,
  itens: T[],
  setItens: (itens: T[]) => void
) {
  const [erro, setErro] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [indiceInsercao, setIndiceInsercao] = useState<number | null>(null);
  const indiceRef = useRef<number | null>(null);

  // TouchSensor com delay de long-press: se o dedo mover mais que a
  // tolerância antes do delay passar, o dnd-kit cancela a ativação do drag e
  // deixa o gesto virar scroll normal da página.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } })
  );

  // Encontra o card cujo CENTRO está mais próximo do ponteiro (distância 2D,
  // considera coluna e linha) e decide inserir antes/depois dele comparando
  // a posição vertical do ponteiro com o meio vertical desse card. Grava o
  // índice num ref (síncrono, sem re-render) — quem decide quando virar
  // estado de fato é o onDragMove abaixo.
  const colisaoPorIndice: CollisionDetection = useCallback(
    (args) => {
      const { active, droppableRects, droppableContainers, pointerCoordinates } = args;
      if (!pointerCoordinates) return [];

      let maisProximo: { id: UniqueIdentifier; distancia: number; centroY: number } | null = null;
      for (const container of droppableContainers) {
        if (container.id === active.id) continue;
        const rect = droppableRects.get(container.id);
        if (!rect) continue;
        const centroX = rect.left + rect.width / 2;
        const centroY = rect.top + rect.height / 2;
        const dx = pointerCoordinates.x - centroX;
        const dy = pointerCoordinates.y - centroY;
        const distancia = dx * dx + dy * dy;
        if (!maisProximo || distancia < maisProximo.distancia) {
          maisProximo = { id: container.id, distancia, centroY };
        }
      }

      if (!maisProximo) {
        indiceRef.current = null;
        return [];
      }

      const idx = itens.findIndex((i) => i.id === maisProximo!.id);
      indiceRef.current = pointerCoordinates.y < maisProximo.centroY ? idx : idx + 1;
      return [{ id: maisProximo.id }];
    },
    [itens]
  );

  const onDragStart = useCallback((event: DragStartEvent) => {
    indiceRef.current = null;
    setIndiceInsercao(null);
    setActiveId(String(event.active.id));
  }, []);

  // Roda a cada frame de movimento, mas só provoca re-render (setState)
  // quando o índice calculado pela colisão de fato mudou — é isso que torna
  // a barra guia quantizada/discreta em vez de contínua.
  const onDragMove = useCallback(() => {
    setIndiceInsercao((atual) => (atual === indiceRef.current ? atual : indiceRef.current));
  }, []);

  const onDragEnd = useCallback(
    (event: DragEndEvent) => {
      const indiceDestino = indiceRef.current;
      setActiveId(null);
      setIndiceInsercao(null);
      indiceRef.current = null;

      if (indiceDestino == null) return;
      const idAtivo = String(event.active.id);
      const anterior = itens;
      const oldIndex = anterior.findIndex((i) => i.id === idAtivo);
      if (oldIndex === -1) return;

      // Remover o item do índice antigo desloca os que vêm depois — se o
      // destino é depois da posição original, compensa em 1.
      let newIndex = indiceDestino > oldIndex ? indiceDestino - 1 : indiceDestino;
      newIndex = Math.max(0, Math.min(anterior.length - 1, newIndex));
      if (newIndex === oldIndex) return;

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
    setIndiceInsercao(null);
    indiceRef.current = null;
  }, []);

  const idsAtuais = useMemo(() => itens.map((i) => i.id), [itens]);
  // O item ativo é usado pra renderizar o <DragOverlay> — a cópia sólida,
  // de tamanho fixo, que segue o cursor/dedo.
  const itemAtivo = useMemo(() => itens.find((i) => i.id === activeId) ?? null, [itens, activeId]);

  return {
    sensors,
    collisionDetection: colisaoPorIndice,
    measuring: MEDICAO_ESTAVEL,
    onDragStart,
    onDragMove,
    onDragEnd,
    onDragCancel,
    activeId,
    emArraste: activeId != null,
    indiceInsercao,
    itemAtivo,
    idsAtuais,
    erro,
    limparErro: () => setErro(null),
  };
}

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
import { calcularInsercaoMasonry, type ColunaMasonry } from "@/lib/masonryOrdenacao";

// Config de transição dos itens sortable — ~200ms com easing decidido (o
// "delay firme" do iPhone/Pinterest). Só entra em jogo quando a sequência
// realmente muda (reflow único ao soltar, via animateLayoutChanges do
// dnd-kit) — durante o arraste em si o transform é suprimido (ver
// `emArraste` em cada wrapper de card), então os cards de fundo não se
// movem, só a barra guia reage.
export const TRANSICAO_FIRME = { duration: 200, easing: "ease" };

// Mede os retângulos dos cards só uma vez, antes do drag começar — evita
// que o dnd-kit re-meça a cada frame conforme o layout muda.
export const MEDICAO_ESTAVEL: MeasuringConfiguration = {
  droppable: { strategy: MeasuringStrategy.BeforeDragging },
};

export type PosicaoMasonry = { coluna: ColunaMasonry; posicaoLocal: number };

// Ordem manual por contexto (ver OrdenacaoInstancia no backend — Etapa 1,
// PR #17). O drag só deve iniciar pela alça (AlcaArrastar), nunca pelo card
// inteiro. Mecânica "estilo iPhone/Pinterest": os cards de fundo ficam
// parados durante o arraste — só uma barra guia indica onde o card vai
// entrar. A sequência só se reacomoda (uma vez, com transição firme) quando
// o card é solto. Salvamento é otimista: reordena a lista local e chama o
// PATCH em paralelo; se falhar, desfaz e avisa via `erro`.
export function useOrdenacaoArrastavel<T extends { id: string }>(
  contexto: string,
  itens: T[],
  setItens: (itens: T[]) => void,
  // colunas=2: tela usa masonry (ColunasMasonry) — decide a coluna pelo X
  // do ponteiro ANTES de procurar a posição por Y (ver colisaoPorIndice).
  // colunas=1: lista única (Pagamentos), sem noção de coluna nenhuma.
  opcoes: { colunas?: 1 | 2 } = {}
) {
  const colunas = opcoes.colunas ?? 2;
  const [erro, setErro] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [indiceInsercao, setIndiceInsercao] = useState<number | null>(null);
  const [posicaoInsercao, setPosicaoInsercao] = useState<PosicaoMasonry | null>(null);
  const indiceRef = useRef<number | null>(null);
  const posicaoRef = useRef<PosicaoMasonry | null>(null);

  // TouchSensor com delay de long-press: se o dedo mover mais que a
  // tolerância antes do delay passar, o dnd-kit cancela a ativação do drag e
  // deixa o gesto virar scroll normal da página.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } })
  );

  // Lista única (Pagamentos): sem coluna, "mais próximo" por distância 2D
  // pura já é suficiente (todo card tem o mesmo X). Índice pré-remoção +
  // desconto padrão no onDragEnd (ver abaixo) — comportamento intocado.
  const colisaoListaUnica: CollisionDetection = useCallback(
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

  // Masonry (colunas === 2): decide a coluna PRIMEIRO pelo X do ponteiro
  // (comparando o X contra o centro medido de um card de cada coluna) —
  // nunca mistura X e Y numa distância 2D só, que é o que fazia um card da
  // coluna errada "ganhar" por estar verticalmente mais alinhado quando as
  // colunas têm alturas bem diferentes (auditoria: caso reproduzido com
  // esquerda de 3 cards de 300px e direita de 2 cards de 80px). SÓ ENTÃO
  // busca, por Y, o card mais próximo dentro dessa coluna. A conversão
  // pra índice final (e pra onde a barra guia aparece) é feita inteira por
  // calcularInsercaoMasonry — única fonte, validada isoladamente em Node
  // contra 13 cenários antes de entrar aqui.
  const colisaoMasonry: CollisionDetection = useCallback(
    (args) => {
      const { active, droppableRects, droppableContainers, pointerCoordinates } = args;
      if (!pointerCoordinates) {
        posicaoRef.current = null;
        indiceRef.current = null;
        return [];
      }

      const idAtivo = String(active.id);
      const itensIds = itens.map((i) => i.id);
      const meio = Math.ceil(itensIds.length / 2);
      const colunaDoId = (id: string): ColunaMasonry => (itensIds.indexOf(id) < meio ? "esquerda" : "direita");

      let xEsquerda: number | null = null;
      let xDireita: number | null = null;
      for (const container of droppableContainers) {
        const id = String(container.id);
        if (id === idAtivo) continue;
        const rect = droppableRects.get(container.id);
        if (!rect) continue;
        const centroX = rect.left + rect.width / 2;
        const coluna = colunaDoId(id);
        if (coluna === "esquerda" && xEsquerda == null) xEsquerda = centroX;
        if (coluna === "direita" && xDireita == null) xDireita = centroX;
      }
      if (xEsquerda == null && xDireita == null) {
        posicaoRef.current = null;
        indiceRef.current = null;
        return [];
      }
      const divisorX = xEsquerda != null && xDireita != null ? (xEsquerda + xDireita) / 2 : (xEsquerda ?? xDireita)!;
      const colunaAlvo: ColunaMasonry = pointerCoordinates.x < divisorX ? "esquerda" : "direita";

      let maisProximo: { id: UniqueIdentifier; centroY: number } | null = null;
      let melhorDist = Infinity;
      for (const container of droppableContainers) {
        const id = String(container.id);
        if (id === idAtivo) continue;
        if (colunaDoId(id) !== colunaAlvo) continue;
        const rect = droppableRects.get(container.id);
        if (!rect) continue;
        const centroY = rect.top + rect.height / 2;
        const distancia = Math.abs(pointerCoordinates.y - centroY);
        if (distancia < melhorDist) {
          melhorDist = distancia;
          maisProximo = { id: container.id, centroY };
        }
      }

      const antes = maisProximo ? pointerCoordinates.y < maisProximo.centroY : true;
      const { coluna, posicaoLocal, indiceFinal } = calcularInsercaoMasonry(
        itensIds,
        idAtivo,
        colunaAlvo,
        maisProximo ? String(maisProximo.id) : null,
        antes
      );

      posicaoRef.current = { coluna, posicaoLocal };
      indiceRef.current = indiceFinal;
      return maisProximo ? [{ id: maisProximo.id }] : [];
    },
    [itens]
  );

  const onDragStart = useCallback((event: DragStartEvent) => {
    indiceRef.current = null;
    posicaoRef.current = null;
    setIndiceInsercao(null);
    setPosicaoInsercao(null);
    setActiveId(String(event.active.id));
  }, []);

  // Roda a cada frame de movimento, mas só provoca re-render (setState)
  // quando a posição calculada pela colisão de fato mudou — é isso que
  // torna a barra guia quantizada/discreta em vez de contínua.
  const onDragMove = useCallback(() => {
    if (colunas === 2) {
      setPosicaoInsercao((atual) => {
        const novo = posicaoRef.current;
        if (atual?.coluna === novo?.coluna && atual?.posicaoLocal === novo?.posicaoLocal) return atual;
        return novo;
      });
    } else {
      setIndiceInsercao((atual) => (atual === indiceRef.current ? atual : indiceRef.current));
    }
  }, [colunas]);

  const onDragEnd = useCallback(
    (event: DragEndEvent) => {
      const indiceDestino = indiceRef.current;
      setActiveId(null);
      setIndiceInsercao(null);
      setPosicaoInsercao(null);
      indiceRef.current = null;
      posicaoRef.current = null;

      if (indiceDestino == null) return;
      const idAtivo = String(event.active.id);
      const anterior = itens;
      const oldIndex = anterior.findIndex((i) => i.id === idAtivo);
      if (oldIndex === -1) return;

      let newIndex: number;
      if (colunas === 2) {
        // calcularInsercaoMasonry já devolve o índice final pronto pro
        // arrayMove (a conversão — incluindo o caso especial de cruzar
        // fronteira de coluna — mora inteira lá, não aqui).
        newIndex = indiceDestino;
      } else {
        // Lista única: índice pré-remoção — remover do índice antigo
        // desloca os que vêm depois.
        newIndex = indiceDestino > oldIndex ? indiceDestino - 1 : indiceDestino;
      }
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
    [contexto, itens, setItens, colunas]
  );

  const onDragCancel = useCallback(() => {
    setActiveId(null);
    setIndiceInsercao(null);
    setPosicaoInsercao(null);
    indiceRef.current = null;
    posicaoRef.current = null;
  }, []);

  const idsAtuais = useMemo(() => itens.map((i) => i.id), [itens]);
  // O item ativo é usado pra renderizar o <DragOverlay> — a cópia sólida,
  // de tamanho fixo, que segue o cursor/dedo.
  const itemAtivo = useMemo(() => itens.find((i) => i.id === activeId) ?? null, [itens, activeId]);

  return {
    sensors,
    collisionDetection: colunas === 2 ? colisaoMasonry : colisaoListaUnica,
    measuring: MEDICAO_ESTAVEL,
    onDragStart,
    onDragMove,
    onDragEnd,
    onDragCancel,
    activeId,
    emArraste: activeId != null,
    indiceInsercao,
    posicaoInsercao,
    itemAtivo,
    idsAtuais,
    erro,
    limparErro: () => setErro(null),
  };
}

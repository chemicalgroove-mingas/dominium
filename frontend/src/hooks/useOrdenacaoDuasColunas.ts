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
import { api } from "@/lib/api";
import { useMobile } from "./useMobile";
import { agruparPorColuna, desmesclarDeMobile, mesclarParaMobile } from "@/lib/duasColunas";

// Config de transição dos itens sortable — ~200ms com easing decidido (o
// "delay firme" do iPhone/Pinterest). Só entra em jogo quando a lista
// realmente muda (reflow único ao soltar, via animateLayoutChanges do
// dnd-kit) — durante o arraste em si o transform é suprimido (ver
// `emArraste`), então os cards de fundo não se movem, só a barra guia reage.
export const TRANSICAO_FIRME = { duration: 200, easing: "ease" };

// Mede os retângulos dos cards só uma vez, antes do drag começar — evita
// que o dnd-kit re-meça a cada frame conforme o layout muda.
export const MEDICAO_ESTAVEL: MeasuringConfiguration = {
  droppable: { strategy: MeasuringStrategy.BeforeDragging },
};

export type PosicaoInsercao = { lista: number; posicaoLocal: number };

// Duas colunas INDEPENDENTES por contexto (Etapa 2) — cada uma é uma lista
// 1D pura (o cenário estável do dnd-kit), sem a capacidade fixa acoplada do
// modelo anterior de sequência única dobrada. `listas` tem 2 entradas no
// desktop (coluna 0, coluna 1) ou 1 no mobile (a lista mesclada — ver
// duasColunas.ts). O drag em si nem sabe que existe "mobile": pra ele é
// sempre "mover um item entre 1..N listas independentes" — a única
// diferença é quantas listas existem e como elas convertem de/pra `itens`
// (o array plano vindo do backend, já ordenado por (coluna, ordem)) e pro
// formato do PATCH.
//
// Mecânica "estilo iPhone/Pinterest", igual à tentativa anterior: cards de
// fundo ficam parados durante o arraste (transform suprimido via
// `emArraste`), só uma barra guia indica onde o card vai entrar — calculada
// a cada frame mas só virando re-render quando a posição de fato muda.
// Reacomoda (uma vez, com transição firme) só ao soltar. Salvamento é
// otimista: atualiza a lista local na hora e chama o PATCH em paralelo; se
// falhar, desfaz e avisa via `erro`.
export function useOrdenacaoDuasColunas<T extends { id: string; coluna: number }>(
  contexto: string,
  itens: T[],
  setItens: (itens: T[]) => void
) {
  const mobile = useMobile();
  const [erro, setErro] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [posicaoInsercao, setPosicaoInsercao] = useState<PosicaoInsercao | null>(null);
  const posicaoRef = useRef<PosicaoInsercao | null>(null);

  const listas = useMemo<T[][]>(() => {
    const [coluna0, coluna1] = agruparPorColuna(itens);
    return mobile ? [mesclarParaMobile(coluna0, coluna1)] : [coluna0, coluna1];
  }, [itens, mobile]);

  // Converte `listas` (1 ou 2, conforme mobile) de volta pro array plano
  // com `coluna` corrigido em cada item — usado tanto pra atualizar o
  // estado local otimista quanto, junto de `paraColunasPatch`, pro envio.
  const paraItensPlanos = useCallback(
    (novasListas: T[][]): T[] => {
      const [c0, c1] = mobile ? desmesclarDeMobile(novasListas[0]) : [novasListas[0], novasListas[1]];
      return [...c0.map((i) => ({ ...i, coluna: 0 })), ...c1.map((i) => ({ ...i, coluna: 1 }))];
    },
    [mobile]
  );

  const paraColunasPatch = useCallback(
    (novasListas: T[][]): [string[], string[]] => {
      const [c0, c1] = mobile ? desmesclarDeMobile(novasListas[0]) : [novasListas[0], novasListas[1]];
      return [c0.map((i) => i.id), c1.map((i) => i.id)];
    },
    [mobile]
  );

  // TouchSensor com delay de long-press: se o dedo mover mais que a
  // tolerância antes do delay passar, o dnd-kit cancela a ativação do drag e
  // deixa o gesto virar scroll normal da página.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } })
  );

  // Decide a LISTA alvo pelo X do ponteiro primeiro (só relevante com mais
  // de uma lista — no mobile, sempre lista 0, sem ambiguidade nenhuma). Só
  // então busca por Y o card mais próximo dentro dela, excluindo o item
  // ativo da contagem — por isso `posicaoLocal` já nasce pronto pra montar
  // a lista final, sem nenhum desconto ou caso especial (diferente do
  // modelo anterior: aqui não existe capacidade fixa compartilhada entre
  // listas, então não existe fronteira ambígua).
  const colisao: CollisionDetection = useCallback(
    (args) => {
      const { active, droppableRects, droppableContainers, pointerCoordinates } = args;
      if (!pointerCoordinates) {
        posicaoRef.current = null;
        return [];
      }
      const idAtivo = String(active.id);

      const listaDoId = new Map<string, number>();
      listas.forEach((lista, li) => lista.forEach((item) => listaDoId.set(item.id, li)));

      let listaAlvo = 0;
      if (listas.length > 1) {
        const centrosX: Array<number | null> = listas.map(() => null);
        for (const container of droppableContainers) {
          const id = String(container.id);
          if (id === idAtivo) continue;
          const li = listaDoId.get(id);
          if (li == null || centrosX[li] != null) continue;
          const rect = droppableRects.get(container.id);
          if (!rect) continue;
          centrosX[li] = rect.left + rect.width / 2;
        }
        if (centrosX[0] != null && centrosX[1] != null) {
          const divisorX = (centrosX[0]! + centrosX[1]!) / 2;
          listaAlvo = pointerCoordinates.x < divisorX ? 0 : 1;
        } else if (centrosX[1] != null) {
          listaAlvo = 1;
        }
      }

      let maisProximo: { id: UniqueIdentifier; centroY: number } | null = null;
      let melhorDist = Infinity;
      for (const container of droppableContainers) {
        const id = String(container.id);
        if (id === idAtivo) continue;
        if (listaDoId.get(id) !== listaAlvo) continue;
        const rect = droppableRects.get(container.id);
        if (!rect) continue;
        const centroY = rect.top + rect.height / 2;
        const distancia = Math.abs(pointerCoordinates.y - centroY);
        if (distancia < melhorDist) {
          melhorDist = distancia;
          maisProximo = { id: container.id, centroY };
        }
      }

      let posicaoLocal = 0;
      if (maisProximo) {
        const itensDaLista = listas[listaAlvo].filter((i) => i.id !== idAtivo);
        const idxLocal = itensDaLista.findIndex((i) => i.id === maisProximo!.id);
        posicaoLocal = pointerCoordinates.y < maisProximo.centroY ? idxLocal : idxLocal + 1;
      }

      posicaoRef.current = { lista: listaAlvo, posicaoLocal };
      return maisProximo ? [{ id: maisProximo.id }] : [];
    },
    [listas]
  );

  const onDragStart = useCallback((event: DragStartEvent) => {
    posicaoRef.current = null;
    setPosicaoInsercao(null);
    setActiveId(String(event.active.id));
  }, []);

  // Roda a cada frame de movimento, mas só provoca re-render (setState)
  // quando a posição calculada pela colisão de fato mudou — é isso que
  // torna a barra guia quantizada/discreta em vez de contínua.
  const onDragMove = useCallback(() => {
    setPosicaoInsercao((atual) => {
      const novo = posicaoRef.current;
      if (atual?.lista === novo?.lista && atual?.posicaoLocal === novo?.posicaoLocal) return atual;
      return novo;
    });
  }, []);

  const onDragEnd = useCallback(
    (event: DragEndEvent) => {
      const alvo = posicaoRef.current;
      setActiveId(null);
      setPosicaoInsercao(null);
      posicaoRef.current = null;
      if (!alvo) return;

      const idAtivo = String(event.active.id);
      const anterior = listas;
      let itemAtivo: T | undefined;
      const semAtivo = anterior.map((lista) =>
        lista.filter((i) => {
          if (i.id !== idAtivo) return true;
          itemAtivo = i;
          return false;
        })
      );
      if (!itemAtivo) return;

      const novasListas = semAtivo.map((lista, li) =>
        li === alvo.lista
          ? [...lista.slice(0, alvo.posicaoLocal), itemAtivo!, ...lista.slice(alvo.posicaoLocal)]
          : lista
      );

      const idsAntes = anterior.map((l) => l.map((i) => i.id).join(","));
      const idsDepois = novasListas.map((l) => l.map((i) => i.id).join(","));
      if (idsAntes.join("|") === idsDepois.join("|")) return; // no-op: soltou onde já estava

      const itensAnteriores = itens;
      setItens(paraItensPlanos(novasListas));

      const [colunas0, colunas1] = paraColunasPatch(novasListas);
      api
        .patch("/api/instancias/ordenacao", { contexto, colunas: [colunas0, colunas1] })
        .catch(() => {
          setItens(itensAnteriores);
          setErro("Não foi possível salvar a nova ordem. Tente novamente.");
        });
    },
    [listas, itens, setItens, contexto, paraItensPlanos, paraColunasPatch]
  );

  const onDragCancel = useCallback(() => {
    setActiveId(null);
    setPosicaoInsercao(null);
    posicaoRef.current = null;
  }, []);

  const itemAtivo = useMemo(() => itens.find((i) => i.id === activeId) ?? null, [itens, activeId]);

  return {
    mobile,
    listas,
    sensors,
    collisionDetection: colisao,
    measuring: MEDICAO_ESTAVEL,
    onDragStart,
    onDragMove,
    onDragEnd,
    onDragCancel,
    activeId,
    emArraste: activeId != null,
    posicaoInsercao,
    itemAtivo,
    erro,
    limparErro: () => setErro(null),
  };
}

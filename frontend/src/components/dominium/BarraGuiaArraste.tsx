"use client";

// Indicador de onde o card solto vai entrar na sequência — os cards de
// fundo ficam parados durante o arraste, só essa barra se move (aparece/
// desaparece conforme o índice de inserção calculado em
// useOrdenacaoArrastavel muda). Discreta de propósito — visível, mas sem
// competir com os cards: tom neutro (cream) em opacidade baixa, linha fina.
export function BarraGuiaArraste() {
  return <div aria-hidden className="h-0.5 w-full shrink-0 rounded-full bg-cream-100/25" />;
}

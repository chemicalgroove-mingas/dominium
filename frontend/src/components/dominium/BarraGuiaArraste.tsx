"use client";

// Indicador de onde o card solto vai entrar na sequência — os cards de
// fundo ficam parados durante o arraste, só essa barra se move (aparece/
// desaparece conforme o índice de inserção calculado em
// useOrdenacaoArrastavel muda).
export function BarraGuiaArraste() {
  return <div aria-hidden className="h-[3px] w-full shrink-0 rounded-full bg-gold-500" />;
}

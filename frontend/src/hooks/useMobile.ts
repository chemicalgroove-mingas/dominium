"use client";

import { useSyncExternalStore } from "react";

// Mesmo breakpoint que já era usado (via CSS, sm:) pra colapsar 2 colunas
// em 1 nas telas de instância — agora decidido em JS porque no mobile as
// duas colunas viram uma lista mesclada (não é só empilhar visualmente, a
// própria estrutura de drag muda: ver useOrdenacaoDuasColunas). Mesmo
// padrão de useOnlineStatus (useSyncExternalStore) pra ler estado externo
// do browser sem cair no anti-padrão de setState dentro de efeito.
const QUERY = "(max-width: 639px)";

function inscrever(retorno: () => void) {
  const mq = window.matchMedia(QUERY);
  mq.addEventListener("change", retorno);
  return () => mq.removeEventListener("change", retorno);
}

const obterMobile = () => window.matchMedia(QUERY).matches;
const obterMobileServidor = () => false;

export function useMobile(): boolean {
  return useSyncExternalStore(inscrever, obterMobile, obterMobileServidor);
}

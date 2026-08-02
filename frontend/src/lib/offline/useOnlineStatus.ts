"use client";

import { useSyncExternalStore } from "react";

function inscrever(retorno: () => void) {
  window.addEventListener("online", retorno);
  window.addEventListener("offline", retorno);
  return () => {
    window.removeEventListener("online", retorno);
    window.removeEventListener("offline", retorno);
  };
}

const obterOnline = () => navigator.onLine;
const obterOnlineServidor = () => true;

export function useOnlineStatus() {
  return useSyncExternalStore(inscrever, obterOnline, obterOnlineServidor);
}

"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Download, X } from "lucide-react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isStandalone() {
  if (typeof window === "undefined") return true;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
}

function inscreverStandalone(retorno: () => void) {
  const mql = window.matchMedia("(display-mode: standalone)");
  mql.addEventListener("change", retorno);
  return () => mql.removeEventListener("change", retorno);
}

const obterStandaloneServidor = () => true;

function useEmStandalone() {
  return useSyncExternalStore(inscreverStandalone, isStandalone, obterStandaloneServidor);
}

function isIosSafari() {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent;
  const isIos = /iphone|ipad|ipod/i.test(ua);
  const isSafari = /safari/i.test(ua) && !/crios|fxios|edgios/i.test(ua);
  return isIos && isSafari;
}

export function InstallAppButton() {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const standalone = useEmStandalone();
  const [showIosHint, setShowIosHint] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const handler = (event: Event) => {
      event.preventDefault();
      setPromptEvent(event as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  if (standalone || dismissed) return null;
  if (!promptEvent && !isIosSafari()) return null;

  async function handleInstall() {
    if (!promptEvent) return;
    await promptEvent.prompt();
    await promptEvent.userChoice;
    setPromptEvent(null);
  }

  if (!promptEvent) {
    if (!showIosHint) {
      return (
        <button
          onClick={() => setShowIosHint(true)}
          className="flex items-center gap-2 rounded-xl border border-gold-500/30 px-3 py-2 text-xs text-cream-100/70 hover:border-gold-500/60"
        >
          <Download size={14} /> Instalar DOMINIUM
        </button>
      );
    }
    return (
      <div className="flex items-center gap-2 rounded-xl border border-gold-500/30 bg-navy-800 px-3 py-2 text-xs text-cream-100/70">
        <span>
          Para instalar: toque em <strong className="text-gold-300">Compartilhar</strong> →{" "}
          <strong className="text-gold-300">Adicionar à Tela de Início</strong>
        </span>
        <button onClick={() => setDismissed(true)} aria-label="Fechar" className="text-cream-100/40 hover:text-cream-100">
          <X size={14} />
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={handleInstall}
      className="flex items-center gap-2 rounded-xl border border-gold-500/30 px-3 py-2 text-xs text-cream-100/70 hover:border-gold-500/60"
    >
      <Download size={14} /> Instalar DOMINIUM
    </button>
  );
}

"use client";

import { useEffect } from "react";
import { CheckCircle2 } from "lucide-react";

// Toast simples, auto-dispensavel — sem lib externa. Fica ancorado acima da
// BottomNav (mesma logica de safe-area do layout) pra nao ser coberto nela.
export function Toast({ mensagem, onFechar }: { mensagem: string; onFechar: () => void }) {
  useEffect(() => {
    const id = setTimeout(onFechar, 2500);
    return () => clearTimeout(id);
  }, [onFechar]);

  return (
    <div className="fixed inset-x-0 z-[60] flex justify-center px-4 bottom-[calc(var(--bottom-nav-height)+env(safe-area-inset-bottom)+1rem)] sm:bottom-4">
      <div className="flex items-center gap-2 rounded-full border border-navy-700 bg-navy-800 px-4 py-2.5 text-sm text-cream-100 shadow-lg">
        <CheckCircle2 size={16} className="shrink-0 text-success" />
        {mensagem}
      </div>
    </div>
  );
}

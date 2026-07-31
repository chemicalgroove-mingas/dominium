"use client";

import { useAuth } from "@/contexts/AuthContext";
import { InstanciasProvider } from "@/contexts/InstanciasContext";
import { RecorteProvider } from "@/contexts/RecorteContext";
import { BottomNav, Sidebar } from "@/components/dominium/Nav";
import { LogOut } from "lucide-react";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { usuario, carregando, logout } = useAuth();

  if (carregando) {
    return <div className="flex flex-1 items-center justify-center text-cream-100/60">Carregando...</div>;
  }

  if (!usuario) {
    return <div className="flex flex-1 items-center justify-center text-cream-100/60">Redirecionando...</div>;
  }

  return (
    <InstanciasProvider>
      <RecorteProvider>
        <div className="flex min-h-screen flex-1">
          <Sidebar />
          <div className="flex flex-1 flex-col">
            <header className="flex items-center justify-between border-b border-navy-700 bg-navy-800 px-4 py-3 sm:hidden">
              <span className="font-brand text-lg text-gold-300">DOMINIUM</span>
              <button onClick={() => logout()} aria-label="Sair" className="p-2 text-cream-100/60">
                <LogOut size={18} />
              </button>
            </header>
            <main className="flex-1 px-4 pb-24 pt-4 sm:px-8 sm:pb-8 sm:pt-8">{children}</main>
          </div>
          <BottomNav />
        </div>
      </RecorteProvider>
    </InstanciasProvider>
  );
}

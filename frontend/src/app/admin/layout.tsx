"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { BottomNav, Sidebar, ITENS_ADMIN } from "@/components/dominium/Nav";
import { LogOut } from "lucide-react";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { usuario, carregando, logout } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (carregando) return;
    if (!usuario) {
      router.replace("/login");
    } else if (usuario.deveTrocarSenha) {
      router.replace("/trocar-senha");
    } else if (usuario.role !== "ADMIN") {
      // Usuario comum nunca ve o painel administrativo.
      router.replace("/dashboard");
    }
  }, [carregando, usuario, router]);

  if (carregando) {
    return <div className="flex flex-1 items-center justify-center text-cream-100/60">Carregando...</div>;
  }

  if (!usuario || usuario.deveTrocarSenha || usuario.role !== "ADMIN") {
    return <div className="flex flex-1 items-center justify-center text-cream-100/60">Redirecionando...</div>;
  }

  return (
    <div className="flex min-h-screen flex-1">
      <Sidebar itens={ITENS_ADMIN} />
      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-navy-700 bg-navy-800 px-4 py-3 sm:hidden">
          <span className="font-brand text-lg text-gold-300">DOMINIUM — Admin</span>
          <button onClick={() => logout()} aria-label="Sair" className="p-2 text-cream-100/60">
            <LogOut size={18} />
          </button>
        </header>
        <main className="flex-1 px-4 pb-24 pt-4 sm:px-8 sm:pb-8 sm:pt-8">{children}</main>
      </div>
      <BottomNav itens={ITENS_ADMIN} />
    </div>
  );
}

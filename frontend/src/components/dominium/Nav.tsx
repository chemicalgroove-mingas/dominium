"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, ListChecks, Receipt, PiggyBank, LogOut, Users, Ticket, type LucideIcon } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { InstallAppButton } from "@/components/dominium/InstallAppButton";

export type ItemNav = { href: string; label: string; Icon: LucideIcon };

export const ITENS_FINANCEIRO: ItemNav[] = [
  { href: "/dashboard", label: "Dashboard", Icon: LayoutDashboard },
  { href: "/lancamentos", label: "Lançamentos", Icon: ListChecks },
  { href: "/pagamentos", label: "Pagamentos", Icon: Receipt },
  { href: "/investimentos", label: "Reserva", Icon: PiggyBank },
];

export const ITENS_ADMIN: ItemNav[] = [
  { href: "/admin/usuarios", label: "Usuários", Icon: Users },
  { href: "/admin/vouchers", label: "Vouchers", Icon: Ticket },
];

export function BottomNav({ itens = ITENS_FINANCEIRO }: { itens?: ItemNav[] }) {
  const pathname = usePathname();
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 flex border-t border-navy-700 bg-navy-800 sm:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {itens.map(({ href, label, Icon }) => {
        const ativo = pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={`flex flex-1 flex-col items-center gap-1 py-2 text-[11px] ${
              ativo ? "text-gold-500" : "text-cream-100/60"
            }`}
          >
            <Icon size={20} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

export function Sidebar({ itens = ITENS_FINANCEIRO }: { itens?: ItemNav[] }) {
  const pathname = usePathname();
  const { usuario, logout } = useAuth();

  return (
    <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-navy-700 bg-navy-800 p-5 sm:flex">
      <div className="mb-8 flex items-center gap-2">
        <img src="/icons/icon-48.png" alt="DOMINIUM" className="h-9 w-9 rounded-full" />
        <span className="font-brand text-lg text-cream-100">DOMINIUM</span>
      </div>
      <nav className="flex flex-1 flex-col gap-1">
        {itens.map(({ href, label, Icon }) => {
          const ativo = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${
                ativo ? "bg-gold-500/10 text-gold-300" : "text-cream-100/70 hover:bg-navy-700"
              }`}
            >
              <Icon size={18} />
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="mb-4">
        <InstallAppButton />
      </div>
      <div className="border-t border-navy-700 pt-4 text-sm">
        <p className="mb-2 truncate text-cream-100/70">{usuario?.nome}</p>
        <button
          onClick={() => logout()}
          className="flex items-center gap-2 text-cream-100/50 hover:text-danger"
        >
          <LogOut size={16} /> Sair
        </button>
      </div>
    </aside>
  );
}

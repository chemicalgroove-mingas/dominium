import {
  Wallet,
  CreditCard,
  PiggyBank,
  Home,
  Car,
  ShoppingCart,
  Utensils,
  Plane,
  GraduationCap,
  HeartPulse,
  Briefcase,
  Gift,
  TrendingUp,
  Landmark,
  Smartphone,
  Dumbbell,
  Baby,
  Dog,
  Music,
  Coffee,
  type LucideIcon,
} from "lucide-react";

export const ICONES: Record<string, LucideIcon> = {
  wallet: Wallet,
  cartao: CreditCard,
  cofre: PiggyBank,
  casa: Home,
  carro: Car,
  compras: ShoppingCart,
  comida: Utensils,
  viagem: Plane,
  educacao: GraduationCap,
  saude: HeartPulse,
  trabalho: Briefcase,
  presente: Gift,
  investimento: TrendingUp,
  banco: Landmark,
  celular: Smartphone,
  academia: Dumbbell,
  filhos: Baby,
  pet: Dog,
  lazer: Music,
  assinatura: Coffee,
};

export const ICONES_DISPONIVEIS = Object.keys(ICONES);

export function IconePorNome({
  nome,
  className,
  style,
}: {
  nome: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const Icone = ICONES[nome] || Wallet;
  return <Icone className={className} style={style} />;
}

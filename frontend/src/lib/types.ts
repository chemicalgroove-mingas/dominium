export type Usuario = {
  id: string;
  nome: string;
  cpf: string;
  email: string;
  emailVerificado?: boolean;
};

export type TipoInstancia = "conta" | "cartao" | "categoria_gasto" | "categoria_receita" | "objetivo";

export type Instancia = {
  id: string;
  usuarioId: string;
  nome: string;
  tipo: TipoInstancia;
  cor: string;
  icone: string;
  metaValor: number | null;
  metaPrazo: string | null;
  arquivada: boolean;
  ordem: number;
  criadoEm: string;
  saldoLancado: number;
  _count?: { lancamentos: number };
};

export type TipoLancamento = "entrada" | "saida" | "transferencia";

export type Lancamento = {
  id: string;
  usuarioId: string;
  instanciaId: string;
  instancia: Instancia;
  tipo: TipoLancamento;
  valor: number;
  descricao: string | null;
  data: string;
  tags: string[];
  recorrente: boolean;
  criadoEm: string;
};

export type FiltrosRecorte = {
  de?: string | null;
  ate?: string | null;
  instanciaIds: string[];
  tipos: string[];
  tags: string[];
};

export type Recorte = {
  id: string;
  usuarioId: string;
  nome: string;
  filtros: FiltrosRecorte;
  criadoEm: string;
};

export type DashboardData = {
  saldoTotal: number;
  entradasMes: number;
  saidasMes: number;
  porInstancia: { id: string; nome: string; cor: string; icone: string; tipo: string; saldo: number }[];
  evolucao: { mes: string; saldoAcumulado: number }[];
  totalInstancias: number;
  totalLancamentos: number;
};

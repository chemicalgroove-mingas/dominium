export type Usuario = {
  id: string;
  nome: string;
  login: string;
  role: "USER" | "ADMIN";
  deveTrocarSenha: boolean;
};

export type UsuarioAdmin = {
  id: string;
  nome: string;
  login: string;
  status: "ATIVO" | "INATIVO";
  ultimoLogin: string | null;
  criadoEm: string;
};

export type VoucherStatus = "ATIVO" | "USADO" | "REVOGADO" | "EXPIRADO";

export type Voucher = {
  id: string;
  codigo: string;
  status: VoucherStatus;
  usuarioId: string | null;
  usuario: { id: string; nome: string; login: string } | null;
  criadoEm: string;
  utilizadoEm: string | null;
  expiraEm: string | null;
  criadoPor: string | null;
  observacao: string | null;
  expirado: boolean;
};

export type Grupo = "gasto" | "receita" | "investimento";

export type Instancia = {
  id: string;
  usuarioId: string;
  nome: string;
  grupo: Grupo;
  cor: string;
  ativa: boolean;
  criadoEm: string;
};

export type TipoLancamento = "fixo" | "temporario";

export type Lancamento = {
  id: string;
  usuarioId: string;
  instanciaId: string;
  descricao: string;
  valor: number;
  tipo: TipoLancamento;
  parcelas: number | null;
  mesInicio: string;
  mesFim: string | null;
  ativo: boolean;
  observacoes: string | null;
  criadoEm: string;
  pagas: number | null;
  restantes: number | null;
  totalRestante: number | null;
};

export type Janela = "mes" | "3m" | "6m" | "12m";

export type ItemEmAberto = {
  lancamentoId: string;
  descricao: string;
  valor: number;
  tipo: TipoLancamento;
};

export type InstanciaEmAberto = {
  id: string;
  nome: string;
  cor: string;
  totalAberto: number;
  itens: ItemEmAberto[];
};

export type Pagamento = {
  id: string;
  usuarioId: string;
  instanciaId: string;
  lancamentoId: string | null;
  mesReferencia: string;
  valorPago: number;
  tipo: "total" | "selecionado" | "parcial" | "avulso";
  observacoes: string | null;
  criadoEm: string;
};

export type Investimento = {
  id: string;
  usuarioId: string;
  instanciaId: string;
  descricao: string;
  valor: number;
  observacoes: string | null;
  criadoEm: string;
};

export type ContaInvestimento = Instancia & {
  fluxos: Investimento[];
  patrimonio: number;
};

export type PontoEvolucaoMensal = {
  mes: string;
  receita: number;
  gasto: number;
  folga: number;
  proximidade: number;
};

export type PontoSaldo = { mes: string; saldoAcumulado: number };

export type DashboardData = {
  janela: Janela;
  mesReferencia: string;
  receitaPeriodo: number;
  despesaPeriodo: number;
  saldoPeriodo: number;
  comprometimento: number;
  sobraLivreMes: number;
  evolucaoMensal: PontoEvolucaoMensal[];
  saldoAcumuladoHistorico: PontoSaldo[];
  saldoConsolidado: PontoSaldo[];
  totalHistorico: number;
  impactoPorInstancia: { id: string; nome: string; cor: string; total: number }[];
  patrimonioInvestido: number;
  contasInvestimento: { id: string; nome: string; cor: string; patrimonio: number }[];
  totalInstancias: number;
  totalLancamentos: number;
};

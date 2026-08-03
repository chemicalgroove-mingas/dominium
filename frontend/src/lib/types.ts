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
export type Subgrupo = "pessoal" | "patrimonial";

export type Instancia = {
  id: string;
  usuarioId: string;
  nome: string;
  grupo: Grupo;
  subgrupo: Subgrupo | null;
  cor: string;
  ativa: boolean;
  criadoEm: string;
};

export type TipoLancamento = "fixo" | "temporario";

export type ValorExtra = {
  id: string;
  lancamentoId: string;
  valor: number;
  descricao: string | null;
  viaRecalculo: boolean;
  criadoEm: string;
};

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
  valorMeta: number | null;
  valorUltimaParcela: number | null;
  valorAbatido: number;
  valorRendimento: number;
  valorBaseAcumulado: number;
  valoresExtras?: ValorExtra[];
  ativo: boolean;
  observacoes: string | null;
  criadoEm: string;
  pagas: number | null;
  // Campos abaixo refletem a competencia (mesReferencia) selecionada no
  // seletor de mes, nao o estado global do lancamento — ver
  // backend/src/routes/lancamentos.js (competenciaDoLancamento). Um lancamento
  // so aparece na lista de um mes se tiver efeito financeiro nele.
  valorParcela: number | null;
  parcelaAtual: number | null;
  restantes: number | null;
  totalRestante: number | null;
};

export type Janela = "mes" | "3m" | "6m" | "12m";

export type ItemEmAberto = {
  lancamentoId: string;
  descricao: string;
  valor: number;
  tipo: TipoLancamento;
  pago: boolean;
  valorPago: number | null;
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

export type Resgate = {
  id: string;
  usuarioId: string;
  instanciaId: string;
  descricao: string;
  valor: number;
  observacoes: string | null;
  criadoEm: string;
};

export type Aporte = Lancamento & {
  acumulado: number;
  parcelasDecorridas: number;
  parcelasRestantesComValor: number | null;
  proximaParcela: number | null;
  ultimaParcela: number | null;
  metaBatida: boolean;
};

export type ContaInvestimento = Instancia & {
  aportes: Aporte[];
  resgates: Resgate[];
  patrimonio: number;
  metaBatida: boolean;
};

export type PontoEvolucaoMensal = {
  mes: string;
  receita: number;
  gasto: number;
  folga: number;
  proximidade: number;
};

export type PontoSaldo = { mes: string; saldoAcumulado: number };

export type Direcao = "passado" | "futuro";

export type DashboardData = {
  janela: Janela;
  mesReferencia: string;
  direcao: Direcao;
  inicioJanela: string;
  fimJanela: string;
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
  patrimonioPessoal: number;
  patrimonioPatrimonial: number;
  projecaoPatrimonioPessoal: number;
  projecaoPatrimonioPatrimonial: number;
  contasInvestimento: { id: string; nome: string; cor: string; subgrupo: Subgrupo; patrimonio: number }[];
  totalInstancias: number;
  totalLancamentos: number;
};

// Espelha o payload de GET /api/relatorio (backend/src/routes/relatorio.js):
// resumo reaproveita os mesmos agregados do dashboard; porInstancia traz os
// lancamentos discriminados linha a linha (parcelasNaJanela), ja projetados
// pelo backend — o frontend so formata isso em PDF, nunca recalcula.
export type LinhaRelatorio = {
  lancamentoId: string;
  descricao: string;
  tipo: TipoLancamento;
  mes: string;
  valor: number;
  parcela: number | null;
  totalParcelas: number | null;
};

export type InstanciaRelatorio = {
  instancia: { id: string; nome: string; grupo: Grupo; subgrupo: Subgrupo | null; cor: string };
  linhas: LinhaRelatorio[];
};

export type RelatorioData = {
  resumo: Omit<DashboardData, "totalInstancias" | "totalLancamentos">;
  porInstancia: InstanciaRelatorio[];
};

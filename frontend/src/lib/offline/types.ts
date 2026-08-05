import type { Aporte, Instancia, Lancamento, Resgate, TipoLancamento, Usuario } from "@/lib/types";

export type StatusSincronizacao = "pending" | "syncing" | "synced" | "failed";

// Mesmo formato pra criar um lançamento comum (POST /api/lancamentos) e um
// aporte de reserva (POST /api/investimentos/aporte) — as duas rotas
// aceitam exatamente os mesmos campos, então um único payload serve pra
// ambos os tipos de operação da outbox.
export type PayloadCriarLancamento = {
  instanciaId: string;
  descricao: string;
  valor: number;
  tipo: TipoLancamento;
  parcelas: number | null;
  mesInicio: string;
  observacoes: string | null;
  // 'total': "valor" é o total da compra, o backend calcula a parcela.
  // Omitido (ou 'parcela'): "valor" já é a parcela — comportamento de
  // sempre, usado pelo Lançamento Rápido (nunca envia este campo).
  modoValor?: "total" | "parcela";
};

export type PayloadCriarResgate = {
  instanciaId: string;
  descricao: string;
  valor: number;
  observacoes: string | null;
};

export type TipoOperacaoOutbox = "criar-lancamento" | "criar-aporte" | "criar-resgate";

export type OperacaoOutbox = {
  opId: string;
  usuarioId: string;
  clienteId: string;
  tipo: TipoOperacaoOutbox;
  // Endpoint pra onde a operação é enviada ao sincronizar — o syncManager é
  // agnóstico de domínio, só faz POST nele com {...payload, id: clienteId}.
  endpoint: string;
  payload: PayloadCriarLancamento | PayloadCriarResgate;
  status: StatusSincronizacao;
  tentativas: number;
  proximaTentativaEm: number;
  ultimoErro: string | null;
  criadoEm: number;
};

export type LancamentoLocal = Lancamento & { syncStatus: StatusSincronizacao };

// Campos computados só pelo servidor (acumulado, parcelasDecorridas,
// metaBatida etc.) ficam neutros no otimista até a reconciliação por id
// trazer os valores reais — nunca inventados (ver construirAporteOtimista).
export type AporteLocal = Aporte & { syncStatus: StatusSincronizacao };

export type ResgateLocal = Resgate & { syncStatus: StatusSincronizacao };

export type InstanciaCache = Instancia;

// Snapshot genérico de leitura: a última resposta bem-sucedida de uma tela,
// guardada como veio do backend (sem recálculo local), pra continuidade
// visual offline. Nunca é fonte de verdade financeira — só o último dado
// confirmado, com timestamp pra deixar isso explícito na UI.
export type Snapshot<T> = { chave: string; usuarioId: string; dados: T; atualizadoEm: number };

// Snapshot não-sensível da última sessão válida (mesmo formato que a API já
// expõe ao cliente — sem senha, sem token). Usado só pra decidir se o app
// pode abrir o shell offline num cold start; nunca substitui a checagem real
// contra o servidor assim que a rede volta.
export type SessaoLocal = { chave: "atual"; usuario: Usuario; atualizadoEm: number };

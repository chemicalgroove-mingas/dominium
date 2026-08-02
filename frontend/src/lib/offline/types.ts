import type { Instancia, Lancamento, TipoLancamento, Usuario } from "@/lib/types";

export type StatusSincronizacao = "pending" | "syncing" | "synced" | "failed";

export type PayloadCriarLancamento = {
  instanciaId: string;
  descricao: string;
  valor: number;
  tipo: TipoLancamento;
  parcelas: number | null;
  mesInicio: string;
  observacoes: string | null;
};

export type OperacaoOutbox = {
  opId: string;
  usuarioId: string;
  clienteId: string;
  tipo: "criar-lancamento";
  payload: PayloadCriarLancamento;
  status: StatusSincronizacao;
  tentativas: number;
  proximaTentativaEm: number;
  ultimoErro: string | null;
  criadoEm: number;
};

export type LancamentoLocal = Lancamento & { syncStatus: StatusSincronizacao };

export type InstanciaCache = Instancia;

// Snapshot não-sensível da última sessão válida (mesmo formato que a API já
// expõe ao cliente — sem senha, sem token). Usado só pra decidir se o app
// pode abrir o shell offline num cold start; nunca substitui a checagem real
// contra o servidor assim que a rede volta.
export type SessaoLocal = { chave: "atual"; usuario: Usuario; atualizadoEm: number };

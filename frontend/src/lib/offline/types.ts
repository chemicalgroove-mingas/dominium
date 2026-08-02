import type { Instancia, Lancamento, TipoLancamento } from "@/lib/types";

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

ALTER TABLE "Lancamento" ADD COLUMN "valorMeta" DOUBLE PRECISION;
ALTER TABLE "Lancamento" ADD COLUMN "valorUltimaParcela" DOUBLE PRECISION;
ALTER TABLE "Lancamento" ADD CONSTRAINT "Lancamento_meta_check" CHECK (
  ("tipo" = 'temporario') OR ("valorMeta" IS NULL AND "valorUltimaParcela" IS NULL)
);

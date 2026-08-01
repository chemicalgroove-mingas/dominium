ALTER TABLE "Lancamento" ADD COLUMN "valorRendimento" DOUBLE PRECISION NOT NULL DEFAULT 0;

CREATE TABLE "ValorExtra" (
  "id" TEXT NOT NULL,
  "lancamentoId" TEXT NOT NULL,
  "valor" DOUBLE PRECISION NOT NULL,
  "descricao" TEXT,
  "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ValorExtra_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ValorExtra" ADD CONSTRAINT "ValorExtra_lancamentoId_fkey"
  FOREIGN KEY ("lancamentoId") REFERENCES "Lancamento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

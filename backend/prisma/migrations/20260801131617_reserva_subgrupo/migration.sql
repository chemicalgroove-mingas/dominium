-- Divide instancias de investimento em Reserva Pessoal e Reserva Patrimonial.
-- Mesma matematica de acumulo; so muda a intencao/rotulo do usuario.

ALTER TABLE "Instancia" ADD COLUMN "subgrupo" TEXT;

-- Instancias de investimento existentes viram Patrimonial por padrao.
UPDATE "Instancia" SET "subgrupo" = 'patrimonial' WHERE "grupo" = 'investimento' AND "subgrupo" IS NULL;

ALTER TABLE "Instancia" ADD CONSTRAINT "Instancia_subgrupo_check" CHECK (
  ("grupo" <> 'investimento' AND "subgrupo" IS NULL) OR
  ("grupo" = 'investimento' AND "subgrupo" IN ('pessoal', 'patrimonial'))
);

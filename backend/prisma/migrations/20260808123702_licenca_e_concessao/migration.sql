-- CreateTable
CREATE TABLE "Licenca" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "inicioEm" TIMESTAMP(3) NOT NULL,
    "expiraEm" TIMESTAMP(3) NOT NULL,
    "origem" TEXT NOT NULL,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Licenca_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConcessaoLicenca" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "dias" INTEGER NOT NULL,
    "origem" TEXT NOT NULL,
    "referenciaId" TEXT,
    "expiraEmAnterior" TIMESTAMP(3),
    "expiraEmNovo" TIMESTAMP(3) NOT NULL,
    "aplicadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConcessaoLicenca_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Licenca_usuarioId_key" ON "Licenca"("usuarioId");

-- CreateIndex
CREATE INDEX "Licenca_expiraEm_idx" ON "Licenca"("expiraEm");

-- CreateIndex
CREATE INDEX "ConcessaoLicenca_usuarioId_idx" ON "ConcessaoLicenca"("usuarioId");

-- AddForeignKey
ALTER TABLE "Licenca" ADD CONSTRAINT "Licenca_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConcessaoLicenca" ADD CONSTRAINT "ConcessaoLicenca_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CHECK constraints (mesmo padrao das migrations anteriores: String + CHECK,
-- nunca enum nativo — valores futuros como APPLE_IAP/GOOGLE_PLAY entram
-- alterando so a CHECK, sem migration de tipo).
ALTER TABLE "Licenca" ADD CONSTRAINT "Licenca_origem_check" CHECK (
  "origem" IN ('VOUCHER', 'PAGAMENTO', 'CORTESIA', 'MIGRACAO')
);

ALTER TABLE "ConcessaoLicenca" ADD CONSTRAINT "ConcessaoLicenca_dias_check" CHECK ("dias" > 0);
ALTER TABLE "ConcessaoLicenca" ADD CONSTRAINT "ConcessaoLicenca_origem_check" CHECK (
  "origem" IN ('VOUCHER', 'PAGAMENTO', 'CORTESIA', 'MIGRACAO')
);

-- ---------------------------------------------------------------------------
-- Backfill: toda conta viva (deletadoEm IS NULL) recebe licenca ate
-- 2027-12-31T23:59:59Z, origem MIGRACAO.
--
-- O admin tambem recebe, embora nunca toque rota financeira: assim nenhum
-- caminho do codigo precisa tratar "usuario sem licenca" como caso especial.
--
-- Idempotente por construcao: o NOT EXISTS faz a re-execucao virar no-op, e a
-- ConcessaoLicenca correspondente so e inserida para as licencas que este
-- backfill acabou de criar (subquery pelo mesmo criterio), pra nunca duplicar
-- historico numa segunda passagem.
--
-- gen_random_uuid() vem do pgcrypto, ja instalado no banco de producao (ver
-- AUDITORIA_FASE0.md, parte 4.1); no Postgres 13+ e builtin.
-- ---------------------------------------------------------------------------
INSERT INTO "Licenca" ("id", "usuarioId", "inicioEm", "expiraEm", "origem", "atualizadoEm", "criadoEm")
SELECT
  gen_random_uuid()::text,
  u."id",
  u."criadoEm",
  TIMESTAMP '2027-12-31 23:59:59',
  'MIGRACAO',
  (now() AT TIME ZONE 'UTC'),
  (now() AT TIME ZONE 'UTC')
FROM "Usuario" u
WHERE u."deletadoEm" IS NULL
  AND NOT EXISTS (SELECT 1 FROM "Licenca" l WHERE l."usuarioId" = u."id");

INSERT INTO "ConcessaoLicenca" ("id", "usuarioId", "dias", "origem", "referenciaId", "expiraEmAnterior", "expiraEmNovo", "aplicadaEm")
SELECT
  gen_random_uuid()::text,
  l."usuarioId",
  -- dias efetivamente concedidos, contados de inicioEm ate a nova validade.
  -- CHECK exige > 0; GREATEST protege o caso limite de uma conta criada
  -- depois de 2027-12-31 (impossivel hoje, mas a constraint e' quem manda).
  GREATEST(1, CEIL(EXTRACT(EPOCH FROM (l."expiraEm" - l."inicioEm")) / 86400)::int),
  'MIGRACAO',
  NULL,
  NULL,
  l."expiraEm",
  (now() AT TIME ZONE 'UTC')
FROM "Licenca" l
WHERE l."origem" = 'MIGRACAO'
  AND NOT EXISTS (
    SELECT 1 FROM "ConcessaoLicenca" c
    WHERE c."usuarioId" = l."usuarioId" AND c."origem" = 'MIGRACAO'
  );

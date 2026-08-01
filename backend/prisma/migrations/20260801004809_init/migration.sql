-- CreateTable
CREATE TABLE "Usuario" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "login" TEXT NOT NULL,
    "senha" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'USER',
    "status" TEXT NOT NULL DEFAULT 'ATIVO',
    "deveTrocarSenha" BOOLEAN NOT NULL DEFAULT false,
    "ultimoLogin" TIMESTAMP(3),
    "deletadoEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Voucher" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ATIVO',
    "usuarioId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "utilizadoEm" TIMESTAMP(3),
    "expiraEm" TIMESTAMP(3),
    "criadoPor" TEXT,
    "observacao" TEXT,

    CONSTRAINT "Voucher_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Instancia" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "grupo" TEXT NOT NULL,
    "cor" TEXT NOT NULL,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Instancia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lancamento" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "instanciaId" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "valor" DOUBLE PRECISION NOT NULL,
    "tipo" TEXT NOT NULL,
    "parcelas" INTEGER,
    "mesInicio" TEXT NOT NULL,
    "mesFim" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "observacoes" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Lancamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pagamento" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "instanciaId" TEXT NOT NULL,
    "lancamentoId" TEXT,
    "mesReferencia" TEXT NOT NULL,
    "valorPago" DOUBLE PRECISION NOT NULL,
    "tipo" TEXT NOT NULL,
    "observacoes" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Pagamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Investimento" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "instanciaId" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "valor" DOUBLE PRECISION NOT NULL,
    "observacoes" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Investimento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_login_key" ON "Usuario"("login");

-- CreateIndex
CREATE UNIQUE INDEX "Voucher_codigo_key" ON "Voucher"("codigo");

-- AddForeignKey
ALTER TABLE "Voucher" ADD CONSTRAINT "Voucher_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Instancia" ADD CONSTRAINT "Instancia_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lancamento" ADD CONSTRAINT "Lancamento_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lancamento" ADD CONSTRAINT "Lancamento_instanciaId_fkey" FOREIGN KEY ("instanciaId") REFERENCES "Instancia"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pagamento" ADD CONSTRAINT "Pagamento_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pagamento" ADD CONSTRAINT "Pagamento_instanciaId_fkey" FOREIGN KEY ("instanciaId") REFERENCES "Instancia"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pagamento" ADD CONSTRAINT "Pagamento_lancamentoId_fkey" FOREIGN KEY ("lancamentoId") REFERENCES "Lancamento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Investimento" ADD CONSTRAINT "Investimento_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Investimento" ADD CONSTRAINT "Investimento_instanciaId_fkey" FOREIGN KEY ("instanciaId") REFERENCES "Instancia"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CHECK constraints (mesmo padrao usado nas migrations anteriores em SQLite)
ALTER TABLE "Usuario" ADD CONSTRAINT "Usuario_role_check" CHECK ("role" IN ('USER', 'ADMIN'));
ALTER TABLE "Usuario" ADD CONSTRAINT "Usuario_status_check" CHECK ("status" IN ('ATIVO', 'INATIVO'));

ALTER TABLE "Voucher" ADD CONSTRAINT "Voucher_status_check" CHECK ("status" IN ('ATIVO', 'USADO', 'REVOGADO', 'EXPIRADO'));

ALTER TABLE "Instancia" ADD CONSTRAINT "Instancia_grupo_check" CHECK ("grupo" IN ('gasto', 'receita', 'investimento'));

ALTER TABLE "Lancamento" ADD CONSTRAINT "Lancamento_valor_check" CHECK ("valor" > 0);
ALTER TABLE "Lancamento" ADD CONSTRAINT "Lancamento_tipo_check" CHECK ("tipo" IN ('fixo', 'temporario'));
ALTER TABLE "Lancamento" ADD CONSTRAINT "Lancamento_parcelas_check" CHECK (
    ("tipo" = 'temporario' AND "parcelas" >= 1) OR ("tipo" = 'fixo' AND "parcelas" IS NULL)
);

ALTER TABLE "Pagamento" ADD CONSTRAINT "Pagamento_valorPago_check" CHECK ("valorPago" > 0);
ALTER TABLE "Pagamento" ADD CONSTRAINT "Pagamento_tipo_check" CHECK ("tipo" IN ('total', 'selecionado', 'parcial', 'avulso'));

ALTER TABLE "Investimento" ADD CONSTRAINT "Investimento_valor_check" CHECK ("valor" != 0);

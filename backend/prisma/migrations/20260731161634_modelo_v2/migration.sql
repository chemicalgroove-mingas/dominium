-- CreateTable
CREATE TABLE "Usuario" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nome" TEXT NOT NULL,
    "cpf" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerificado" BOOLEAN NOT NULL DEFAULT false,
    "senha" TEXT NOT NULL,
    "resetToken" TEXT,
    "resetTokenExpiracao" DATETIME,
    "criadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Instancia" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "usuarioId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "grupo" TEXT NOT NULL,
    "cor" TEXT NOT NULL,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Instancia_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Instancia_grupo_check" CHECK ("grupo" IN ('gasto', 'receita', 'investimento'))
);

-- CreateTable
CREATE TABLE "Lancamento" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "usuarioId" TEXT NOT NULL,
    "instanciaId" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "valor" REAL NOT NULL,
    "tipo" TEXT NOT NULL,
    "parcelas" INTEGER,
    "mesInicio" TEXT NOT NULL,
    "mesFim" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "observacoes" TEXT,
    "criadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Lancamento_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Lancamento_instanciaId_fkey" FOREIGN KEY ("instanciaId") REFERENCES "Instancia" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Lancamento_valor_check" CHECK ("valor" > 0),
    CONSTRAINT "Lancamento_tipo_check" CHECK ("tipo" IN ('fixo', 'temporario')),
    CONSTRAINT "Lancamento_parcelas_check" CHECK (
        ("tipo" = 'temporario' AND "parcelas" >= 1) OR ("tipo" = 'fixo' AND "parcelas" IS NULL)
    )
);

-- CreateTable
CREATE TABLE "Pagamento" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "usuarioId" TEXT NOT NULL,
    "instanciaId" TEXT NOT NULL,
    "lancamentoId" TEXT,
    "mesReferencia" TEXT NOT NULL,
    "valorPago" REAL NOT NULL,
    "tipo" TEXT NOT NULL,
    "observacoes" TEXT,
    "criadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Pagamento_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Pagamento_instanciaId_fkey" FOREIGN KEY ("instanciaId") REFERENCES "Instancia" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Pagamento_lancamentoId_fkey" FOREIGN KEY ("lancamentoId") REFERENCES "Lancamento" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Pagamento_valorPago_check" CHECK ("valorPago" > 0),
    CONSTRAINT "Pagamento_tipo_check" CHECK ("tipo" IN ('total', 'selecionado', 'parcial', 'avulso'))
);

-- CreateTable
CREATE TABLE "Investimento" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "usuarioId" TEXT NOT NULL,
    "instanciaId" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "valor" REAL NOT NULL,
    "observacoes" TEXT,
    "criadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Investimento_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Investimento_instanciaId_fkey" FOREIGN KEY ("instanciaId") REFERENCES "Instancia" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Investimento_valor_check" CHECK ("valor" != 0)
);

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_cpf_key" ON "Usuario"("cpf");

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_email_key" ON "Usuario"("email");

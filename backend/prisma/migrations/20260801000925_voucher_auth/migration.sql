-- Substitui autenticacao por e-mail/CPF por autenticacao por voucher (login + senha).
-- Usuarios existentes recebem um login derivado do nome (unico caso haja colisao).

PRAGMA foreign_keys=OFF;

-- 1. Recriar Usuario com o novo formato de credenciais
CREATE TABLE "new_Usuario" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nome" TEXT NOT NULL,
    "login" TEXT NOT NULL,
    "senha" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'USER',
    "status" TEXT NOT NULL DEFAULT 'ATIVO',
    "deveTrocarSenha" BOOLEAN NOT NULL DEFAULT false,
    "ultimoLogin" DATETIME,
    "deletadoEm" DATETIME,
    "criadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" DATETIME NOT NULL,
    CONSTRAINT "Usuario_role_check" CHECK ("role" IN ('USER', 'ADMIN')),
    CONSTRAINT "Usuario_status_check" CHECK ("status" IN ('ATIVO', 'INATIVO'))
);

-- Login derivado do nome (minusculo, sem espaco nas pontas). Sufixo com pedaco do id
-- para garantir unicidade em caso de nomes repetidos entre as poucas contas antigas.
INSERT INTO "new_Usuario" ("id", "nome", "login", "senha", "role", "status", "deveTrocarSenha", "criadoEm", "atualizadoEm")
SELECT
  "id",
  "nome",
  lower(trim("nome")) || '-' || substr(lower(replace("id", '-', '')), 1, 4),
  "senha",
  'USER',
  'ATIVO',
  false,
  "criadoEm",
  "atualizadoEm"
FROM "Usuario";

DROP TABLE "Usuario";
ALTER TABLE "new_Usuario" RENAME TO "Usuario";
CREATE UNIQUE INDEX "Usuario_login_key" ON "Usuario"("login");

-- 2. Tabela de vouchers
CREATE TABLE "Voucher" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "codigo" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ATIVO',
    "usuarioId" TEXT,
    "criadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "utilizadoEm" DATETIME,
    "expiraEm" DATETIME,
    "criadoPor" TEXT,
    "observacao" TEXT,
    CONSTRAINT "Voucher_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Voucher_status_check" CHECK ("status" IN ('ATIVO', 'USADO', 'REVOGADO', 'EXPIRADO'))
);
CREATE UNIQUE INDEX "Voucher_codigo_key" ON "Voucher"("codigo");

PRAGMA foreign_keys=ON;

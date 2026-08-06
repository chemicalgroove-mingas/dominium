-- CreateTable
CREATE TABLE "OrdenacaoInstancia" (
    "id" TEXT NOT NULL,
    "instanciaId" TEXT NOT NULL,
    "contexto" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrdenacaoInstancia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrdenacaoInstancia_instanciaId_contexto_key" ON "OrdenacaoInstancia"("instanciaId", "contexto");

-- AddForeignKey
ALTER TABLE "OrdenacaoInstancia" ADD CONSTRAINT "OrdenacaoInstancia_instanciaId_fkey" FOREIGN KEY ("instanciaId") REFERENCES "Instancia"("id") ON DELETE CASCADE ON UPDATE CASCADE;

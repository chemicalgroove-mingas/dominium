// Popula OrdenacaoInstancia para instancias que ainda nao tem linha num
// contexto que lhes cabe (por grupo). Idempotente: so cria o que falta, nunca
// sobrescreve uma ordem ja existente (preserva reordenacao manual feita via
// drag-and-drop depois que essa feature existir). Roda manualmente:
//   node prisma/backfillOrdenacaoInstancia.js
require('dotenv').config();
const prisma = require('../src/lib/prisma');
const { CONTEXTOS_POR_GRUPO } = require('../src/utils/ordenacaoInstancia');

async function main() {
  const instancias = await prisma.instancia.findMany({
    orderBy: { criadoEm: 'asc' },
    include: { ordenacoes: true },
  });

  const proximaOrdemPorContexto = new Map();
  async function proximaOrdem(usuarioId, contexto) {
    const chave = `${usuarioId}:${contexto}`;
    if (!proximaOrdemPorContexto.has(chave)) {
      const max = await prisma.ordenacaoInstancia.aggregate({
        where: { contexto, instancia: { usuarioId } },
        _max: { ordem: true },
      });
      proximaOrdemPorContexto.set(chave, (max._max.ordem ?? -1) + 1);
    }
    const ordem = proximaOrdemPorContexto.get(chave);
    proximaOrdemPorContexto.set(chave, ordem + 1);
    return ordem;
  }

  let criadas = 0;
  for (const instancia of instancias) {
    const contextos = CONTEXTOS_POR_GRUPO[instancia.grupo] || [];
    const existentes = new Set(instancia.ordenacoes.map((o) => o.contexto));
    for (const contexto of contextos) {
      if (existentes.has(contexto)) continue;
      const ordem = await proximaOrdem(instancia.usuarioId, contexto);
      await prisma.ordenacaoInstancia.create({
        data: { instanciaId: instancia.id, contexto, ordem },
      });
      criadas += 1;
    }
  }

  console.log(`Backfill concluido: ${criadas} linha(s) de OrdenacaoInstancia criada(s).`);
}

main()
  .catch((erro) => {
    console.error(erro);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

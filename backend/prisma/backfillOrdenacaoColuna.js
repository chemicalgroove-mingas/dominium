// Distribui as instâncias de cada (usuário, contexto) em duas colunas —
// mesma convenção do masonry do frontend (ColunasMasonry/
// calcularInsercaoMasonry): metade arredondando pra CIMA vai pra coluna 0
// (esquerda), o resto pra coluna 1 (direita), na ordem atual do campo
// `ordem` (que até aqui era a posição global no contexto). `ordem` é
// renumerado a partir de 0 dentro de cada coluna.
//
// Idempotente: por contexto, se QUALQUER linha já tem coluna=1, esse
// contexto é pulado inteiro (já foi distribuído antes — rodar nele de novo
// re-derivaria a divisão a partir de um `ordem` que não é mais a sequência
// global original, e poderia embaralhar uma reordenação manual já feita
// pelo usuário no drag). Só re-distribui contextos que a migration acabou
// de deixar com todo mundo em coluna=0 (o default).
//
// Exceção conhecida: um contexto com exatamente 1 instância nunca ganha
// nenhuma linha coluna=1 (a segunda metade fica vazia), então o check de
// idempotência não teria como "ver" que ele já rodou — rodar de novo nesse
// caso é inofensivo (resultado idêntico: a única instância sempre volta pra
// coluna 0, ordem 0), só não é pulado via short-circuit.
//
// Roda manualmente: node prisma/backfillOrdenacaoColuna.js
require('dotenv').config();
const prisma = require('../src/lib/prisma');

async function main() {
  const linhas = await prisma.ordenacaoInstancia.findMany({
    include: { instancia: { select: { usuarioId: true } } },
    orderBy: { ordem: 'asc' },
  });

  const porContexto = new Map();
  for (const linha of linhas) {
    const chave = `${linha.instancia.usuarioId}:${linha.contexto}`;
    if (!porContexto.has(chave)) porContexto.set(chave, []);
    porContexto.get(chave).push(linha);
  }

  let contextosDistribuidos = 0;
  let linhasAtualizadas = 0;

  for (const [chave, linhasDoContexto] of porContexto) {
    if (linhasDoContexto.some((l) => l.coluna === 1)) continue; // já distribuído

    const meio = Math.ceil(linhasDoContexto.length / 2);
    const colunaEsquerda = linhasDoContexto.slice(0, meio);
    const colunaDireita = linhasDoContexto.slice(meio);

    await prisma.$transaction([
      ...colunaEsquerda.map((linha, ordem) =>
        prisma.ordenacaoInstancia.update({ where: { id: linha.id }, data: { coluna: 0, ordem } })
      ),
      ...colunaDireita.map((linha, ordem) =>
        prisma.ordenacaoInstancia.update({ where: { id: linha.id }, data: { coluna: 1, ordem } })
      ),
    ]);

    contextosDistribuidos += 1;
    linhasAtualizadas += linhasDoContexto.length;
    console.log(
      `  ${chave}: ${linhasDoContexto.length} instâncias -> coluna 0 (${colunaEsquerda.length}), coluna 1 (${colunaDireita.length})`
    );
  }

  console.log(
    `Backfill concluído: ${contextosDistribuidos} contexto(s) distribuído(s), ${linhasAtualizadas} linha(s) atualizada(s).`
  );
}

main()
  .catch((erro) => {
    console.error(erro);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

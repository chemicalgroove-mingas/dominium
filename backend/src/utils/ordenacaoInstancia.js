// contextos fixos e conhecidos (nao dinamicos) — ver OrdenacaoInstancia no schema.
const CONTEXTOS = ['lancamentos-gasto', 'lancamentos-receita', 'pagamentos', 'reserva'];

// contexto "principal" de cada grupo — usado pra ordenar a listagem generica
// GET /api/instancias (que mistura os grupos e e consumida pela tela de
// Lancamentos).
const CONTEXTO_POR_GRUPO = {
  gasto: 'lancamentos-gasto',
  receita: 'lancamentos-receita',
  investimento: 'reserva',
};

// todos os contextos aos quais uma instancia do grupo pertence — usado no
// backfill e ao criar uma instancia nova (gasto aparece em Lancamentos E em
// Pagamentos, por isso e o unico grupo com 2 contextos).
const CONTEXTOS_POR_GRUPO = {
  gasto: ['lancamentos-gasto', 'pagamentos'],
  receita: ['lancamentos-receita'],
  investimento: ['reserva'],
};

// Cria, para uma instancia recem-criada, uma linha de OrdenacaoInstancia em
// cada contexto ao qual seu grupo pertence — vai pra coluna com MENOS itens
// (empate -> coluna 0), sempre no final dela (maior ordem + 1 nessa coluna
// entre as instancias do mesmo usuario naquele contexto). Mantem as duas
// colunas equilibradas conforme instancias vao sendo criadas.
async function criarOrdenacoesIniciais(prisma, instancia) {
  const contextos = CONTEXTOS_POR_GRUPO[instancia.grupo] || [];
  for (const contexto of contextos) {
    const [contagemEsquerda, contagemDireita] = await Promise.all([
      prisma.ordenacaoInstancia.count({
        where: { contexto, coluna: 0, instancia: { usuarioId: instancia.usuarioId } },
      }),
      prisma.ordenacaoInstancia.count({
        where: { contexto, coluna: 1, instancia: { usuarioId: instancia.usuarioId } },
      }),
    ]);
    const coluna = contagemDireita < contagemEsquerda ? 1 : 0;

    const max = await prisma.ordenacaoInstancia.aggregate({
      where: { contexto, coluna, instancia: { usuarioId: instancia.usuarioId } },
      _max: { ordem: true },
    });
    await prisma.ordenacaoInstancia.create({
      data: { instanciaId: instancia.id, contexto, coluna, ordem: (max._max.ordem ?? -1) + 1 },
    });
  }
}

// Ordena uma lista de Instancia (cada uma com `.ordenacoes` pre-carregado via
// include) por (coluna, ordem) do contexto informado por `contextoDe` —
// coluna 0 (esquerda) inteira antes da coluna 1 (direita), ordem crescente
// dentro de cada uma. Instancia sem linha em OrdenacaoInstancia (nunca
// reordenada, ou criada antes do backfill) cai no fim, na ordem em que já
// estava (fallback = criadoEm asc, que e o orderBy de base de cada query
// chamadora).
function ordenarPorContexto(instancias, contextoDe) {
  return [...instancias].sort((a, b) => {
    const contextoA = typeof contextoDe === 'function' ? contextoDe(a) : contextoDe;
    const contextoB = typeof contextoDe === 'function' ? contextoDe(b) : contextoDe;
    const ordA = a.ordenacoes?.find((o) => o.contexto === contextoA);
    const ordB = b.ordenacoes?.find((o) => o.contexto === contextoB);
    if (ordA && ordB) {
      if (ordA.coluna !== ordB.coluna) return ordA.coluna - ordB.coluna;
      return ordA.ordem - ordB.ordem;
    }
    if (ordA) return -1;
    if (ordB) return 1;
    return 0;
  });
}

// Extrai a coluna (0 ou 1) de uma instancia num contexto — usado pra expor
// `coluna` na resposta da API, pra a UI (Etapa 2) agrupar sem precisar
// recalcular nada. Fallback pra 0 se a linha nao existir (mesmo caso do
// fallback de ordenarPorContexto).
function colunaDoContexto(instancia, contexto) {
  return instancia.ordenacoes?.find((o) => o.contexto === contexto)?.coluna ?? 0;
}

module.exports = {
  CONTEXTOS,
  CONTEXTO_POR_GRUPO,
  CONTEXTOS_POR_GRUPO,
  ordenarPorContexto,
  colunaDoContexto,
  criarOrdenacoesIniciais,
};

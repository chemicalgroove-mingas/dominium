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
// cada contexto ao qual seu grupo pertence, sempre no final (maior ordem + 1
// entre as instancias do mesmo usuario naquele contexto).
async function criarOrdenacoesIniciais(prisma, instancia) {
  const contextos = CONTEXTOS_POR_GRUPO[instancia.grupo] || [];
  for (const contexto of contextos) {
    const max = await prisma.ordenacaoInstancia.aggregate({
      where: { contexto, instancia: { usuarioId: instancia.usuarioId } },
      _max: { ordem: true },
    });
    await prisma.ordenacaoInstancia.create({
      data: { instanciaId: instancia.id, contexto, ordem: (max._max.ordem ?? -1) + 1 },
    });
  }
}

// Ordena uma lista de Instancia (cada uma com `.ordenacoes` pre-carregado via
// include) pela ordem manual do contexto informado por `contextoDe`. Instancia
// sem linha em OrdenacaoInstancia (nunca reordenada, ou criada antes do
// backfill) cai no fim, na ordem em que já estava (fallback = criadoEm asc,
// que e o orderBy de base de cada query chamadora).
function ordenarPorContexto(instancias, contextoDe) {
  return [...instancias].sort((a, b) => {
    const contextoA = typeof contextoDe === 'function' ? contextoDe(a) : contextoDe;
    const contextoB = typeof contextoDe === 'function' ? contextoDe(b) : contextoDe;
    const ordemA = a.ordenacoes?.find((o) => o.contexto === contextoA)?.ordem;
    const ordemB = b.ordenacoes?.find((o) => o.contexto === contextoB)?.ordem;
    if (ordemA != null && ordemB != null) return ordemA - ordemB;
    if (ordemA != null) return -1;
    if (ordemB != null) return 1;
    return 0;
  });
}

module.exports = { CONTEXTOS, CONTEXTO_POR_GRUPO, CONTEXTOS_POR_GRUPO, ordenarPorContexto, criarOrdenacoesIniciais };

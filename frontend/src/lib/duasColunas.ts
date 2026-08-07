// Duas colunas INDEPENDENTES por contexto (Etapa 2) — cada uma é uma lista
// 1D pura, sem o acoplamento de capacidade fixa (Math.ceil(n/2)) do modelo
// anterior de sequência única dobrada. Isso elimina a classe inteira de bugs
// da tentativa anterior (fronteira ambígua, card entrando na coluna errada
// ao cruzar): aqui, mover um card pra outra coluna é só "tira de uma lista,
// põe na outra", sem nenhum item terceiro sendo deslocado como efeito
// colateral.

export function agruparPorColuna<T extends { coluna: number }>(itens: T[]): [T[], T[]] {
  // `itens` já vem ordenado por (coluna, ordem) do backend — o filter
  // preserva essa ordem relativa dentro de cada coluna.
  return [itens.filter((i) => i.coluna === 0), itens.filter((i) => i.coluna === 1)];
}

// Mobile: as duas colunas colapsam numa lista só, intercalada como baralho
// sendo embaralhado — c0[0], c1[0], c0[1], c1[1], ... — continuando só com
// a coluna que sobrar quando a outra acabar.
export function mesclarParaMobile<T>(coluna0: T[], coluna1: T[]): T[] {
  const mesclado: T[] = [];
  const max = Math.max(coluna0.length, coluna1.length);
  for (let i = 0; i < max; i++) {
    if (i < coluna0.length) mesclado.push(coluna0[i]);
    if (i < coluna1.length) mesclado.push(coluna1[i]);
  }
  return mesclado;
}

// Inverso: separa a lista mesclada de volta em duas colunas por paridade de
// posição (par -> coluna 0, ímpar -> coluna 1). É o inverso exato de
// mesclarParaMobile SE coluna0.length >= coluna1.length (o caso normal,
// garantido pelo backfill e por criarOrdenacoesIniciais no backend — toda
// instância nova vai pra coluna com menos itens, nunca deixando a direita
// maior que a esquerda por mais que uma criação de cada vez). Se o usuário
// arrastou tanto no desktop a ponto de inverter esse equilíbrio (coluna 1
// maior que a coluna 0) ANTES de reordenar no mobile, o round-trip não é
// mais perfeito — mas o resultado continua determinístico e válido (nunca
// perde ou duplica item, só pode reclassificar um item de coluna), e passa
// a rebalancear coluna 0 >= coluna 1 dali em diante. Comportamento aceito
// explicitamente: reordenar no mobile é consistente, não precisa ser
// "esperto" sobre de qual coluna cada item veio originalmente.
export function desmesclarDeMobile<T>(mesclado: T[]): [T[], T[]] {
  const coluna0: T[] = [];
  const coluna1: T[] = [];
  mesclado.forEach((item, i) => (i % 2 === 0 ? coluna0 : coluna1).push(item));
  return [coluna0, coluna1];
}

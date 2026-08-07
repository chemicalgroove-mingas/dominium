// Fonte única de conversão posição-de-arraste -> índice de inserção do
// masonry de 2 colunas. Tanto a barra guia (ColunasMasonry, decide ONDE
// desenhar) quanto a inserção real (useOrdenacaoArrastavel/onDragEnd,
// decide onde o card cai no arrayMove) partem do MESMO resultado de
// `calcularInsercaoMasonry` — nunca duas contas separadas que podem
// divergir.
//
// A distribuição é sempre: esquerda recebe a primeira metade da sequência
// (índices 0..meio-1), direita a continuação (meio..fim). `meio` é
// Math.ceil(total/2).
export type ColunaMasonry = "esquerda" | "direita";

export function metadeMasonry(totalItens: number): number {
  return Math.ceil(totalItens / 2);
}

function indiceGlobalMasonry(coluna: ColunaMasonry, posicaoLocal: number, meio: number): number {
  return coluna === "esquerda" ? posicaoLocal : meio + posicaoLocal;
}

export type ResultadoInsercaoMasonry = {
  // onde a barra guia deve aparecer: dentro de `coluna`, na posição
  // `posicaoLocal` — contando só os OUTROS cards dessa coluna (o item
  // ativo, se estiver nela, não conta pra essa posição local).
  coluna: ColunaMasonry;
  posicaoLocal: number;
  // índice já pronto pro arrayMove (ver onDragEnd).
  indiceFinal: number;
};

// `itensIds`: sequência 1D completa (ids), na ordem atual. `idAtivo`: item
// sendo arrastado. `colunaAlvo`: decidida pelo X do ponteiro (ver
// colisaoPorIndice em useOrdenacaoArrastavel — SEMPRE decidir a coluna
// pelo X antes de procurar posição por Y, nunca misturar os dois numa
// distância 2D só). `idReferencia`/`antes`: o card mais próximo dentro de
// colunaAlvo (por Y) e se a inserção é antes ou depois dele; null quando
// colunaAlvo não tem nenhum outro card (só o ativo estava lá).
//
// Por que não é só "meio + posicaoLocal" sempre: cada coluna tem
// capacidade FIXA (Math.ceil/floor do total) — inserir um item vindo de
// fora sempre desloca exatamente um item da fronteira pra coluna vizinha
// (não há como um item "só" entrar sem esse deslocamento, dado que o total
// de itens não muda). Pra posições NO MEIO de uma coluna (não nas pontas),
// a posição correta é simplesmente "onde esse card ficaria dentre todos os
// outros cards, ignorando o ativo" — daí usar a posição dentro de `outros`
// diretamente. Só nos dois EXTREMOS de uma coluna (a própria ponta de
// cima ou de baixo), ao cruzar de uma coluna pra outra, é que precisa
// forçar a entrada real na coluna alvo (senão o card fica "preso" na
// coluna de origem em vez de cruzar pra onde a barra mostrou) — validado
// numericamente (Node, fora do React) contra 13 cenários antes de aplicar,
// incluindo listas de 5 e 7 itens, coluna com um único item, e o caso
// original do bug (colunas de altura muito desigual).
export function calcularInsercaoMasonry(
  itensIds: string[],
  idAtivo: string,
  colunaAlvo: ColunaMasonry,
  idReferencia: string | null,
  antes: boolean
): ResultadoInsercaoMasonry {
  const meio = metadeMasonry(itensIds.length);
  const colunaDoId = (id: string): ColunaMasonry => (itensIds.indexOf(id) < meio ? "esquerda" : "direita");
  const itensDaColuna = itensIds.filter((id) => id !== idAtivo && colunaDoId(id) === colunaAlvo);

  if (idReferencia == null) {
    return { coluna: colunaAlvo, posicaoLocal: 0, indiceFinal: indiceGlobalMasonry(colunaAlvo, 0, meio) };
  }

  const idxLocal = itensDaColuna.indexOf(idReferencia);
  const posicaoLocal = antes ? idxLocal : idxLocal + 1;
  const noExtremo = posicaoLocal === 0 || posicaoLocal === itensDaColuna.length;
  const cruzandoColuna = colunaDoId(idAtivo) !== colunaAlvo;

  let indiceFinal: number;
  if (cruzandoColuna && noExtremo) {
    indiceFinal = indiceGlobalMasonry(colunaAlvo, posicaoLocal, meio);
  } else {
    const outros = itensIds.filter((id) => id !== idAtivo);
    const idxOutros = outros.indexOf(idReferencia);
    indiceFinal = antes ? idxOutros : idxOutros + 1;
  }

  return { coluna: colunaAlvo, posicaoLocal, indiceFinal };
}

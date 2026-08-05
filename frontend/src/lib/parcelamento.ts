// Espelha backend/src/utils/parcelamento.js (calcularPlanoTemporario, ramo
// "prazoMeses") só para a prévia exibida antes do envio — o valor
// efetivamente persistido sempre vem do backend, que roda a mesma função.
// Mesma técnica de centavos inteiros pra evitar erro de ponto flutuante
// (520.18/2 em float puro dá 260.08999999999997, não 260.09).
export function calcularPlanoTemporarioPreview(valorMeta: number, prazoMeses: number) {
  const centavosMeta = Math.round(valorMeta * 100);
  const centavosParcela = Math.floor(centavosMeta / prazoMeses);
  const valorParcela = centavosParcela / 100;
  const centavosUltima = centavosMeta - centavosParcela * (prazoMeses - 1);
  const valorUltimaParcela = centavosUltima === centavosParcela ? null : centavosUltima / 100;
  return { parcelas: prazoMeses, valorParcela, valorUltimaParcela };
}

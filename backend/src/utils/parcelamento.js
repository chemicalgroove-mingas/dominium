// Diferenca minima pra considerar dois valores monetarios "iguais" apos
// arredondamento de centavos (erro de ponto flutuante) — usado por chamadores
// que comparam valores monetarios fora desta funcao (ex.: investimentos.js).
const EPS = 0.005;

// Calcula o plano de parcelas de um total a partir de um dos dois parametros
// (valor da parcela ou prazo em meses). A ultima parcela absorve o resto da
// divisao (residuo de centavos), podendo ficar diferente das demais.
// Fonte unica dessa conversao — usada tanto por Investimentos (projeto com
// meta) quanto por Lancamentos (toggle Total/Parcela), pra nunca divergir.
//
// Opera em centavos inteiros (nao em EPS sobre float) pra evitar o erro de
// arredondamento de ponto flutuante: 520.18/2 em float puro produz
// 260.08999999999997, que Math.floor(...*100)/100 arredondava pra baixo
// (260.08 + 260.10, residuo artificial numa divisao que devia ser exata,
// 260.09 + 260.09). Convertendo pra centavos com Math.round antes de
// dividir, a divisao exata fica exata.
function calcularPlanoTemporario({ valorMeta, valor, prazoMeses }) {
  const parcelas = valor ? Math.ceil(valorMeta / valor) : prazoMeses;
  const centavosMeta = Math.round(valorMeta * 100);
  const centavosParcela = valor != null ? Math.round(valor * 100) : Math.floor(centavosMeta / parcelas);
  const valorParcela = centavosParcela / 100;
  const centavosUltima = centavosMeta - centavosParcela * (parcelas - 1);
  const valorUltimaParcela = centavosUltima === centavosParcela ? null : centavosUltima / 100;
  return { parcelas, valorParcela, valorUltimaParcela };
}

module.exports = {
  EPS,
  calcularPlanoTemporario,
};

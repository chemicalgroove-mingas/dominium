const { somarMeses, diferencaEmMeses, compararMeses, maiorMes, menorMes } = require('./mes');

const JANELAS = { mes: 1, '3m': 3, '6m': 6, '12m': 12 };

function janelaValida(chave) {
  return Object.prototype.hasOwnProperty.call(JANELAS, chave);
}

// Retorna [inicio, fim] (inclusive) da janela a partir de um mes de referencia.
function limitesJanela(mesReferencia, janela) {
  const meses = JANELAS[janela] || JANELAS.mes;
  return [mesReferencia, somarMeses(mesReferencia, meses - 1)];
}

// Quanto um lancamento contribui dentro de uma janela [janelaInicio, janelaFim],
// considerando seu proprio periodo de vigencia (mesInicio..mesFim para temporario,
// mesInicio..infinito para fixo). Calculo por competencia (calendario), nao por pagamento.
function projetarLancamentoNaJanela(lancamento, janelaInicio, janelaFim) {
  if (!lancamento.ativo) return { meses: 0, total: 0 };

  const inicioEfetivo = maiorMes(lancamento.mesInicio, janelaInicio);
  const fimEfetivo = lancamento.tipo === 'fixo' ? janelaFim : menorMes(lancamento.mesFim, janelaFim);

  if (compararMeses(inicioEfetivo, fimEfetivo) > 0) {
    return { meses: 0, total: 0 };
  }

  const meses = diferencaEmMeses(inicioEfetivo, fimEfetivo) + 1;
  return { meses, total: meses * lancamento.valor };
}

function projetarLancamentos(lancamentos, mesReferencia, janela) {
  const [inicio, fim] = limitesJanela(mesReferencia, janela);
  return lancamentos.reduce((acc, l) => acc + projetarLancamentoNaJanela(l, inicio, fim).total, 0);
}

module.exports = { JANELAS, janelaValida, limitesJanela, projetarLancamentoNaJanela, projetarLancamentos };

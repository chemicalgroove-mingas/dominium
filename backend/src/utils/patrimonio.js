const { mesAtual, compararMeses } = require('./mes');
const { projetarLancamentoNaJanela } = require('./projecao');

// Valor ja acumulado de um aporte (lancamento de uma instancia de investimento):
// soma o que decorreu desde o mes de inicio do aporte ate o mes atual. Fixo
// (aporte automatico) conta indefinidamente; temporario para no mesFim.
function valorAcumuladoAporte(lancamento) {
  return projetarLancamentoNaJanela(lancamento, lancamento.mesInicio, mesAtual()).total;
}

// Quantas parcelas ja decorreram (mes de inicio ate o mes atual, limitado ao mesFim).
function parcelasDecorridas(lancamento) {
  return projetarLancamentoNaJanela(lancamento, lancamento.mesInicio, mesAtual()).meses;
}

// Meta batida: so se aplica a aportes temporarios (tem prazo definido). A partir
// do mes seguinte ao mesFim, a parcela para de ser contada como despesa.
function metaBatida(lancamento) {
  if (lancamento.tipo !== 'temporario' || !lancamento.mesFim) return false;
  return compararMeses(mesAtual(), lancamento.mesFim) > 0;
}

module.exports = { valorAcumuladoAporte, parcelasDecorridas, metaBatida };

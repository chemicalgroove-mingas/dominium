const { mesAtual, compararMeses } = require('./mes');
const { projetarLancamentoNaJanela, valoresPorParcela } = require('./projecao');

// Valor ja acumulado de um aporte (lancamento de uma instancia de investimento):
// soma o que decorreu desde o mes de inicio do aporte ate o mes atual. Fixo
// (aporte automatico) conta indefinidamente; temporario para no mesFim.
//
// Quando ha abatimento antecipado (valorAbatido), esse valor ja entrou "agora" —
// as parcelas futuras (do fim pra tras) so refletem a reducao quando o calendario
// chegar nelas. Somar valorAbatido aqui reconhece a contribuicao imediatamente,
// sem contar em dobro: a soma de todas as parcelas (decorridas + futuras) do
// lancamento inteiro sempre fecha em valorMeta, abatido incluso.
function valorAcumuladoAporte(lancamento) {
  const base = projetarLancamentoNaJanela(lancamento, lancamento.mesInicio, mesAtual()).total;
  if (lancamento.tipo !== 'temporario') return base;
  const extra = (lancamento.valorAbatido || 0) + (lancamento.valorBaseAcumulado || 0);
  return extra ? Math.round((base + extra) * 100) / 100 : base;
}

// Quantas parcelas ja decorreram (mes de inicio ate o mes atual, limitado ao mesFim).
function parcelasDecorridas(lancamento) {
  return projetarLancamentoNaJanela(lancamento, lancamento.mesInicio, mesAtual()).meses;
}

const EPS = 0.005;

// Meta batida: so se aplica a aportes temporarios (tem prazo definido). A partir
// do mes seguinte ao mesFim, a parcela para de ser contada como despesa. Tambem
// conta como batida se o total ja acumulado (decorrido + abatido antecipadamente)
// ja alcancou a meta, mesmo antes do mesFim — e o efeito de "acelerar" a meta.
function metaBatida(lancamento) {
  if (lancamento.tipo !== 'temporario' || !lancamento.mesFim) return false;
  if (compararMeses(mesAtual(), lancamento.mesFim) > 0) return true;
  if (lancamento.valorMeta != null && valorAcumuladoAporte(lancamento) >= lancamento.valorMeta - EPS) return true;
  return false;
}

// Valor efetivo da proxima parcela ainda nao decorrida, ja considerando o
// abatimento/rendimento aplicado (cascata da ultima parcela pra frente). Sem
// isso, a tela mostraria sempre o valor nominal original mesmo depois de
// "Lancar Valor Extra"/"Atualizar Valor" reduzirem as parcelas finais.
function proximaParcelaValor(lancamento) {
  if (lancamento.tipo !== 'temporario' || !lancamento.parcelas) return null;
  const decorridos = parcelasDecorridas(lancamento);
  const todas = valoresPorParcela(lancamento);
  if (decorridos >= todas.length) return null;
  return todas[decorridos].valor;
}

// Quantas das parcelas ainda nao decorridas realmente tem valor a pagar — o
// abatimento pode ja ter zerado uma ou mais parcelas finais, entao "restantes"
// deixa de ser so uma contagem de meses no calendario.
function parcelasRestantesComValor(lancamento) {
  if (lancamento.tipo !== 'temporario' || !lancamento.parcelas) return null;
  const decorridos = parcelasDecorridas(lancamento);
  return valoresPorParcela(lancamento)
    .slice(decorridos)
    .filter((p) => p.valor > EPS).length;
}

// Valor efetivo da ultima parcela que AINDA TEM SALDO no cronograma, ja
// considerando o abatimento aplicado — nao necessariamente o ultimo mes do
// calendario. Se o abatimento ja zerou o(s) ultimo(s) mes(es), mostrar
// "R$0,00" para sempre nao ajuda ninguem; a parcela relevante e a ultima que
// ainda representa um valor real a pagar. Diferente de proximaParcelaValor,
// que e a proxima a vencer (pode ser uma parcela do meio do cronograma).
function ultimaParcelaEfetiva(lancamento) {
  if (lancamento.tipo !== 'temporario' || !lancamento.parcelas) return null;
  const todas = valoresPorParcela(lancamento);
  for (let i = todas.length - 1; i >= 0; i -= 1) {
    if (todas[i].valor > EPS) return todas[i].valor;
  }
  return 0;
}

module.exports = {
  valorAcumuladoAporte,
  parcelasDecorridas,
  metaBatida,
  proximaParcelaValor,
  parcelasRestantesComValor,
  ultimaParcelaEfetiva,
};

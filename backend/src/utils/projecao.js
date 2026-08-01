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

// Valor nominal de cada parcela (1..parcelas) de um lancamento temporario, ajustado
// pelo abatimento antecipado (valorAbatido) — usado por projetos de reserva com meta:
// positivo (rendimento/valor extra) consome as parcelas do fim pra tras, diminuindo-as
// em cascata; negativo (perda) soma o deficit na ultima parcela, aumentando-a.
function valoresPorParcela(lancamento) {
  const n = lancamento.parcelas || 1;
  const parcelas = [];
  for (let i = 0; i < n; i += 1) {
    const isUltima = i === n - 1;
    const valor = isUltima && lancamento.valorUltimaParcela != null ? lancamento.valorUltimaParcela : lancamento.valor;
    parcelas.push({ mes: somarMeses(lancamento.mesInicio, i), valor });
  }

  const ajuste = lancamento.valorAbatido || 0;

  if (ajuste > 0) {
    let abatido = ajuste;
    for (let i = n - 1; i >= 0 && abatido > 0.001; i -= 1) {
      const reduz = Math.min(parcelas[i].valor, abatido);
      parcelas[i].valor = Math.round((parcelas[i].valor - reduz) * 100) / 100;
      abatido = Math.round((abatido - reduz) * 100) / 100;
    }
  } else if (ajuste < 0) {
    const ultima = parcelas[n - 1];
    ultima.valor = Math.round((ultima.valor - ajuste) * 100) / 100;
  }

  return parcelas;
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

  if (lancamento.tipo === 'temporario' && lancamento.valorAbatido) {
    const total = valoresPorParcela(lancamento)
      .filter((p) => compararMeses(p.mes, inicioEfetivo) >= 0 && compararMeses(p.mes, fimEfetivo) <= 0)
      .reduce((acc, p) => acc + p.valor, 0);
    return { meses, total };
  }

  const incluiUltimaParcela =
    lancamento.tipo === 'temporario' &&
    lancamento.valorUltimaParcela != null &&
    lancamento.mesFim &&
    compararMeses(fimEfetivo, lancamento.mesFim) === 0;

  if (incluiUltimaParcela) {
    return { meses, total: (meses - 1) * lancamento.valor + lancamento.valorUltimaParcela };
  }

  return { meses, total: meses * lancamento.valor };
}

function projetarLancamentos(lancamentos, mesReferencia, janela) {
  const [inicio, fim] = limitesJanela(mesReferencia, janela);
  return lancamentos.reduce((acc, l) => acc + projetarLancamentoNaJanela(l, inicio, fim).total, 0);
}

module.exports = { JANELAS, janelaValida, limitesJanela, projetarLancamentoNaJanela, projetarLancamentos };

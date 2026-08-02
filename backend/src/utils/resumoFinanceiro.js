// Agregados financeiros de um usuario numa janela de tempo — extraido de
// dashboard.js para ser reaproveitado tambem por relatorio.js, sem duplicar
// a logica de composicao (que por sua vez usa projetarLancamentoNaJanela,
// nunca recalculada aqui).
const { somarMeses, mesAtual, compararMeses, listarMeses, diferencaEmMeses } = require('./mes');
const { JANELAS, limitesJanela, projetarLancamentoNaJanela } = require('./projecao');
const { valorAcumuladoAporte } = require('./patrimonio');

function totalPorGrupo(lancamentos, grupoPorInstancia, grupo, inicio, fim) {
  return lancamentos
    .filter((l) => grupoPorInstancia.get(l.instanciaId) === grupo)
    .reduce((acc, l) => acc + projetarLancamentoNaJanela(l, inicio, fim).total, 0);
}

// Monta o mesmo pacote de indicadores exibido no Dashboard (GET /api/dashboard),
// a partir das entidades ja carregadas do banco. Usado por dashboard.js e por
// relatorio.js — a fonte de verdade dos numeros vive aqui, uma vez so.
function calcularResumo({ instancias, lancamentos, investimentos, mesReferencia, janela }) {
  const ref = mesReferencia;
  const mesesJanela = JANELAS[janela];

  const grupoPorInstancia = new Map(instancias.map((i) => [i.id, i.grupo]));
  const [inicioJanela, fimJanela] = limitesJanela(ref, janela);

  const receitaPeriodo = totalPorGrupo(lancamentos, grupoPorInstancia, 'receita', inicioJanela, fimJanela);
  const despesaLancamentos = totalPorGrupo(lancamentos, grupoPorInstancia, 'gasto', inicioJanela, fimJanela);
  const aportesPeriodo = totalPorGrupo(lancamentos, grupoPorInstancia, 'investimento', inicioJanela, fimJanela);

  const despesaPeriodo = despesaLancamentos + aportesPeriodo;
  const saldoPeriodo = receitaPeriodo - despesaPeriodo;
  const comprometimento = receitaPeriodo > 0 ? (despesaPeriodo / receitaPeriodo) * 100 : 0;
  const sobraLivreMes = saldoPeriodo / mesesJanela;

  const evolucaoMensal = listarMeses(ref, mesesJanela).map((mes) => {
    const receita = totalPorGrupo(lancamentos, grupoPorInstancia, 'receita', mes, mes);
    const gasto =
      totalPorGrupo(lancamentos, grupoPorInstancia, 'gasto', mes, mes) +
      totalPorGrupo(lancamentos, grupoPorInstancia, 'investimento', mes, mes);
    return {
      mes,
      receita,
      gasto,
      folga: receita - gasto,
      proximidade: receita > 0 ? Math.min((gasto / receita) * 100, 999) : 0,
    };
  });

  const primeiroLancamento = lancamentos.reduce((menor, l) => {
    if (!menor) return l.mesInicio;
    return compararMeses(l.mesInicio, menor) < 0 ? l.mesInicio : menor;
  }, null);

  const mesReferenciaAtual = mesAtual();
  let acumulado = [];
  if (primeiroLancamento) {
    const inicioHistorico =
      diferencaEmMeses(primeiroLancamento, mesReferenciaAtual) > 59
        ? somarMeses(mesReferenciaAtual, -59)
        : primeiroLancamento;
    const totalMesesHistorico = diferencaEmMeses(inicioHistorico, mesReferenciaAtual) + 1;
    acumulado = listarMeses(inicioHistorico, totalMesesHistorico).map((mes) => {
      const receita = totalPorGrupo(lancamentos, grupoPorInstancia, 'receita', mes, mes);
      const gasto =
        totalPorGrupo(lancamentos, grupoPorInstancia, 'gasto', mes, mes) +
        totalPorGrupo(lancamentos, grupoPorInstancia, 'investimento', mes, mes);
      return { mes, folga: receita - gasto };
    });
  }
  let saldoCorrente = 0;
  const saldoAcumuladoHistorico = acumulado.map((item) => {
    saldoCorrente += item.folga;
    return { mes: item.mes, saldoAcumulado: saldoCorrente };
  });
  const totalHistorico = saldoCorrente;

  const proximoMes = somarMeses(mesReferenciaAtual, 1);
  const projecao = listarMeses(proximoMes, mesesJanela).map((mes) => {
    const receita = totalPorGrupo(lancamentos, grupoPorInstancia, 'receita', mes, mes);
    const gasto =
      totalPorGrupo(lancamentos, grupoPorInstancia, 'gasto', mes, mes) +
      totalPorGrupo(lancamentos, grupoPorInstancia, 'investimento', mes, mes);
    return { mes, folga: receita - gasto };
  });
  let saldoProjetado = totalHistorico;
  const saldoConsolidado = projecao.map((item) => {
    saldoProjetado += item.folga;
    return { mes: item.mes, saldoAcumulado: saldoProjetado };
  });

  const impactoPorInstancia = instancias
    .filter((i) => i.grupo === 'gasto')
    .map((i) => ({
      id: i.id,
      nome: i.nome,
      cor: i.cor,
      total: lancamentos
        .filter((l) => l.instanciaId === i.id)
        .reduce((acc, l) => acc + projetarLancamentoNaJanela(l, inicioJanela, fimJanela).total, 0),
    }))
    .filter((i) => i.total > 0)
    .sort((a, b) => b.total - a.total);

  const lancamentosPorInstancia = new Map();
  for (const l of lancamentos) {
    if (!lancamentosPorInstancia.has(l.instanciaId)) lancamentosPorInstancia.set(l.instanciaId, []);
    lancamentosPorInstancia.get(l.instanciaId).push(l);
  }
  const investimentosPorInstancia = new Map();
  for (const f of investimentos) {
    if (!investimentosPorInstancia.has(f.instanciaId)) investimentosPorInstancia.set(f.instanciaId, []);
    investimentosPorInstancia.get(f.instanciaId).push(f);
  }

  const contasInvestimento = instancias
    .filter((i) => i.grupo === 'investimento' && i.ativa)
    .map((i) => {
      const aportes = lancamentosPorInstancia.get(i.id) || [];
      const resgates = investimentosPorInstancia.get(i.id) || [];
      const patrimonio =
        aportes.reduce((acc, a) => acc + valorAcumuladoAporte(a), 0) +
        resgates.reduce((acc, r) => acc + r.valor, 0);
      return { id: i.id, nome: i.nome, cor: i.cor, subgrupo: i.subgrupo, patrimonio };
    });

  const patrimonioPessoal = contasInvestimento
    .filter((c) => c.subgrupo === 'pessoal')
    .reduce((acc, c) => acc + c.patrimonio, 0);
  const patrimonioPatrimonial = contasInvestimento
    .filter((c) => c.subgrupo === 'patrimonial')
    .reduce((acc, c) => acc + c.patrimonio, 0);
  const patrimonioInvestido = patrimonioPessoal + patrimonioPatrimonial;

  function projecaoAportesPorSubgrupo(subgrupo) {
    const ultimoMesFuturo = somarMeses(proximoMes, mesesJanela - 1);
    return lancamentos
      .filter((l) => {
        const grupo = grupoPorInstancia.get(l.instanciaId);
        if (grupo !== 'investimento') return false;
        const instancia = instancias.find((i) => i.id === l.instanciaId);
        return instancia && instancia.subgrupo === subgrupo;
      })
      .reduce((acc, l) => acc + projetarLancamentoNaJanela(l, proximoMes, ultimoMesFuturo).total, 0);
  }
  const projecaoPatrimonioPessoal = patrimonioPessoal + projecaoAportesPorSubgrupo('pessoal');
  const projecaoPatrimonioPatrimonial = patrimonioPatrimonial + projecaoAportesPorSubgrupo('patrimonial');

  return {
    janela,
    mesReferencia: ref,
    receitaPeriodo,
    despesaPeriodo,
    saldoPeriodo,
    comprometimento,
    sobraLivreMes,
    evolucaoMensal,
    saldoAcumuladoHistorico,
    saldoConsolidado,
    totalHistorico,
    impactoPorInstancia,
    patrimonioInvestido,
    patrimonioPessoal,
    patrimonioPatrimonial,
    projecaoPatrimonioPessoal,
    projecaoPatrimonioPatrimonial,
    contasInvestimento,
  };
}

module.exports = { calcularResumo };

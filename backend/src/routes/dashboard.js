const express = require('express');
const prisma = require('../lib/prisma');
const { autenticar, exigirRole } = require('../middleware/auth');
const { somarMeses, mesAtual, compararMeses, listarMeses, diferencaEmMeses } = require('../utils/mes');
const { JANELAS, janelaValida, limitesJanela, projetarLancamentoNaJanela } = require('../utils/projecao');
const { asyncHandler } = require('../utils/asyncHandler');

const router = express.Router();
router.use(autenticar, exigirRole('USER'));

function totalPorGrupo(lancamentos, grupoPorInstancia, grupo, inicio, fim) {
  return lancamentos
    .filter((l) => grupoPorInstancia.get(l.instanciaId) === grupo)
    .reduce((acc, l) => acc + projetarLancamentoNaJanela(l, inicio, fim).total, 0);
}

router.get('/', asyncHandler(async (req, res) => {
  const usuarioId = req.usuario.id;
  const ref = req.query.mesReferencia && /^\d{4}-\d{2}$/.test(req.query.mesReferencia)
    ? String(req.query.mesReferencia)
    : mesAtual();
  const janela = req.query.janela && janelaValida(String(req.query.janela)) ? String(req.query.janela) : 'mes';
  const mesesJanela = JANELAS[janela];

  const [instancias, lancamentos, investimentos] = await Promise.all([
    prisma.instancia.findMany({ where: { usuarioId } }),
    prisma.lancamento.findMany({ where: { usuarioId, ativo: true } }),
    prisma.investimento.findMany({ where: { usuarioId } }),
  ]);

  const grupoPorInstancia = new Map(instancias.map((i) => [i.id, i.grupo]));
  const instanciasPorId = new Map(instancias.map((i) => [i.id, i]));

  const [inicioJanela, fimJanela] = limitesJanela(ref, janela);

  const receitaPeriodo = totalPorGrupo(lancamentos, grupoPorInstancia, 'receita', inicioJanela, fimJanela);
  const despesaLancamentos = totalPorGrupo(lancamentos, grupoPorInstancia, 'gasto', inicioJanela, fimJanela);

  const aportesPeriodo = investimentos
    .filter((f) => f.valor > 0 && compararMeses(mesDoFluxo(f.criadoEm), inicioJanela) >= 0 && compararMeses(mesDoFluxo(f.criadoEm), fimJanela) <= 0)
    .reduce((acc, f) => acc + f.valor, 0);

  const despesaPeriodo = despesaLancamentos + aportesPeriodo;
  const saldoPeriodo = receitaPeriodo - despesaPeriodo;
  const comprometimento = receitaPeriodo > 0 ? (despesaPeriodo / receitaPeriodo) * 100 : 0;
  const sobraLivreMes = saldoPeriodo / mesesJanela;

  // Evolucao mensal dentro da janela (mes a mes, a partir do mes de referencia)
  const evolucaoMensal = listarMeses(ref, mesesJanela).map((mes) => {
    const receita = totalPorGrupo(lancamentos, grupoPorInstancia, 'receita', mes, mes);
    const gasto = totalPorGrupo(lancamentos, grupoPorInstancia, 'gasto', mes, mes);
    return {
      mes,
      receita,
      gasto,
      folga: receita - gasto,
      proximidade: receita > 0 ? Math.min((gasto / receita) * 100, 999) : 0,
    };
  });

  // Saldo ao longo do tempo: acumulado (historico ate o mes atual) e projecao (proximos N meses)
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
      const gasto = totalPorGrupo(lancamentos, grupoPorInstancia, 'gasto', mes, mes);
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
    const gasto = totalPorGrupo(lancamentos, grupoPorInstancia, 'gasto', mes, mes);
    return { mes, folga: receita - gasto };
  });
  let saldoProjetado = totalHistorico;
  const saldoConsolidado = projecao.map((item) => {
    saldoProjetado += item.folga;
    return { mes: item.mes, saldoAcumulado: saldoProjetado };
  });

  // Impacto por instancia (ranking de despesa no recorte)
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

  // Patrimonio investido (bloco a parte, nao se mistura ao saldo do fluxo)
  const patrimonioInvestido = investimentos.reduce((acc, f) => acc + f.valor, 0);
  const contasInvestimento = instancias
    .filter((i) => i.grupo === 'investimento')
    .map((i) => ({
      id: i.id,
      nome: i.nome,
      cor: i.cor,
      patrimonio: investimentos.filter((f) => f.instanciaId === i.id).reduce((acc, f) => acc + f.valor, 0),
    }));

  return res.json({
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
    contasInvestimento,
    totalInstancias: instancias.length,
    totalLancamentos: lancamentos.length,
  });
}));

function mesDoFluxo(data) {
  const d = new Date(data);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

module.exports = router;

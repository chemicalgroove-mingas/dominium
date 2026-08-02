const express = require('express');
const prisma = require('../lib/prisma');
const { autenticar, exigirRole } = require('../middleware/auth');
const { mesAtual } = require('../utils/mes');
const { janelaValida, limitesJanela, parcelasNaJanela } = require('../utils/projecao');
const { calcularResumo } = require('../utils/resumoFinanceiro');
const { asyncHandler } = require('../utils/asyncHandler');

const router = express.Router();
router.use(autenticar, exigirRole('USER'));

// Gera o JSON-fonte do Relatorio do Periodo: resumo (mesmos agregados do
// Dashboard) + lancamentos discriminados por instancia, linha a linha, dentro
// da janela selecionada. Nunca gera arquivo nem persiste nada — o frontend
// so formata isso em PDF/XLSX sob demanda.
router.get('/', asyncHandler(async (req, res) => {
  const usuarioId = req.usuario.id;
  const ref = req.query.mesReferencia && /^\d{4}-\d{2}$/.test(req.query.mesReferencia)
    ? String(req.query.mesReferencia)
    : mesAtual();
  const janela = req.query.janela && janelaValida(String(req.query.janela)) ? String(req.query.janela) : 'mes';
  const direcao = req.query.direcao === 'passado' ? 'passado' : 'futuro';

  const [instancias, lancamentos, investimentos] = await Promise.all([
    prisma.instancia.findMany({ where: { usuarioId } }),
    prisma.lancamento.findMany({ where: { usuarioId, ativo: true } }),
    prisma.investimento.findMany({ where: { usuarioId } }),
  ]);

  const resumo = calcularResumo({ instancias, lancamentos, investimentos, mesReferencia: ref, janela, direcao });

  const [inicioJanela, fimJanela] = limitesJanela(ref, janela, direcao);
  const lancamentosPorInstancia = new Map();
  for (const l of lancamentos) {
    if (!lancamentosPorInstancia.has(l.instanciaId)) lancamentosPorInstancia.set(l.instanciaId, []);
    lancamentosPorInstancia.get(l.instanciaId).push(l);
  }

  const porInstancia = instancias
    .map((instancia) => {
      const doGrupo = lancamentosPorInstancia.get(instancia.id) || [];
      const linhas = doGrupo
        .flatMap((l) =>
          parcelasNaJanela(l, inicioJanela, fimJanela).map((p) => ({
            lancamentoId: l.id,
            descricao: l.descricao,
            tipo: l.tipo,
            mes: p.mes,
            valor: p.valor,
            parcela: p.parcela,
            totalParcelas: l.parcelas,
          }))
        )
        .sort((a, b) => (a.mes < b.mes ? -1 : a.mes > b.mes ? 1 : 0));
      return {
        instancia: {
          id: instancia.id,
          nome: instancia.nome,
          grupo: instancia.grupo,
          subgrupo: instancia.subgrupo,
          cor: instancia.cor,
        },
        linhas,
      };
    })
    .filter((item) => item.linhas.length > 0);

  return res.json({ resumo, porInstancia });
}));

module.exports = router;

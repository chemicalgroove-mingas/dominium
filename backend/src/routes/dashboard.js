const express = require('express');
const prisma = require('../lib/prisma');
const { autenticar, exigirRole } = require('../middleware/auth');
const { mesAtual } = require('../utils/mes');
const { janelaValida } = require('../utils/projecao');
const { calcularResumo } = require('../utils/resumoFinanceiro');
const { asyncHandler } = require('../utils/asyncHandler');

const router = express.Router();
router.use(autenticar, exigirRole('USER'));

router.get('/', asyncHandler(async (req, res) => {
  const usuarioId = req.usuario.id;
  const ref = req.query.mesReferencia && /^\d{4}-\d{2}$/.test(req.query.mesReferencia)
    ? String(req.query.mesReferencia)
    : mesAtual();
  const janela = req.query.janela && janelaValida(String(req.query.janela)) ? String(req.query.janela) : 'mes';

  const [instancias, lancamentos, investimentos] = await Promise.all([
    prisma.instancia.findMany({ where: { usuarioId } }),
    prisma.lancamento.findMany({ where: { usuarioId, ativo: true } }),
    prisma.investimento.findMany({ where: { usuarioId } }),
  ]);

  const resumo = calcularResumo({ instancias, lancamentos, investimentos, mesReferencia: ref, janela });

  return res.json({
    ...resumo,
    totalInstancias: instancias.length,
    totalLancamentos: lancamentos.length,
  });
}));

module.exports = router;

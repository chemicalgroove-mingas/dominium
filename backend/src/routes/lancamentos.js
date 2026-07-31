const express = require('express');
const { z } = require('zod');
const prisma = require('../lib/prisma');
const { autenticar } = require('../middleware/auth');
const { somarMeses, mesAtual, parseMes } = require('../utils/mes');
const { janelaValida, limitesJanela, projetarLancamentoNaJanela } = require('../utils/projecao');

const router = express.Router();
router.use(autenticar);

const mesSchema = z.string().regex(/^\d{4}-\d{2}$/, 'Use o formato AAAA-MM.');

const baseSchema = z.object({
  instanciaId: z.string().min(1),
  descricao: z.string().trim().min(1, 'Informe uma descricao.'),
  valor: z.number().positive('O valor precisa ser maior que zero.'),
  tipo: z.enum(['fixo', 'temporario']),
  parcelas: z.number().int().min(1).nullable().optional(),
  mesInicio: mesSchema,
  observacoes: z.string().trim().optional().nullable(),
});

function validarParcelasPorTipo(dados) {
  if (dados.tipo === 'temporario') {
    if (!dados.parcelas || dados.parcelas < 1) {
      return 'Lancamentos temporarios exigem numero de parcelas (>= 1).';
    }
  } else if (dados.parcelas !== undefined && dados.parcelas !== null) {
    return 'Lancamentos fixos nao tem numero de parcelas.';
  }
  return null;
}

async function contarPagamentos(lancamentoId) {
  return prisma.pagamento.count({ where: { lancamentoId } });
}

async function serializarComRestantes(lancamento) {
  if (lancamento.tipo !== 'temporario') {
    return { ...lancamento, pagas: null, restantes: null, totalRestante: null };
  }
  const pagas = await contarPagamentos(lancamento.id);
  const restantes = Math.max(lancamento.parcelas - pagas, 0);
  return { ...lancamento, pagas, restantes, totalRestante: restantes * lancamento.valor };
}

router.get('/', async (req, res) => {
  const { instanciaId, mesReferencia, janela } = req.query;
  if (!instanciaId) return res.status(400).json({ erro: 'Informe instanciaId.' });

  const instancia = await prisma.instancia.findFirst({
    where: { id: String(instanciaId), usuarioId: req.usuario.id },
  });
  if (!instancia) return res.status(404).json({ erro: 'Instancia nao encontrada.' });

  const lancamentos = await prisma.lancamento.findMany({
    where: { instanciaId: instancia.id, usuarioId: req.usuario.id },
    orderBy: { criadoEm: 'desc' },
  });

  const comRestantes = await Promise.all(lancamentos.map(serializarComRestantes));

  const ref = mesReferencia && mesSchema.safeParse(mesReferencia).success ? String(mesReferencia) : mesAtual();
  const jan = janela && janelaValida(String(janela)) ? String(janela) : 'mes';
  const [inicio, fim] = limitesJanela(ref, jan);
  const totalJanela = lancamentos.reduce(
    (acc, l) => acc + projetarLancamentoNaJanela(l, inicio, fim).total,
    0
  );

  return res.json({ lancamentos: comRestantes, totalJanela, janela: jan, mesReferencia: ref });
});

router.post('/', async (req, res) => {
  const parsed = baseSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ erro: parsed.error.issues[0].message });

  const erroParcelas = validarParcelasPorTipo(parsed.data);
  if (erroParcelas) return res.status(400).json({ erro: erroParcelas });

  const instancia = await prisma.instancia.findFirst({
    where: { id: parsed.data.instanciaId, usuarioId: req.usuario.id },
  });
  if (!instancia) return res.status(404).json({ erro: 'Instancia nao encontrada.' });

  try {
    parseMes(parsed.data.mesInicio);
  } catch {
    return res.status(400).json({ erro: 'mesInicio invalido.' });
  }

  const mesFim =
    parsed.data.tipo === 'temporario' ? somarMeses(parsed.data.mesInicio, parsed.data.parcelas - 1) : null;

  const lancamento = await prisma.lancamento.create({
    data: {
      usuarioId: req.usuario.id,
      instanciaId: parsed.data.instanciaId,
      descricao: parsed.data.descricao,
      valor: parsed.data.valor,
      tipo: parsed.data.tipo,
      parcelas: parsed.data.tipo === 'temporario' ? parsed.data.parcelas : null,
      mesInicio: parsed.data.mesInicio,
      mesFim,
      observacoes: parsed.data.observacoes || null,
    },
  });
  return res.status(201).json({ lancamento: await serializarComRestantes(lancamento) });
});

const edicaoSchema = z.object({
  descricao: z.string().trim().min(1).optional(),
  valor: z.number().positive('O valor precisa ser maior que zero.').optional(),
  observacoes: z.string().trim().optional().nullable(),
});

router.put('/:id', async (req, res) => {
  const parsed = edicaoSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ erro: parsed.error.issues[0].message });

  const lancamento = await prisma.lancamento.findFirst({
    where: { id: req.params.id, usuarioId: req.usuario.id },
  });
  if (!lancamento) return res.status(404).json({ erro: 'Lancamento nao encontrado.' });

  const atualizado = await prisma.lancamento.update({ where: { id: lancamento.id }, data: parsed.data });
  return res.json({ lancamento: await serializarComRestantes(atualizado) });
});

router.delete('/:id', async (req, res) => {
  const lancamento = await prisma.lancamento.findFirst({
    where: { id: req.params.id, usuarioId: req.usuario.id },
  });
  if (!lancamento) return res.status(404).json({ erro: 'Lancamento nao encontrado.' });

  await prisma.lancamento.delete({ where: { id: lancamento.id } });
  return res.json({ ok: true });
});

module.exports = router;

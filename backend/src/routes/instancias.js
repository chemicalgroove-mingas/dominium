const express = require('express');
const { z } = require('zod');
const prisma = require('../lib/prisma');
const { autenticar } = require('../middleware/auth');

const router = express.Router();
router.use(autenticar);

const TIPOS = ['conta', 'cartao', 'categoria_gasto', 'categoria_receita', 'objetivo'];

const instanciaSchema = z.object({
  nome: z.string().trim().min(1, 'Informe um nome.'),
  tipo: z.enum(TIPOS),
  cor: z.string().trim().min(1),
  icone: z.string().trim().min(1),
  metaValor: z.number().nullable().optional(),
  metaPrazo: z.string().nullable().optional(),
});

router.get('/', async (req, res) => {
  const { arquivadas } = req.query;
  const instancias = await prisma.instancia.findMany({
    where: { usuarioId: req.usuario.id, ...(arquivadas === 'true' ? {} : { arquivada: false }) },
    orderBy: [{ ordem: 'asc' }, { criadoEm: 'asc' }],
    include: { _count: { select: { lancamentos: true } } },
  });

  const comSaldo = await Promise.all(
    instancias.map(async (i) => {
      const agregado = await prisma.lancamento.aggregate({
        where: { instanciaId: i.id },
        _sum: { valor: true },
      });
      return { ...i, saldoLancado: agregado._sum.valor || 0 };
    })
  );

  return res.json({ instancias: comSaldo });
});

router.post('/', async (req, res) => {
  const parsed = instanciaSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ erro: parsed.error.issues[0].message });

  const ultima = await prisma.instancia.findFirst({
    where: { usuarioId: req.usuario.id },
    orderBy: { ordem: 'desc' },
  });

  const instancia = await prisma.instancia.create({
    data: {
      ...parsed.data,
      metaPrazo: parsed.data.metaPrazo ? new Date(parsed.data.metaPrazo) : null,
      usuarioId: req.usuario.id,
      ordem: (ultima?.ordem ?? -1) + 1,
    },
  });
  return res.status(201).json({ instancia });
});

router.put('/:id', async (req, res) => {
  const parsed = instanciaSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ erro: parsed.error.issues[0].message });

  const instancia = await prisma.instancia.findFirst({
    where: { id: req.params.id, usuarioId: req.usuario.id },
  });
  if (!instancia) return res.status(404).json({ erro: 'Instancia nao encontrada.' });

  const atualizada = await prisma.instancia.update({
    where: { id: instancia.id },
    data: {
      ...parsed.data,
      ...(parsed.data.metaPrazo !== undefined
        ? { metaPrazo: parsed.data.metaPrazo ? new Date(parsed.data.metaPrazo) : null }
        : {}),
    },
  });
  return res.json({ instancia: atualizada });
});

router.patch('/:id/arquivar', async (req, res) => {
  const instancia = await prisma.instancia.findFirst({
    where: { id: req.params.id, usuarioId: req.usuario.id },
  });
  if (!instancia) return res.status(404).json({ erro: 'Instancia nao encontrada.' });

  const atualizada = await prisma.instancia.update({
    where: { id: instancia.id },
    data: { arquivada: !instancia.arquivada },
  });
  return res.json({ instancia: atualizada });
});

router.delete('/:id', async (req, res) => {
  const instancia = await prisma.instancia.findFirst({
    where: { id: req.params.id, usuarioId: req.usuario.id },
  });
  if (!instancia) return res.status(404).json({ erro: 'Instancia nao encontrada.' });

  const totalLancamentos = await prisma.lancamento.count({ where: { instanciaId: instancia.id } });
  if (totalLancamentos > 0 && req.query.confirmar !== 'true') {
    return res.status(409).json({
      erro: 'Esta instancia possui lancamentos vinculados.',
      totalLancamentos,
      precisaConfirmar: true,
    });
  }

  await prisma.instancia.delete({ where: { id: instancia.id } });
  return res.json({ ok: true });
});

module.exports = router;

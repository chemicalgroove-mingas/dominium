const express = require('express');
const { z } = require('zod');
const prisma = require('../lib/prisma');
const { autenticar, exigirRole } = require('../middleware/auth');
const { asyncHandler } = require('../utils/asyncHandler');

const router = express.Router();
router.use(autenticar, exigirRole('USER'));

router.get('/', asyncHandler(async (req, res) => {
  const { instanciaId } = req.query;

  const instancias = await prisma.instancia.findMany({
    where: { usuarioId: req.usuario.id, grupo: 'investimento' },
    orderBy: { criadoEm: 'asc' },
  });

  const contas = await Promise.all(
    instancias.map(async (instancia) => {
      const fluxos = await prisma.investimento.findMany({
        where: { instanciaId: instancia.id },
        orderBy: { criadoEm: 'desc' },
      });
      const patrimonio = fluxos.reduce((acc, f) => acc + f.valor, 0);
      return { ...instancia, fluxos, patrimonio };
    })
  );

  if (instanciaId) {
    return res.json({ contas: contas.filter((c) => c.id === instanciaId) });
  }
  return res.json({ contas });
}));

const fluxoSchema = z.object({
  instanciaId: z.string().min(1),
  descricao: z.string().trim().min(1, 'Informe uma descricao.'),
  valor: z.number().refine((v) => v !== 0, 'O valor nao pode ser zero.'),
  observacoes: z.string().trim().optional().nullable(),
});

router.post('/', asyncHandler(async (req, res) => {
  const parsed = fluxoSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ erro: parsed.error.issues[0].message });

  const instancia = await prisma.instancia.findFirst({
    where: { id: parsed.data.instanciaId, usuarioId: req.usuario.id, grupo: 'investimento' },
  });
  if (!instancia) return res.status(404).json({ erro: 'Conta de investimento nao encontrada.' });

  const fluxo = await prisma.investimento.create({
    data: { ...parsed.data, usuarioId: req.usuario.id, observacoes: parsed.data.observacoes || null },
  });
  return res.status(201).json({ fluxo });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const fluxo = await prisma.investimento.findFirst({
    where: { id: req.params.id, usuarioId: req.usuario.id },
  });
  if (!fluxo) return res.status(404).json({ erro: 'Fluxo nao encontrado.' });

  await prisma.investimento.delete({ where: { id: fluxo.id } });
  return res.json({ ok: true });
}));

module.exports = router;

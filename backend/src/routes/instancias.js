const express = require('express');
const { z } = require('zod');
const prisma = require('../lib/prisma');
const { autenticar } = require('../middleware/auth');

const router = express.Router();
router.use(autenticar);

const GRUPOS = ['gasto', 'receita', 'investimento'];

const instanciaSchema = z.object({
  nome: z.string().trim().min(1, 'Informe um nome.'),
  grupo: z.enum(GRUPOS),
  cor: z.string().trim().min(1),
});

router.get('/', async (req, res) => {
  const { grupo, ativas } = req.query;
  const instancias = await prisma.instancia.findMany({
    where: {
      usuarioId: req.usuario.id,
      ...(grupo ? { grupo: String(grupo) } : {}),
      ...(ativas === 'true' ? { ativa: true } : {}),
    },
    orderBy: { criadoEm: 'asc' },
  });
  return res.json({ instancias });
});

router.post('/', async (req, res) => {
  const parsed = instanciaSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ erro: parsed.error.issues[0].message });

  const instancia = await prisma.instancia.create({
    data: { ...parsed.data, usuarioId: req.usuario.id },
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

  const atualizada = await prisma.instancia.update({ where: { id: instancia.id }, data: parsed.data });
  return res.json({ instancia: atualizada });
});

router.patch('/:id/ativa', async (req, res) => {
  const instancia = await prisma.instancia.findFirst({
    where: { id: req.params.id, usuarioId: req.usuario.id },
  });
  if (!instancia) return res.status(404).json({ erro: 'Instancia nao encontrada.' });

  const atualizada = await prisma.instancia.update({
    where: { id: instancia.id },
    data: { ativa: !instancia.ativa },
  });
  return res.json({ instancia: atualizada });
});

router.delete('/:id', async (req, res) => {
  const instancia = await prisma.instancia.findFirst({
    where: { id: req.params.id, usuarioId: req.usuario.id },
  });
  if (!instancia) return res.status(404).json({ erro: 'Instancia nao encontrada.' });

  // Cascade (lancamentos, pagamentos, investimentos) garantido pelo schema (onDelete: Cascade).
  await prisma.instancia.delete({ where: { id: instancia.id } });
  return res.json({ ok: true });
});

module.exports = router;

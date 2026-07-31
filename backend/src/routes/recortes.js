const express = require('express');
const { z } = require('zod');
const prisma = require('../lib/prisma');
const { autenticar } = require('../middleware/auth');

const router = express.Router();
router.use(autenticar);

const recorteSchema = z.object({
  nome: z.string().trim().min(1, 'Informe um nome para o recorte.'),
  filtros: z.object({
    de: z.string().nullable().optional(),
    ate: z.string().nullable().optional(),
    instanciaIds: z.array(z.string()).optional().default([]),
    tipos: z.array(z.string()).optional().default([]),
    tags: z.array(z.string()).optional().default([]),
  }),
});

function serializar(recorte) {
  return { ...recorte, filtros: JSON.parse(recorte.filtros) };
}

router.get('/', async (req, res) => {
  const recortes = await prisma.recorte.findMany({
    where: { usuarioId: req.usuario.id },
    orderBy: { criadoEm: 'desc' },
  });
  return res.json({ recortes: recortes.map(serializar) });
});

router.post('/', async (req, res) => {
  const parsed = recorteSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ erro: parsed.error.issues[0].message });

  const recorte = await prisma.recorte.create({
    data: {
      usuarioId: req.usuario.id,
      nome: parsed.data.nome,
      filtros: JSON.stringify(parsed.data.filtros),
    },
  });
  return res.status(201).json({ recorte: serializar(recorte) });
});

router.delete('/:id', async (req, res) => {
  const recorte = await prisma.recorte.findFirst({
    where: { id: req.params.id, usuarioId: req.usuario.id },
  });
  if (!recorte) return res.status(404).json({ erro: 'Recorte nao encontrado.' });

  await prisma.recorte.delete({ where: { id: recorte.id } });
  return res.json({ ok: true });
});

module.exports = router;

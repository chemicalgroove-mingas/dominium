const express = require('express');
const { z } = require('zod');
const prisma = require('../lib/prisma');
const { autenticar } = require('../middleware/auth');

const router = express.Router();
router.use(autenticar);

const lancamentoSchema = z.object({
  instanciaId: z.string().min(1),
  tipo: z.enum(['entrada', 'saida', 'transferencia']),
  valor: z.number().positive('Informe um valor maior que zero.'),
  descricao: z.string().trim().optional().nullable(),
  data: z.string().min(1),
  tags: z.array(z.string()).optional().default([]),
  recorrente: z.boolean().optional().default(false),
});

function serializar(lancamento) {
  return { ...lancamento, tags: lancamento.tags ? lancamento.tags.split(',').filter(Boolean) : [] };
}

router.get('/', async (req, res) => {
  const { instanciaId, tipo, de, ate, tags } = req.query;

  const where = {
    usuarioId: req.usuario.id,
    ...(instanciaId ? { instanciaId: String(instanciaId) } : {}),
    ...(tipo ? { tipo: String(tipo) } : {}),
    ...(de || ate
      ? {
          data: {
            ...(de ? { gte: new Date(String(de)) } : {}),
            ...(ate ? { lte: new Date(String(ate)) } : {}),
          },
        }
      : {}),
  };

  let lancamentos = await prisma.lancamento.findMany({
    where,
    include: { instancia: true },
    orderBy: { data: 'desc' },
    take: 200,
  });

  if (tags) {
    const tagsFiltro = String(tags).split(',').filter(Boolean);
    lancamentos = lancamentos.filter((l) => {
      const tagsLancamento = l.tags ? l.tags.split(',') : [];
      return tagsFiltro.some((t) => tagsLancamento.includes(t));
    });
  }

  return res.json({ lancamentos: lancamentos.map(serializar) });
});

router.post('/', async (req, res) => {
  const parsed = lancamentoSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ erro: parsed.error.issues[0].message });

  const instancia = await prisma.instancia.findFirst({
    where: { id: parsed.data.instanciaId, usuarioId: req.usuario.id },
  });
  if (!instancia) return res.status(404).json({ erro: 'Instancia nao encontrada.' });

  const lancamento = await prisma.lancamento.create({
    data: {
      usuarioId: req.usuario.id,
      instanciaId: parsed.data.instanciaId,
      tipo: parsed.data.tipo,
      valor: parsed.data.tipo === 'saida' ? -Math.abs(parsed.data.valor) : Math.abs(parsed.data.valor),
      descricao: parsed.data.descricao || null,
      data: new Date(parsed.data.data),
      tags: parsed.data.tags.join(','),
      recorrente: parsed.data.recorrente,
    },
    include: { instancia: true },
  });
  return res.status(201).json({ lancamento: serializar(lancamento) });
});

router.put('/:id', async (req, res) => {
  const parsed = lancamentoSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ erro: parsed.error.issues[0].message });

  const lancamento = await prisma.lancamento.findFirst({
    where: { id: req.params.id, usuarioId: req.usuario.id },
  });
  if (!lancamento) return res.status(404).json({ erro: 'Lancamento nao encontrado.' });

  const data = { ...parsed.data };
  if (data.valor !== undefined) {
    const tipo = data.tipo || lancamento.tipo;
    data.valor = tipo === 'saida' ? -Math.abs(data.valor) : Math.abs(data.valor);
  }
  if (data.data !== undefined) data.data = new Date(data.data);
  if (data.tags !== undefined) data.tags = data.tags.join(',');

  const atualizado = await prisma.lancamento.update({
    where: { id: lancamento.id },
    data,
    include: { instancia: true },
  });
  return res.json({ lancamento: serializar(atualizado) });
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

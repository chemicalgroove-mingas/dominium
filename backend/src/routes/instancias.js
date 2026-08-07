const express = require('express');
const { z } = require('zod');
const prisma = require('../lib/prisma');
const { autenticar, exigirRole } = require('../middleware/auth');
const { asyncHandler } = require('../utils/asyncHandler');
const {
  CONTEXTOS,
  CONTEXTO_POR_GRUPO,
  ordenarPorContexto,
  colunaDoContexto,
  criarOrdenacoesIniciais,
} = require('../utils/ordenacaoInstancia');

const router = express.Router();
router.use(autenticar, exigirRole('USER'));

const GRUPOS = ['gasto', 'receita', 'investimento'];
const SUBGRUPOS = ['pessoal', 'patrimonial'];

const instanciaObjeto = z.object({
  nome: z.string().trim().min(1, 'Informe um nome.'),
  grupo: z.enum(GRUPOS),
  subgrupo: z.enum(SUBGRUPOS).nullable().optional(),
  cor: z.string().trim().min(1),
});

const instanciaSchema = instanciaObjeto
  .refine((d) => d.grupo !== 'investimento' || SUBGRUPOS.includes(d.subgrupo), {
    message: 'Informe se e Reserva Pessoal ou Reserva Patrimonial.',
    path: ['subgrupo'],
  })
  .transform((d) => ({ ...d, subgrupo: d.grupo === 'investimento' ? d.subgrupo : null }));

const instanciaSchemaEdicao = instanciaObjeto.partial();

router.get('/', asyncHandler(async (req, res) => {
  const { grupo, subgrupo, ativas } = req.query;
  const instancias = await prisma.instancia.findMany({
    where: {
      usuarioId: req.usuario.id,
      ...(grupo ? { grupo: String(grupo) } : {}),
      ...(subgrupo ? { subgrupo: String(subgrupo) } : {}),
      ...(ativas === 'true' ? { ativa: true } : {}),
    },
    orderBy: { criadoEm: 'asc' },
    include: { ordenacoes: { where: { contexto: { in: Object.values(CONTEXTO_POR_GRUPO) } } } },
  });
  const ordenadas = ordenarPorContexto(instancias, (i) => CONTEXTO_POR_GRUPO[i.grupo]).map((i) => {
    const { ordenacoes, ...instancia } = i;
    return { ...instancia, coluna: colunaDoContexto(i, CONTEXTO_POR_GRUPO[i.grupo]) };
  });
  return res.json({ instancias: ordenadas });
}));

// Formato novo (Etapa 2 da ordenacao): { contexto, colunas: [ [idsColuna0...], [idsColuna1...] ] } —
// colunas[0] e colunas[1] sao a sequencia final de cada coluna (a posicao
// no array = a nova `ordem` dentro dela). Substitui o formato anterior
// ({ contexto, instanciaIds } — sequencia global, sem coluna); nao havia UI
// em producao usando o formato antigo (o PR do drag de sequencia unica
// nunca foi mesclado), entao nao precisa de fallback de compatibilidade.
router.patch('/ordenacao', asyncHandler(async (req, res) => {
  const schema = z.object({
    contexto: z.enum(CONTEXTOS),
    colunas: z.tuple([z.array(z.string().min(1)), z.array(z.string().min(1))]),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ erro: parsed.error.issues[0].message });
  const { contexto, colunas } = parsed.data;

  const todosIds = colunas.flat();
  if (todosIds.length === 0) return res.status(400).json({ erro: 'Informe ao menos uma instancia.' });
  if (new Set(todosIds).size !== todosIds.length) {
    return res.status(400).json({ erro: 'Uma instancia nao pode aparecer duas vezes.' });
  }

  const instancias = await prisma.instancia.findMany({
    where: { id: { in: todosIds }, usuarioId: req.usuario.id },
    select: { id: true },
  });
  if (instancias.length !== todosIds.length) {
    return res.status(404).json({ erro: 'Uma ou mais instancias nao foram encontradas.' });
  }

  const operacoes = [];
  colunas.forEach((idsDaColuna, coluna) => {
    idsDaColuna.forEach((instanciaId, ordem) => {
      operacoes.push(
        prisma.ordenacaoInstancia.upsert({
          where: { instanciaId_contexto: { instanciaId, contexto } },
          update: { coluna, ordem },
          create: { instanciaId, contexto, coluna, ordem },
        })
      );
    });
  });
  await prisma.$transaction(operacoes);
  return res.json({ ok: true });
}));

router.post('/', asyncHandler(async (req, res) => {
  const parsed = instanciaSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ erro: parsed.error.issues[0].message });

  const instancia = await prisma.instancia.create({
    data: { ...parsed.data, usuarioId: req.usuario.id },
  });
  await criarOrdenacoesIniciais(prisma, instancia);
  return res.status(201).json({ instancia });
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const parsed = instanciaSchemaEdicao.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ erro: parsed.error.issues[0].message });

  const instancia = await prisma.instancia.findFirst({
    where: { id: req.params.id, usuarioId: req.usuario.id },
  });
  if (!instancia) return res.status(404).json({ erro: 'Instancia nao encontrada.' });

  const atualizada = await prisma.instancia.update({ where: { id: instancia.id }, data: parsed.data });
  return res.json({ instancia: atualizada });
}));

router.patch('/:id/ativa', asyncHandler(async (req, res) => {
  const instancia = await prisma.instancia.findFirst({
    where: { id: req.params.id, usuarioId: req.usuario.id },
  });
  if (!instancia) return res.status(404).json({ erro: 'Instancia nao encontrada.' });

  const atualizada = await prisma.instancia.update({
    where: { id: instancia.id },
    data: { ativa: !instancia.ativa },
  });
  return res.json({ instancia: atualizada });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const instancia = await prisma.instancia.findFirst({
    where: { id: req.params.id, usuarioId: req.usuario.id },
  });
  if (!instancia) return res.status(404).json({ erro: 'Instancia nao encontrada.' });

  // Cascade (lancamentos, pagamentos, investimentos) garantido pelo schema (onDelete: Cascade).
  await prisma.instancia.delete({ where: { id: instancia.id } });
  return res.json({ ok: true });
}));

module.exports = router;

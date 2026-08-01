const express = require('express');
const { z } = require('zod');
const prisma = require('../lib/prisma');
const { autenticar, exigirRole } = require('../middleware/auth');
const { gerarCodigoVoucher } = require('../utils/voucher');
const { asyncHandler } = require('../utils/asyncHandler');

const router = express.Router();
router.use(autenticar, exigirRole('ADMIN'));

const FILTROS_STATUS = { ativos: 'ATIVO', usados: 'USADO', revogados: 'REVOGADO' };

function serializar(voucher) {
  const expirado = Boolean(
    voucher.status === 'ATIVO' && voucher.expiraEm && new Date(voucher.expiraEm) < new Date()
  );
  return { ...voucher, expirado };
}

router.get('/', asyncHandler(async (req, res) => {
  const { status } = req.query;
  const where = status && FILTROS_STATUS[status] ? { status: FILTROS_STATUS[status] } : {};

  const vouchers = await prisma.voucher.findMany({
    where,
    include: { usuario: { select: { id: true, nome: true, login: true } } },
    orderBy: { criadoEm: 'desc' },
  });

  return res.json({ vouchers: vouchers.map(serializar) });
}));

const gerarSchema = z.object({
  expiraEm: z
    .string()
    .refine((v) => !Number.isNaN(new Date(v).getTime()), 'Data de expiracao invalida.')
    .nullable()
    .optional(),
  observacao: z.string().trim().optional().nullable(),
});

async function criarVoucherUnico({ expiraEm, observacao, criadoPor, prefixo, comprimento }) {
  for (let tentativa = 0; tentativa < 5; tentativa += 1) {
    const codigo = gerarCodigoVoucher({ prefixo, comprimento });
    try {
      return await prisma.voucher.create({
        data: {
          codigo,
          expiraEm: expiraEm ? new Date(expiraEm) : null,
          observacao: observacao || null,
          criadoPor: criadoPor || null,
        },
      });
    } catch (err) {
      if (err.code !== 'P2002') throw err;
      // Colisao de codigo (extremamente improvavel) — tenta gerar outro.
    }
  }
  throw new Error('Nao foi possivel gerar um codigo de voucher unico.');
}

router.post('/', asyncHandler(async (req, res) => {
  const parsed = gerarSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ erro: parsed.error.issues[0].message });

  const voucher = await criarVoucherUnico({ ...parsed.data, criadoPor: req.usuario.login });
  return res.status(201).json({ voucher: serializar(voucher) });
}));

const loteSchema = z.object({
  quantidade: z.number().int().min(1, 'Informe ao menos 1.').max(1000, 'Maximo de 1000 por lote.'),
  prefixo: z.string().trim().min(1).max(10).optional().default('DOM'),
  comprimento: z.number().int().min(3).max(8).optional().default(4),
  observacao: z.string().trim().optional().nullable(),
  expiraEm: z
    .string()
    .refine((v) => !Number.isNaN(new Date(v).getTime()), 'Data de expiracao invalida.')
    .nullable()
    .optional(),
});

router.post('/lote', asyncHandler(async (req, res) => {
  const parsed = loteSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ erro: parsed.error.issues[0].message });

  const { quantidade, prefixo, comprimento, observacao, expiraEm } = parsed.data;
  const criados = [];
  for (let i = 0; i < quantidade; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    const voucher = await criarVoucherUnico({
      expiraEm,
      observacao,
      criadoPor: req.usuario.login,
      prefixo,
      comprimento,
    });
    criados.push(voucher);
  }

  return res.status(201).json({ vouchers: criados.map(serializar), quantidade: criados.length });
}));

router.patch('/:id/revogar', asyncHandler(async (req, res) => {
  const voucher = await prisma.voucher.findUnique({ where: { id: req.params.id } });
  if (!voucher) return res.status(404).json({ erro: 'Voucher nao encontrado.' });
  if (voucher.status !== 'ATIVO') {
    return res.status(400).json({ erro: 'Somente vouchers ativos podem ser revogados.' });
  }

  const atualizado = await prisma.voucher.update({
    where: { id: voucher.id },
    data: { status: 'REVOGADO' },
  });
  return res.json({ voucher: serializar(atualizado) });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const voucher = await prisma.voucher.findUnique({ where: { id: req.params.id } });
  if (!voucher) return res.status(404).json({ erro: 'Voucher nao encontrado.' });
  if (voucher.status === 'USADO') {
    return res.status(400).json({ erro: 'Vouchers ja utilizados nao podem ser excluidos.' });
  }

  await prisma.voucher.delete({ where: { id: voucher.id } });
  return res.json({ ok: true });
}));

module.exports = router;

const express = require('express');
const { z } = require('zod');
const prisma = require('../lib/prisma');
const { autenticar, exigirRole } = require('../middleware/auth');
const { asyncHandler } = require('../utils/asyncHandler');
const { mesAtual, somarMeses, parseMes } = require('../utils/mes');
const { valorAcumuladoAporte, metaBatida } = require('../utils/patrimonio');

const router = express.Router();
router.use(autenticar, exigirRole('USER'));

const SUBGRUPOS = ['pessoal', 'patrimonial'];
const EPS = 0.005;

async function montarConta(instancia) {
  const [aportes, resgates] = await Promise.all([
    prisma.lancamento.findMany({ where: { instanciaId: instancia.id }, orderBy: { criadoEm: 'desc' } }),
    prisma.investimento.findMany({ where: { instanciaId: instancia.id }, orderBy: { criadoEm: 'desc' } }),
  ]);

  const acumuladoAportes = aportes.reduce((acc, a) => acc + valorAcumuladoAporte(a), 0);
  const acumuladoResgates = resgates.reduce((acc, r) => acc + r.valor, 0);
  const patrimonio = acumuladoAportes + acumuladoResgates;

  const aportesComMeta = aportes.map((a) => ({
    ...a,
    acumulado: valorAcumuladoAporte(a),
    metaBatida: metaBatida(a),
  }));

  return {
    ...instancia,
    patrimonio,
    metaBatida: aportesComMeta.length > 0 && aportesComMeta.every((a) => a.metaBatida),
    aportes: aportesComMeta,
    resgates,
  };
}

router.get('/', asyncHandler(async (req, res) => {
  const { subgrupo, instanciaId } = req.query;

  const instancias = await prisma.instancia.findMany({
    where: {
      usuarioId: req.usuario.id,
      grupo: 'investimento',
      ativa: true,
      ...(subgrupo && SUBGRUPOS.includes(String(subgrupo)) ? { subgrupo: String(subgrupo) } : {}),
    },
    orderBy: { criadoEm: 'asc' },
  });

  const contas = await Promise.all(instancias.map(montarConta));

  if (instanciaId) {
    return res.json({ contas: contas.filter((c) => c.id === instanciaId) });
  }
  return res.json({ contas });
}));

const aporteSchema = z.object({
  instanciaId: z.string().min(1),
  descricao: z.string().trim().min(1, 'Informe uma descricao.'),
  valor: z.number().positive('O valor precisa ser maior que zero.'),
  tipo: z.enum(['fixo', 'temporario']),
  parcelas: z.number().int().min(1).nullable().optional(),
  mesInicio: z
    .string()
    .regex(/^\d{4}-\d{2}$/, 'Use o formato AAAA-MM.'),
  observacoes: z.string().trim().optional().nullable(),
});

function validarParcelasPorTipo(dados) {
  if (dados.tipo === 'temporario') {
    if (!dados.parcelas || dados.parcelas < 1) {
      return 'Aportes temporarios exigem numero de parcelas (>= 1).';
    }
  } else if (dados.parcelas !== undefined && dados.parcelas !== null) {
    return 'Aportes fixos nao tem numero de parcelas.';
  }
  return null;
}

router.post('/aporte', asyncHandler(async (req, res) => {
  const parsed = aporteSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ erro: parsed.error.issues[0].message });

  const erroParcelas = validarParcelasPorTipo(parsed.data);
  if (erroParcelas) return res.status(400).json({ erro: erroParcelas });

  const instancia = await prisma.instancia.findFirst({
    where: { id: parsed.data.instanciaId, usuarioId: req.usuario.id, grupo: 'investimento' },
  });
  if (!instancia) return res.status(404).json({ erro: 'Conta de reserva nao encontrada.' });

  try {
    parseMes(parsed.data.mesInicio);
  } catch {
    return res.status(400).json({ erro: 'mesInicio invalido.' });
  }

  const mesFim =
    parsed.data.tipo === 'temporario' ? somarMeses(parsed.data.mesInicio, parsed.data.parcelas - 1) : null;

  const aporte = await prisma.lancamento.create({
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
  return res.status(201).json({ aporte: { ...aporte, acumulado: valorAcumuladoAporte(aporte), metaBatida: metaBatida(aporte) } });
}));

router.put('/aporte/:id', asyncHandler(async (req, res) => {
  const parsed = aporteSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ erro: parsed.error.issues[0].message });

  const erroParcelas = validarParcelasPorTipo(parsed.data);
  if (erroParcelas) return res.status(400).json({ erro: erroParcelas });

  const aporte = await prisma.lancamento.findFirst({ where: { id: req.params.id, usuarioId: req.usuario.id } });
  if (!aporte) return res.status(404).json({ erro: 'Aporte nao encontrado.' });

  const mesFim =
    parsed.data.tipo === 'temporario' ? somarMeses(parsed.data.mesInicio, parsed.data.parcelas - 1) : null;

  const atualizado = await prisma.lancamento.update({
    where: { id: aporte.id },
    data: {
      descricao: parsed.data.descricao,
      valor: parsed.data.valor,
      tipo: parsed.data.tipo,
      parcelas: parsed.data.tipo === 'temporario' ? parsed.data.parcelas : null,
      mesInicio: parsed.data.mesInicio,
      mesFim,
      observacoes: parsed.data.observacoes || null,
    },
  });
  return res.json({
    aporte: { ...atualizado, acumulado: valorAcumuladoAporte(atualizado), metaBatida: metaBatida(atualizado) },
  });
}));

router.delete('/aporte/:id', asyncHandler(async (req, res) => {
  const aporte = await prisma.lancamento.findFirst({ where: { id: req.params.id, usuarioId: req.usuario.id } });
  if (!aporte) return res.status(404).json({ erro: 'Aporte nao encontrado.' });

  await prisma.lancamento.delete({ where: { id: aporte.id } });
  return res.json({ ok: true });
}));

const projetoCriarSchema = z.object({
  subgrupo: z.enum(SUBGRUPOS),
  nome: z.string().trim().min(1, 'Informe o nome do projeto.'),
  cor: z.string().trim().min(1, 'Informe uma cor.'),
  valor: z.number().positive('O valor precisa ser maior que zero.'),
  tipo: z.enum(['fixo', 'temporario']),
  parcelas: z.number().int().min(1).nullable().optional(),
  mesInicio: z.string().regex(/^\d{4}-\d{2}$/, 'Use o formato AAAA-MM.'),
  observacoes: z.string().trim().optional().nullable(),
});

router.post('/projeto', asyncHandler(async (req, res) => {
  const parsed = projetoCriarSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ erro: parsed.error.issues[0].message });

  const erroParcelas = validarParcelasPorTipo(parsed.data);
  if (erroParcelas) return res.status(400).json({ erro: erroParcelas });

  try {
    parseMes(parsed.data.mesInicio);
  } catch {
    return res.status(400).json({ erro: 'mesInicio invalido.' });
  }

  const mesFim =
    parsed.data.tipo === 'temporario' ? somarMeses(parsed.data.mesInicio, parsed.data.parcelas - 1) : null;

  const resultado = await prisma.$transaction(async (tx) => {
    const instancia = await tx.instancia.create({
      data: {
        usuarioId: req.usuario.id,
        nome: parsed.data.nome,
        grupo: 'investimento',
        subgrupo: parsed.data.subgrupo,
        cor: parsed.data.cor,
      },
    });
    const aporte = await tx.lancamento.create({
      data: {
        usuarioId: req.usuario.id,
        instanciaId: instancia.id,
        descricao: parsed.data.nome,
        valor: parsed.data.valor,
        tipo: parsed.data.tipo,
        parcelas: parsed.data.tipo === 'temporario' ? parsed.data.parcelas : null,
        mesInicio: parsed.data.mesInicio,
        mesFim,
        observacoes: parsed.data.observacoes || null,
      },
    });
    return { instancia, aporte };
  });

  return res.status(201).json({
    instancia: resultado.instancia,
    aporte: {
      ...resultado.aporte,
      acumulado: valorAcumuladoAporte(resultado.aporte),
      metaBatida: metaBatida(resultado.aporte),
    },
  });
}));

const projetoEditarSchema = z.object({
  aporteId: z.string().min(1),
  nome: z.string().trim().min(1, 'Informe o nome do projeto.'),
  cor: z.string().trim().min(1, 'Informe uma cor.'),
  valor: z.number().positive('O valor precisa ser maior que zero.'),
  tipo: z.enum(['fixo', 'temporario']),
  parcelas: z.number().int().min(1).nullable().optional(),
  mesInicio: z.string().regex(/^\d{4}-\d{2}$/, 'Use o formato AAAA-MM.'),
  observacoes: z.string().trim().optional().nullable(),
});

router.put('/projeto/:instanciaId', asyncHandler(async (req, res) => {
  const parsed = projetoEditarSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ erro: parsed.error.issues[0].message });

  const erroParcelas = validarParcelasPorTipo(parsed.data);
  if (erroParcelas) return res.status(400).json({ erro: erroParcelas });

  const instancia = await prisma.instancia.findFirst({
    where: { id: req.params.instanciaId, usuarioId: req.usuario.id, grupo: 'investimento' },
  });
  if (!instancia) return res.status(404).json({ erro: 'Conta de reserva nao encontrada.' });

  const aporte = await prisma.lancamento.findFirst({
    where: { id: parsed.data.aporteId, usuarioId: req.usuario.id, instanciaId: instancia.id },
  });
  if (!aporte) return res.status(404).json({ erro: 'Aporte nao encontrado.' });

  const mesFim =
    parsed.data.tipo === 'temporario' ? somarMeses(parsed.data.mesInicio, parsed.data.parcelas - 1) : null;

  const resultado = await prisma.$transaction(async (tx) => {
    const instanciaAtualizada = await tx.instancia.update({
      where: { id: instancia.id },
      data: { nome: parsed.data.nome, cor: parsed.data.cor },
    });
    const aporteAtualizado = await tx.lancamento.update({
      where: { id: aporte.id },
      data: {
        descricao: parsed.data.nome,
        valor: parsed.data.valor,
        tipo: parsed.data.tipo,
        parcelas: parsed.data.tipo === 'temporario' ? parsed.data.parcelas : null,
        mesInicio: parsed.data.mesInicio,
        mesFim,
        observacoes: parsed.data.observacoes || null,
      },
    });
    return { instancia: instanciaAtualizada, aporte: aporteAtualizado };
  });

  return res.json({
    instancia: resultado.instancia,
    aporte: {
      ...resultado.aporte,
      acumulado: valorAcumuladoAporte(resultado.aporte),
      metaBatida: metaBatida(resultado.aporte),
    },
  });
}));

const resgateSchema = z.object({
  instanciaId: z.string().min(1),
  descricao: z.string().trim().min(1, 'Informe uma descricao.'),
  valor: z.number().positive('Informe um valor maior que zero.'),
  observacoes: z.string().trim().optional().nullable(),
});

router.post('/resgate', asyncHandler(async (req, res) => {
  const parsed = resgateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ erro: parsed.error.issues[0].message });

  const instancia = await prisma.instancia.findFirst({
    where: { id: parsed.data.instanciaId, usuarioId: req.usuario.id, grupo: 'investimento' },
  });
  if (!instancia) return res.status(404).json({ erro: 'Conta de reserva nao encontrada.' });

  const resgate = await prisma.investimento.create({
    data: { ...parsed.data, valor: -Math.abs(parsed.data.valor), usuarioId: req.usuario.id, observacoes: parsed.data.observacoes || null },
  });
  return res.status(201).json({ resgate });
}));

router.delete('/resgate/:id', asyncHandler(async (req, res) => {
  const resgate = await prisma.investimento.findFirst({ where: { id: req.params.id, usuarioId: req.usuario.id } });
  if (!resgate) return res.status(404).json({ erro: 'Resgate nao encontrado.' });

  await prisma.investimento.delete({ where: { id: resgate.id } });
  return res.json({ ok: true });
}));

const atualizarValorSchema = z.object({
  valorAtual: z.number().min(0, 'Informe um valor valido.'),
  descricao: z.string().trim().optional(),
});

router.post('/:id/atualizar-valor', asyncHandler(async (req, res) => {
  const parsed = atualizarValorSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ erro: parsed.error.issues[0].message });

  const instancia = await prisma.instancia.findFirst({
    where: { id: req.params.id, usuarioId: req.usuario.id, grupo: 'investimento' },
  });
  if (!instancia) return res.status(404).json({ erro: 'Conta de reserva nao encontrada.' });

  const conta = await montarConta(instancia);
  const diferenca = parsed.data.valorAtual - conta.patrimonio;

  if (Math.abs(diferenca) < EPS) {
    return res.json({ ajuste: null, patrimonio: conta.patrimonio });
  }

  const ref = mesAtual();

  if (diferenca > 0) {
    const aporte = await prisma.lancamento.create({
      data: {
        usuarioId: req.usuario.id,
        instanciaId: instancia.id,
        descricao: parsed.data.descricao?.trim() || 'Rendimento',
        valor: diferenca,
        tipo: 'temporario',
        parcelas: 1,
        mesInicio: ref,
        mesFim: ref,
        observacoes: 'Ajuste de valor atualizado pelo usuario.',
      },
    });
    return res.status(201).json({
      ajuste: { tipo: 'aporte', aporte: { ...aporte, acumulado: valorAcumuladoAporte(aporte), metaBatida: metaBatida(aporte) } },
      patrimonio: conta.patrimonio + diferenca,
    });
  }

  const resgate = await prisma.investimento.create({
    data: {
      usuarioId: req.usuario.id,
      instanciaId: instancia.id,
      descricao: parsed.data.descricao?.trim() || 'Ajuste',
      valor: diferenca,
      observacoes: 'Ajuste de valor atualizado pelo usuario.',
    },
  });
  return res.status(201).json({ ajuste: { tipo: 'resgate', resgate }, patrimonio: conta.patrimonio + diferenca });
}));

// "Concluir projeto" (arquiva, preservando historico) e "continuar juntando" (edicao
// do aporte, ja coberto por PUT /aporte/:id) sao cobertos por rotas ja existentes:
// PATCH /api/instancias/:id/ativa arquiva/reativa a instancia.

const migrarSchema = z.object({
  instanciaOrigemId: z.string().min(1),
  instanciaDestinoId: z.string().min(1),
});

router.post('/migrar', asyncHandler(async (req, res) => {
  const parsed = migrarSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ erro: parsed.error.issues[0].message });

  const [origem, destino] = await Promise.all([
    prisma.instancia.findFirst({
      where: { id: parsed.data.instanciaOrigemId, usuarioId: req.usuario.id, grupo: 'investimento', subgrupo: 'pessoal' },
    }),
    prisma.instancia.findFirst({
      where: { id: parsed.data.instanciaDestinoId, usuarioId: req.usuario.id, grupo: 'investimento', subgrupo: 'patrimonial' },
    }),
  ]);
  if (!origem) return res.status(404).json({ erro: 'Reserva pessoal de origem nao encontrada.' });
  if (!destino) return res.status(404).json({ erro: 'Reserva patrimonial de destino nao encontrada.' });

  const conta = await montarConta(origem);
  if (conta.patrimonio <= 0) {
    return res.status(400).json({ erro: 'Nao ha valor acumulado para migrar.' });
  }

  const ref = mesAtual();
  const resultado = await prisma.$transaction(async (tx) => {
    const transferencia = await tx.lancamento.create({
      data: {
        usuarioId: req.usuario.id,
        instanciaId: destino.id,
        descricao: `Migrado de "${origem.nome}"`,
        valor: conta.patrimonio,
        tipo: 'temporario',
        parcelas: 1,
        mesInicio: ref,
        mesFim: ref,
        observacoes: 'Transferencia entre reservas.',
      },
    });
    const origemArquivada = await tx.instancia.update({ where: { id: origem.id }, data: { ativa: false } });
    return { transferencia, origemArquivada };
  });

  return res.status(201).json(resultado);
}));

module.exports = router;

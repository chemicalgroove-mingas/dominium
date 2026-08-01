const express = require('express');
const { z } = require('zod');
const prisma = require('../lib/prisma');
const { autenticar, exigirRole } = require('../middleware/auth');
const { somarMeses, mesAtual, ultimoDiaDoMes, compararMeses } = require('../utils/mes');
const { asyncHandler } = require('../utils/asyncHandler');

const router = express.Router();
router.use(autenticar, exigirRole('USER'));

const mesSchema = z.string().regex(/^\d{4}-\d{2}$/, 'Use o formato AAAA-MM.');
const EPS = 0.005;

function estaVigente(lancamento, ref) {
  if (!lancamento.ativo) return false;
  if (compararMeses(lancamento.mesInicio, ref) > 0) return false;
  if (lancamento.tipo === 'temporario' && compararMeses(ref, lancamento.mesFim) > 0) return false;
  return true;
}

// Todos os lancamentos vigentes da instancia nesta referencia, com status de
// pagamento (paga instancias inteiras nao somem mais da tela — ficam marcadas).
async function itensDaInstancia(instancia, ref) {
  const lancamentos = await prisma.lancamento.findMany({
    where: { instanciaId: instancia.id, usuarioId: instancia.usuarioId },
  });

  const itens = [];
  for (const lancamento of lancamentos) {
    if (!estaVigente(lancamento, ref)) continue;
    const pagamentos = await prisma.pagamento.findMany({
      where: { lancamentoId: lancamento.id, mesReferencia: ref },
    });
    const pago = pagamentos.length > 0;
    itens.push({
      lancamentoId: lancamento.id,
      descricao: lancamento.descricao,
      valor: lancamento.valor,
      tipo: lancamento.tipo,
      pago,
      valorPago: pago ? pagamentos.reduce((acc, p) => acc + p.valorPago, 0) : null,
    });
  }
  return itens;
}

function itensEmAberto(itens) {
  return itens.filter((i) => !i.pago);
}

router.get('/em-aberto', asyncHandler(async (req, res) => {
  const ref = req.query.mesReferencia && mesSchema.safeParse(req.query.mesReferencia).success
    ? String(req.query.mesReferencia)
    : mesAtual();

  const instancias = await prisma.instancia.findMany({
    where: { usuarioId: req.usuario.id, grupo: 'gasto', ativa: true },
    orderBy: { criadoEm: 'asc' },
  });

  const resultado = [];
  for (const instancia of instancias) {
    const itens = await itensDaInstancia(instancia, ref);
    if (itens.length === 0) continue;
    resultado.push({
      id: instancia.id,
      nome: instancia.nome,
      cor: instancia.cor,
      totalAberto: itensEmAberto(itens).reduce((acc, i) => acc + i.valor, 0),
      itens,
    });
  }

  const vencimento = ultimoDiaDoMes(ref);
  const emAtraso = new Date() > vencimento;

  return res.json({ mesReferencia: ref, vencimento: vencimento.toISOString(), emAtraso, instancias: resultado });
}));

async function verificarDuplicidade(lancamentoIds, mesReferencia, confirmarDuplicado) {
  if (confirmarDuplicado) return null;
  const existentes = await prisma.pagamento.findMany({
    where: { lancamentoId: { in: lancamentoIds }, mesReferencia },
  });
  if (existentes.length > 0) {
    return 'Já há pagamento registrado nesta referência para um ou mais itens selecionados.';
  }
  return null;
}

router.post('/total', asyncHandler(async (req, res) => {
  const schema = z.object({
    instanciaId: z.string().min(1),
    mesReferencia: mesSchema,
    confirmarDuplicado: z.boolean().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ erro: parsed.error.issues[0].message });

  const instancia = await prisma.instancia.findFirst({
    where: { id: parsed.data.instanciaId, usuarioId: req.usuario.id, grupo: 'gasto' },
  });
  if (!instancia) return res.status(404).json({ erro: 'Instancia nao encontrada.' });

  const itens = itensEmAberto(await itensDaInstancia(instancia, parsed.data.mesReferencia));
  if (itens.length === 0) return res.status(400).json({ erro: 'Nao ha debitos em aberto nesta referencia.' });

  const avisoDuplicidade = await verificarDuplicidade(
    itens.map((i) => i.lancamentoId),
    parsed.data.mesReferencia,
    parsed.data.confirmarDuplicado
  );
  if (avisoDuplicidade) return res.status(409).json({ erro: avisoDuplicidade, precisaConfirmar: true });

  const pagamentos = await prisma.$transaction(
    itens.map((item) =>
      prisma.pagamento.create({
        data: {
          usuarioId: req.usuario.id,
          instanciaId: instancia.id,
          lancamentoId: item.lancamentoId,
          mesReferencia: parsed.data.mesReferencia,
          valorPago: item.valor,
          tipo: 'total',
        },
      })
    )
  );
  return res.status(201).json({ pagamentos });
}));

router.post('/selecionados', asyncHandler(async (req, res) => {
  const schema = z.object({
    instanciaId: z.string().min(1),
    mesReferencia: mesSchema,
    lancamentoIds: z.array(z.string()).min(1, 'Selecione ao menos um item.'),
    confirmarDuplicado: z.boolean().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ erro: parsed.error.issues[0].message });

  const instancia = await prisma.instancia.findFirst({
    where: { id: parsed.data.instanciaId, usuarioId: req.usuario.id, grupo: 'gasto' },
  });
  if (!instancia) return res.status(404).json({ erro: 'Instancia nao encontrada.' });

  const itensAbertos = itensEmAberto(await itensDaInstancia(instancia, parsed.data.mesReferencia));
  const selecionados = itensAbertos.filter((i) => parsed.data.lancamentoIds.includes(i.lancamentoId));
  if (selecionados.length === 0) {
    return res.status(400).json({ erro: 'Os itens selecionados nao estao em aberto nesta referencia.' });
  }

  const avisoDuplicidade = await verificarDuplicidade(
    selecionados.map((i) => i.lancamentoId),
    parsed.data.mesReferencia,
    parsed.data.confirmarDuplicado
  );
  if (avisoDuplicidade) return res.status(409).json({ erro: avisoDuplicidade, precisaConfirmar: true });

  const pagamentos = await prisma.$transaction(
    selecionados.map((item) =>
      prisma.pagamento.create({
        data: {
          usuarioId: req.usuario.id,
          instanciaId: instancia.id,
          lancamentoId: item.lancamentoId,
          mesReferencia: parsed.data.mesReferencia,
          valorPago: item.valor,
          tipo: 'selecionado',
        },
      })
    )
  );
  return res.status(201).json({ pagamentos });
}));

router.post('/outro-valor', asyncHandler(async (req, res) => {
  const schema = z.object({
    instanciaId: z.string().min(1),
    mesReferencia: mesSchema,
    lancamentoId: z.string().min(1),
    valor: z.number().positive('Informe um valor maior que zero.'),
    descricao: z.string().trim().min(1).default('Multa/Juros'),
    confirmarDuplicado: z.boolean().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ erro: parsed.error.issues[0].message });

  const instancia = await prisma.instancia.findFirst({
    where: { id: parsed.data.instanciaId, usuarioId: req.usuario.id, grupo: 'gasto' },
  });
  if (!instancia) return res.status(404).json({ erro: 'Instancia nao encontrada.' });

  const lancamento = await prisma.lancamento.findFirst({
    where: { id: parsed.data.lancamentoId, instanciaId: instancia.id, usuarioId: req.usuario.id },
  });
  if (!lancamento) return res.status(404).json({ erro: 'Lancamento nao encontrado.' });

  const avisoDuplicidade = await verificarDuplicidade(
    [lancamento.id],
    parsed.data.mesReferencia,
    parsed.data.confirmarDuplicado
  );
  if (avisoDuplicidade) return res.status(409).json({ erro: avisoDuplicidade, precisaConfirmar: true });

  const devido = lancamento.valor;
  const { valor, descricao, mesReferencia } = parsed.data;

  const resultado = await prisma.$transaction(async (tx) => {
    if (Math.abs(valor - devido) < EPS) {
      const pagamento = await tx.pagamento.create({
        data: {
          usuarioId: req.usuario.id,
          instanciaId: instancia.id,
          lancamentoId: lancamento.id,
          mesReferencia,
          valorPago: valor,
          tipo: 'total',
          observacoes: descricao,
        },
      });
      return { ramo: 'igual', pagamento };
    }

    if (valor > devido) {
      const pagamento = await tx.pagamento.create({
        data: {
          usuarioId: req.usuario.id,
          instanciaId: instancia.id,
          lancamentoId: lancamento.id,
          mesReferencia,
          valorPago: devido,
          tipo: 'total',
        },
      });
      const excedente = valor - devido;
      const lancamentoAvulso = await tx.lancamento.create({
        data: {
          usuarioId: req.usuario.id,
          instanciaId: instancia.id,
          descricao,
          valor: excedente,
          tipo: 'temporario',
          parcelas: 1,
          mesInicio: mesReferencia,
          mesFim: mesReferencia,
          criadoPorPagamentoId: pagamento.id,
        },
      });
      const pagamentoAvulso = await tx.pagamento.create({
        data: {
          usuarioId: req.usuario.id,
          instanciaId: instancia.id,
          lancamentoId: lancamentoAvulso.id,
          mesReferencia,
          valorPago: excedente,
          tipo: 'avulso',
          observacoes: descricao,
        },
      });
      return { ramo: 'excedente', pagamento, lancamentoAvulso, pagamentoAvulso };
    }

    // valor < devido: quita parcial e gera pendencia no mes seguinte
    const pagamento = await tx.pagamento.create({
      data: {
        usuarioId: req.usuario.id,
        instanciaId: instancia.id,
        lancamentoId: lancamento.id,
        mesReferencia,
        valorPago: valor,
        tipo: 'parcial',
        observacoes: descricao,
      },
    });
    const diferenca = devido - valor;
    const mesSeguinte = somarMeses(mesReferencia, 1);
    const pendencia = await tx.lancamento.create({
      data: {
        usuarioId: req.usuario.id,
        instanciaId: instancia.id,
        descricao: `Pendência: ${lancamento.descricao}`,
        valor: diferenca,
        tipo: 'temporario',
        parcelas: 1,
        mesInicio: mesSeguinte,
        mesFim: mesSeguinte,
        observacoes: 'Gerado automaticamente por pagamento parcial.',
        criadoPorPagamentoId: pagamento.id,
      },
    });
    return { ramo: 'parcial', pagamento, pendencia };
  });

  return res.status(201).json(resultado);
}));

// Apaga, em cadeia, qualquer lancamento avulso/pendencia gerado automaticamente
// por um dos pagamentos revertidos (e os pagamentos que esses gerados tiverem).
async function apagarCadeiaGerada(tx, pagamentoIds) {
  if (pagamentoIds.length === 0) return;
  const gerados = await tx.lancamento.findMany({ where: { criadoPorPagamentoId: { in: pagamentoIds } } });
  if (gerados.length === 0) return;
  const geradosIds = gerados.map((l) => l.id);
  const pagamentosDosGerados = await tx.pagamento.findMany({ where: { lancamentoId: { in: geradosIds } } });
  await tx.pagamento.deleteMany({ where: { lancamentoId: { in: geradosIds } } });
  await tx.lancamento.deleteMany({ where: { id: { in: geradosIds } } });
  await apagarCadeiaGerada(tx, pagamentosDosGerados.map((p) => p.id));
}

router.post('/reverter', asyncHandler(async (req, res) => {
  const schema = z.object({
    lancamentoId: z.string().min(1),
    mesReferencia: mesSchema,
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ erro: parsed.error.issues[0].message });

  const lancamento = await prisma.lancamento.findFirst({
    where: { id: parsed.data.lancamentoId, usuarioId: req.usuario.id },
  });
  if (!lancamento) return res.status(404).json({ erro: 'Lancamento nao encontrado.' });

  const pagamentos = await prisma.pagamento.findMany({
    where: { lancamentoId: lancamento.id, mesReferencia: parsed.data.mesReferencia },
  });
  if (pagamentos.length === 0) {
    return res.status(400).json({ erro: 'Nao ha pagamento registrado nesta referencia.' });
  }

  await prisma.$transaction(async (tx) => {
    await apagarCadeiaGerada(tx, pagamentos.map((p) => p.id));
    await tx.pagamento.deleteMany({
      where: { lancamentoId: lancamento.id, mesReferencia: parsed.data.mesReferencia },
    });
  });

  return res.json({ ok: true });
}));

module.exports = router;

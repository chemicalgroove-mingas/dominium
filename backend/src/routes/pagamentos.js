const express = require('express');
const { z } = require('zod');
const prisma = require('../lib/prisma');
const { autenticar, exigirRole } = require('../middleware/auth');
const { somarMeses, mesAtual, ultimoDiaDoMes, compararMeses } = require('../utils/mes');
const { asyncHandler } = require('../utils/asyncHandler');
const { ordenarPorContexto } = require('../utils/ordenacaoInstancia');

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

  const instanciasBrutas = await prisma.instancia.findMany({
    where: { usuarioId: req.usuario.id, grupo: 'gasto', ativa: true },
    orderBy: { criadoEm: 'asc' },
    include: { ordenacoes: { where: { contexto: 'pagamentos' } } },
  });
  const instancias = ordenarPorContexto(instanciasBrutas, 'pagamentos');

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

// "Outro valor" agora se aplica a fatura inteira da instancia (todos os itens em
// aberto na referencia), nao a um lancamento isolado — o cenario real e nao
// conseguir pagar a fatura do cartao inteira, nao uma compra especifica.
router.post('/outro-valor', asyncHandler(async (req, res) => {
  const schema = z.object({
    instanciaId: z.string().min(1),
    mesReferencia: mesSchema,
    valor: z.number().positive('Informe um valor maior que zero.'),
    descricao: z.string().trim().min(1).default('Ajuste'),
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

  const devido = Math.round(itens.reduce((acc, i) => acc + i.valor, 0) * 100) / 100;
  const { valor, descricao, mesReferencia } = parsed.data;

  const resultado = await prisma.$transaction(async (tx) => {
    if (Math.abs(valor - devido) < EPS) {
      const pagamentos = [];
      for (const item of itens) {
        pagamentos.push(
          await tx.pagamento.create({
            data: {
              usuarioId: req.usuario.id,
              instanciaId: instancia.id,
              lancamentoId: item.lancamentoId,
              mesReferencia,
              valorPago: item.valor,
              tipo: 'total',
              observacoes: descricao,
            },
          })
        );
      }
      return { ramo: 'igual', pagamentos };
    }

    if (valor > devido) {
      const pagamentos = [];
      for (const item of itens) {
        pagamentos.push(
          await tx.pagamento.create({
            data: {
              usuarioId: req.usuario.id,
              instanciaId: instancia.id,
              lancamentoId: item.lancamentoId,
              mesReferencia,
              valorPago: item.valor,
              tipo: 'total',
            },
          })
        );
      }
      const excedente = Math.round((valor - devido) * 100) / 100;
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
          criadoPorPagamentoId: pagamentos[0].id,
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
      return { ramo: 'excedente', pagamentos, lancamentoAvulso, pagamentoAvulso };
    }

    // valor < devido: paga os itens inteiros, em ordem, ate o dinheiro acabar.
    // O item em que o dinheiro estoura fica parcial e gera pendencia no mes
    // seguinte (igual ao caso de um item so); os itens seguintes ficam em
    // aberto, sem nenhum pagamento criado, disponiveis pra quitar depois.
    let restante = valor;
    const pagamentos = [];
    let pendencia = null;
    for (const item of itens) {
      if (restante <= EPS) break;
      if (restante + EPS >= item.valor) {
        pagamentos.push(
          await tx.pagamento.create({
            data: {
              usuarioId: req.usuario.id,
              instanciaId: instancia.id,
              lancamentoId: item.lancamentoId,
              mesReferencia,
              valorPago: item.valor,
              tipo: 'total',
            },
          })
        );
        restante = Math.round((restante - item.valor) * 100) / 100;
      } else {
        const pagamentoParcial = await tx.pagamento.create({
          data: {
            usuarioId: req.usuario.id,
            instanciaId: instancia.id,
            lancamentoId: item.lancamentoId,
            mesReferencia,
            valorPago: restante,
            tipo: 'parcial',
            observacoes: descricao,
          },
        });
        pagamentos.push(pagamentoParcial);
        const diferenca = Math.round((item.valor - restante) * 100) / 100;
        const mesSeguinte = somarMeses(mesReferencia, 1);
        pendencia = await tx.lancamento.create({
          data: {
            usuarioId: req.usuario.id,
            instanciaId: instancia.id,
            descricao: `Pendência: ${item.descricao}`,
            valor: diferenca,
            tipo: 'temporario',
            parcelas: 1,
            mesInicio: mesSeguinte,
            mesFim: mesSeguinte,
            observacoes: 'Gerado automaticamente por pagamento parcial.',
            criadoPorPagamentoId: pagamentoParcial.id,
          },
        });
        restante = 0;
      }
    }
    return { ramo: 'parcial', pagamentos, pendencia };
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

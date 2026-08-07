const express = require('express');
const { z } = require('zod');
const { Prisma } = require('@prisma/client');
const prisma = require('../lib/prisma');
const { autenticar, exigirRole } = require('../middleware/auth');
const { asyncHandler } = require('../utils/asyncHandler');
const { mesAtual, somarMeses, parseMes } = require('../utils/mes');
const { ordenarPorContexto, colunaDoContexto, criarOrdenacoesIniciais } = require('../utils/ordenacaoInstancia');
const {
  valorAcumuladoAporte,
  parcelasDecorridas,
  metaBatida,
  proximaParcelaValor,
  parcelasRestantesComValor,
  ultimaParcelaEfetiva,
} = require('../utils/patrimonio');
const { EPS, calcularPlanoTemporario } = require('../utils/parcelamento');

const router = express.Router();
router.use(autenticar, exigirRole('USER'));

const SUBGRUPOS = ['pessoal', 'patrimonial'];

async function montarConta(instancia) {
  const [aportes, resgates] = await Promise.all([
    prisma.lancamento.findMany({
      where: { instanciaId: instancia.id },
      orderBy: { criadoEm: 'desc' },
      include: { valoresExtras: { orderBy: { criadoEm: 'desc' } } },
    }),
    prisma.investimento.findMany({ where: { instanciaId: instancia.id }, orderBy: { criadoEm: 'desc' } }),
  ]);

  const acumuladoAportes = aportes.reduce((acc, a) => acc + valorAcumuladoAporte(a), 0);
  const acumuladoResgates = resgates.reduce((acc, r) => acc + r.valor, 0);
  const patrimonio = acumuladoAportes + acumuladoResgates;

  const aportesComMeta = aportes.map((a) => ({
    ...a,
    acumulado: valorAcumuladoAporte(a),
    parcelasDecorridas: parcelasDecorridas(a),
    parcelasRestantesComValor: parcelasRestantesComValor(a),
    proximaParcela: proximaParcelaValor(a),
    ultimaParcela: ultimaParcelaEfetiva(a),
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

  const instanciasBrutas = await prisma.instancia.findMany({
    where: {
      usuarioId: req.usuario.id,
      grupo: 'investimento',
      ativa: true,
      ...(subgrupo && SUBGRUPOS.includes(String(subgrupo)) ? { subgrupo: String(subgrupo) } : {}),
    },
    orderBy: { criadoEm: 'asc' },
    include: { ordenacoes: { where: { contexto: 'reserva' } } },
  });
  const instancias = ordenarPorContexto(instanciasBrutas, 'reserva').map((i) => {
    const { ordenacoes, ...instancia } = i;
    return { ...instancia, coluna: colunaDoContexto(i, 'reserva') };
  });

  const contas = await Promise.all(instancias.map(montarConta));

  if (instanciaId) {
    return res.json({ contas: contas.filter((c) => c.id === instanciaId) });
  }
  return res.json({ contas });
}));

const aporteSchema = z.object({
  id: z.string().uuid().optional(),
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

  const dadosCriacao = {
    usuarioId: req.usuario.id,
    instanciaId: parsed.data.instanciaId,
    descricao: parsed.data.descricao,
    valor: parsed.data.valor,
    tipo: parsed.data.tipo,
    parcelas: parsed.data.tipo === 'temporario' ? parsed.data.parcelas : null,
    mesInicio: parsed.data.mesInicio,
    mesFim,
    observacoes: parsed.data.observacoes || null,
  };
  if (parsed.data.id) {
    dadosCriacao.id = parsed.data.id;
  }

  // Mesmo padrao de backend/src/routes/lancamentos.js: id opcional gerado no
  // cliente (fila offline) + retry idempotente via unique constraint do id.
  let aporte;
  try {
    aporte = await prisma.lancamento.create({ data: dadosCriacao });
  } catch (err) {
    if (parsed.data.id && err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const existente = await prisma.lancamento.findFirst({
        where: { id: parsed.data.id, usuarioId: req.usuario.id },
      });
      if (existente) {
        return res
          .status(200)
          .json({ aporte: { ...existente, acumulado: valorAcumuladoAporte(existente), metaBatida: metaBatida(existente) } });
      }
    }
    throw err;
  }
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

const abaterSchema = z.object({
  valor: z.number().positive('Informe um valor maior que zero.'),
  descricao: z.string().trim().optional(),
});

// "Lancar Valor Extra" num projeto com meta: em vez de criar um lancamento com
// cronograma proprio, o valor abate diretamente das parcelas finais da meta (da
// ultima pra primeira), acelerando o alcance do objetivo. Cada lancamento fica
// registrado individualmente (ValorExtra) para dar visibilidade do esforco.
router.post('/aporte/:id/abater', asyncHandler(async (req, res) => {
  const parsed = abaterSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ erro: parsed.error.issues[0].message });

  const aporte = await prisma.lancamento.findFirst({ where: { id: req.params.id, usuarioId: req.usuario.id } });
  if (!aporte) return res.status(404).json({ erro: 'Aporte nao encontrado.' });
  if (aporte.tipo !== 'temporario' || aporte.valorMeta == null) {
    return res.status(400).json({ erro: 'Este aporte nao tem meta definida para abater valor.' });
  }

  const [, atualizado] = await prisma.$transaction([
    prisma.valorExtra.create({
      data: { lancamentoId: aporte.id, valor: parsed.data.valor, descricao: parsed.data.descricao || null },
    }),
    prisma.lancamento.update({
      where: { id: aporte.id },
      data: { valorAbatido: { increment: parsed.data.valor } },
      include: { valoresExtras: { orderBy: { criadoEm: 'desc' } } },
    }),
  ]);

  return res.status(201).json({
    aporte: {
      ...atualizado,
      acumulado: valorAcumuladoAporte(atualizado),
      parcelasDecorridas: parcelasDecorridas(atualizado),
      metaBatida: metaBatida(atualizado),
    },
  });
}));

// "Reduzir Valor da Parcela": em vez de abater do fim pra tras (mantendo o
// valor da parcela e encolhendo o prazo), recalcula um novo valor uniforme
// para as parcelas restantes, mantendo a quantidade de parcelas que faltava
// no momento do lancamento. O passado (ja decorrido) fica congelado em
// valorBaseAcumulado; o cronograma reinicia no proximo mes ainda nao
// decorrido, com o novo valor.
router.post('/aporte/:id/recalcular', asyncHandler(async (req, res) => {
  const parsed = abaterSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ erro: parsed.error.issues[0].message });

  const aporte = await prisma.lancamento.findFirst({ where: { id: req.params.id, usuarioId: req.usuario.id } });
  if (!aporte) return res.status(404).json({ erro: 'Aporte nao encontrado.' });
  if (aporte.tipo !== 'temporario' || aporte.valorMeta == null) {
    return res.status(400).json({ erro: 'Este aporte nao tem meta definida para recalcular.' });
  }

  const n = parcelasRestantesComValor(aporte);
  if (!n || n < 1) {
    return res.status(400).json({ erro: 'Nao ha parcelas restantes para recalcular.' });
  }

  const acumuladoAntes = valorAcumuladoAporte(aporte);
  const novoAcumulado = Math.round((acumuladoAntes + parsed.data.valor) * 100) / 100;
  const restante = Math.max(0, Math.round((aporte.valorMeta - novoAcumulado) * 100) / 100);
  const novoValorParcela = Math.floor((restante / n) * 100) / 100;
  const novaUltimaParcela = Math.round((restante - novoValorParcela * (n - 1)) * 100) / 100;
  const novoMesInicio = somarMeses(mesAtual(), 1);
  const novoMesFim = somarMeses(novoMesInicio, n - 1);

  const [, atualizado] = await prisma.$transaction([
    prisma.valorExtra.create({
      data: {
        lancamentoId: aporte.id,
        valor: parsed.data.valor,
        descricao: parsed.data.descricao || null,
        viaRecalculo: true,
      },
    }),
    prisma.lancamento.update({
      where: { id: aporte.id },
      data: {
        mesInicio: novoMesInicio,
        mesFim: novoMesFim,
        parcelas: n,
        valor: novoValorParcela,
        valorUltimaParcela: novaUltimaParcela,
        valorAbatido: 0,
        valorBaseAcumulado: novoAcumulado,
      },
      include: { valoresExtras: { orderBy: { criadoEm: 'desc' } } },
    }),
  ]);

  return res.status(201).json({
    aporte: {
      ...atualizado,
      acumulado: valorAcumuladoAporte(atualizado),
      parcelasDecorridas: parcelasDecorridas(atualizado),
      parcelasRestantesComValor: parcelasRestantesComValor(atualizado),
      proximaParcela: proximaParcelaValor(atualizado),
      ultimaParcela: ultimaParcelaEfetiva(atualizado),
      metaBatida: metaBatida(atualizado),
    },
  });
}));

// Reverte um valor extra individual: apaga o registro e desfaz o abatimento
// correspondente (soma de volta nas parcelas finais). Nao permitido para
// valores aplicados via recalculo (ver rota acima) — o cronograma inteiro foi
// reescrito, entao a correcao certa e revisar o projeto, nao desfazer isolado.
router.delete('/valor-extra/:id', asyncHandler(async (req, res) => {
  const extra = await prisma.valorExtra.findFirst({
    where: { id: req.params.id, lancamento: { usuarioId: req.usuario.id } },
  });
  if (!extra) return res.status(404).json({ erro: 'Valor extra nao encontrado.' });
  if (extra.viaRecalculo) {
    return res.status(400).json({
      erro: 'Este valor foi aplicado via recalculo do projeto. Para ajustar, revise o projeto (lapis) em vez de remover este item.',
    });
  }

  const [, atualizado] = await prisma.$transaction([
    prisma.valorExtra.delete({ where: { id: extra.id } }),
    prisma.lancamento.update({
      where: { id: extra.lancamentoId },
      data: { valorAbatido: { decrement: extra.valor } },
      include: { valoresExtras: { orderBy: { criadoEm: 'desc' } } },
    }),
  ]);

  return res.json({
    aporte: {
      ...atualizado,
      acumulado: valorAcumuladoAporte(atualizado),
      parcelasDecorridas: parcelasDecorridas(atualizado),
      metaBatida: metaBatida(atualizado),
    },
  });
}));

const projetoBaseSchema = z.object({
  subgrupo: z.enum(SUBGRUPOS),
  nome: z.string().trim().min(1, 'Informe o nome do projeto.'),
  cor: z.string().trim().min(1, 'Informe uma cor.'),
  tipo: z.enum(['fixo', 'temporario']),
  valor: z.number().positive().optional(),
  valorMeta: z.number().positive().optional(),
  prazoMeses: z.number().int().min(1).optional(),
  mesInicio: z.string().regex(/^\d{4}-\d{2}$/, 'Use o formato AAAA-MM.'),
  observacoes: z.string().trim().optional().nullable(),
});

const projetoEditarSchema = projetoBaseSchema.extend({ aporteId: z.string().min(1) });

// Fixo: so exige o valor da parcela (indefinido, sem meta). Temporario: exige a meta
// e exatamente um entre valor da parcela OU prazo em meses (o outro e calculado).
function validarProjeto(dados) {
  if (dados.tipo === 'fixo') {
    if (!dados.valor || dados.valor <= 0) return 'Informe o valor da parcela.';
    if (dados.valorMeta || dados.prazoMeses) return 'Projetos fixos nao tem meta ou prazo definido.';
    return null;
  }
  if (!dados.valorMeta || dados.valorMeta <= 0) return 'Informe o valor da meta.';
  const temValor = Boolean(dados.valor);
  const temPrazo = Boolean(dados.prazoMeses);
  if (temValor === temPrazo) return 'Informe o valor da parcela OU o prazo em meses (nao os dois).';
  return null;
}

function montarDadosAporte(dados) {
  if (dados.tipo === 'fixo') {
    return {
      valor: dados.valor,
      parcelas: null,
      mesFim: null,
      valorMeta: null,
      valorUltimaParcela: null,
    };
  }
  const plano = calcularPlanoTemporario(dados);
  return {
    valor: plano.valorParcela,
    parcelas: plano.parcelas,
    mesFim: somarMeses(dados.mesInicio, plano.parcelas - 1),
    valorMeta: dados.valorMeta,
    valorUltimaParcela: plano.valorUltimaParcela,
  };
}

router.post('/projeto', asyncHandler(async (req, res) => {
  const parsed = projetoBaseSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ erro: parsed.error.issues[0].message });

  const erroProjeto = validarProjeto(parsed.data);
  if (erroProjeto) return res.status(400).json({ erro: erroProjeto });

  try {
    parseMes(parsed.data.mesInicio);
  } catch {
    return res.status(400).json({ erro: 'mesInicio invalido.' });
  }

  const dadosAporte = montarDadosAporte(parsed.data);

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
        tipo: parsed.data.tipo,
        mesInicio: parsed.data.mesInicio,
        observacoes: parsed.data.observacoes || null,
        ...dadosAporte,
      },
    });
    await criarOrdenacoesIniciais(tx, instancia);
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

router.put('/projeto/:instanciaId', asyncHandler(async (req, res) => {
  const parsed = projetoEditarSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ erro: parsed.error.issues[0].message });

  const erroProjeto = validarProjeto(parsed.data);
  if (erroProjeto) return res.status(400).json({ erro: erroProjeto });

  const instancia = await prisma.instancia.findFirst({
    where: { id: req.params.instanciaId, usuarioId: req.usuario.id, grupo: 'investimento' },
  });
  if (!instancia) return res.status(404).json({ erro: 'Conta de reserva nao encontrada.' });

  const aporte = await prisma.lancamento.findFirst({
    where: { id: parsed.data.aporteId, usuarioId: req.usuario.id, instanciaId: instancia.id },
  });
  if (!aporte) return res.status(404).json({ erro: 'Aporte nao encontrado.' });

  const dadosAporte = montarDadosAporte(parsed.data);

  const resultado = await prisma.$transaction(async (tx) => {
    const instanciaAtualizada = await tx.instancia.update({
      where: { id: instancia.id },
      data: { nome: parsed.data.nome, cor: parsed.data.cor },
    });
    const aporteAtualizado = await tx.lancamento.update({
      where: { id: aporte.id },
      data: {
        descricao: parsed.data.nome,
        tipo: parsed.data.tipo,
        mesInicio: parsed.data.mesInicio,
        observacoes: parsed.data.observacoes || null,
        ...dadosAporte,
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
  id: z.string().uuid().optional(),
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

  const dadosCriacao = {
    instanciaId: parsed.data.instanciaId,
    descricao: parsed.data.descricao,
    valor: -Math.abs(parsed.data.valor),
    usuarioId: req.usuario.id,
    observacoes: parsed.data.observacoes || null,
  };
  if (parsed.data.id) {
    dadosCriacao.id = parsed.data.id;
  }

  // Mesmo padrao de idempotencia via id opcional + retry em P2002 usado no
  // aporte/lancamento — critico aqui porque resgate mexe em patrimonio: um
  // retry apos queda de conexao NUNCA pode sacar duas vezes.
  let resgate;
  try {
    resgate = await prisma.investimento.create({ data: dadosCriacao });
  } catch (err) {
    if (parsed.data.id && err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const existente = await prisma.investimento.findFirst({
        where: { id: parsed.data.id, usuarioId: req.usuario.id },
      });
      if (existente) {
        return res.status(200).json({ resgate: existente });
      }
    }
    throw err;
  }
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
  const aporteMeta = conta.aportes.find((a) => a.tipo === 'temporario' && a.valorMeta != null);

  if (aporteMeta) {
    // Rendimento ou perda abate/acrescenta as parcelas finais da meta (igual
    // "Lancar Valor Extra", nos dois sentidos) — nao cria lancamento avulso a
    // parte: positivo diminui as ultimas parcelas, negativo aumenta a ultima.
    // valorRendimento e um contador acumulado a parte (nao um ValorExtra
    // individual): atualizacoes repetidas so somam/subtraem nele, sem poluir
    // a lista de valores extras lancados manualmente.
    const atualizado = await prisma.lancamento.update({
      where: { id: aporteMeta.id },
      data: {
        valorAbatido: { increment: diferenca },
        valorRendimento: { increment: diferenca },
      },
      include: { valoresExtras: { orderBy: { criadoEm: 'desc' } } },
    });
    return res.status(201).json({
      ajuste: {
        tipo: 'abatimento',
        aporte: {
          ...atualizado,
          acumulado: valorAcumuladoAporte(atualizado),
          metaBatida: metaBatida(atualizado),
        },
      },
      patrimonio: conta.patrimonio + diferenca,
    });
  }

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

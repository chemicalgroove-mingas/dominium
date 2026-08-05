const express = require('express');
const { z } = require('zod');
const { Prisma } = require('@prisma/client');
const prisma = require('../lib/prisma');
const { autenticar, exigirRole } = require('../middleware/auth');
const { somarMeses, mesAtual, parseMes } = require('../utils/mes');
const { janelaValida, limitesJanela, projetarLancamentoNaJanela, parcelasNaJanela } = require('../utils/projecao');
const { calcularPlanoTemporario } = require('../utils/parcelamento');
const { asyncHandler } = require('../utils/asyncHandler');

const router = express.Router();
router.use(autenticar, exigirRole('USER'));

const mesSchema = z.string().regex(/^\d{4}-\d{2}$/, 'Use o formato AAAA-MM.');

const baseSchema = z.object({
  id: z.string().uuid().optional(),
  instanciaId: z.string().min(1),
  descricao: z.string().trim().min(1, 'Informe uma descricao.'),
  valor: z.number().positive('O valor precisa ser maior que zero.'),
  tipo: z.enum(['fixo', 'temporario']),
  parcelas: z.number().int().min(1).nullable().optional(),
  mesInicio: mesSchema,
  observacoes: z.string().trim().optional().nullable(),
  // 'total': "valor" e' o total da compra — o backend divide pelo prazo e
  // calcula a parcela (residuo na ultima via calcularPlanoTemporario).
  // 'parcela' (ou omitido, default): "valor" ja e' o valor da parcela, como
  // sempre foi — preserva 100% o comportamento anterior (Lancamento Rapido
  // do Dashboard nunca envia esse campo). So se aplica a tipo=temporario.
  modoValor: z.enum(['total', 'parcela']).optional(),
});

// Resolve o valor de parcela e o residuo (valorUltimaParcela) a persistir a
// partir do payload validado — unico ponto de decisao entre "valor ja e' a
// parcela" e "valor e' o total, calcular a parcela" (calcularPlanoTemporario,
// mesma funcao usada em Investimentos). Nunca persiste o total digitado —
// so a parcela + o residuo, formato que Dashboard/Relatorio/competencia ja
// consomem sem mudanca nenhuma.
function resolverValorEResiduo(dados) {
  if (dados.tipo === 'temporario' && dados.modoValor === 'total') {
    const plano = calcularPlanoTemporario({ valorMeta: dados.valor, prazoMeses: dados.parcelas });
    return { valor: plano.valorParcela, valorUltimaParcela: plano.valorUltimaParcela };
  }
  return { valor: dados.valor, valorUltimaParcela: null };
}

function validarParcelasPorTipo(dados) {
  if (dados.tipo === 'temporario') {
    if (!dados.parcelas || dados.parcelas < 1) {
      return 'Lancamentos temporarios exigem numero de parcelas (>= 1).';
    }
  } else if (dados.parcelas !== undefined && dados.parcelas !== null) {
    return 'Lancamentos fixos nao tem numero de parcelas.';
  }
  return null;
}

async function contarPagamentos(lancamentoId) {
  return prisma.pagamento.count({ where: { lancamentoId } });
}

async function serializarComRestantes(lancamento) {
  if (lancamento.tipo !== 'temporario') {
    return { ...lancamento, pagas: null, restantes: null, totalRestante: null };
  }
  const pagas = await contarPagamentos(lancamento.id);
  const restantes = Math.max(lancamento.parcelas - pagas, 0);
  return { ...lancamento, pagas, restantes, totalRestante: restantes * lancamento.valor };
}

// Situacao do lancamento na competencia (mes) selecionada no seletor de mes —
// diferente de serializarComRestantes, que reflete pagamentos reais e nunca
// muda com a navegacao entre meses. Aqui a fonte e' sempre parcelasNaJanela
// (mesma logica usada por relatorio.js), pra "qual parcela" e "quanto vale"
// nunca divergir entre Lancamentos, Dashboard e Relatorio.
// Retorna null quando o lancamento nao tem efeito financeiro naquele mes
// (ainda nao comecou, ja terminou ou esta inativo) — nesse caso ele nao deve
// aparecer na lista daquele mes.
function competenciaDoLancamento(lancamento, mesReferencia) {
  if (!lancamento.ativo) return null;

  const [entrada] = parcelasNaJanela(lancamento, mesReferencia, mesReferencia);
  if (!entrada) return null;

  if (lancamento.tipo !== 'temporario') {
    return { valorParcela: entrada.valor, parcelaAtual: null, restantes: null, totalRestante: null };
  }

  const restantes = Math.max(lancamento.parcelas - entrada.parcela, 0);
  const proximoMes = somarMeses(mesReferencia, 1);
  const totalRestante = parcelasNaJanela(lancamento, proximoMes, lancamento.mesFim).reduce(
    (acc, p) => acc + p.valor,
    0
  );

  return { valorParcela: entrada.valor, parcelaAtual: entrada.parcela, restantes, totalRestante };
}

router.get('/', asyncHandler(async (req, res) => {
  const { instanciaId, mesReferencia, janela } = req.query;
  if (!instanciaId) return res.status(400).json({ erro: 'Informe instanciaId.' });

  const instancia = await prisma.instancia.findFirst({
    where: { id: String(instanciaId), usuarioId: req.usuario.id },
  });
  if (!instancia) return res.status(404).json({ erro: 'Instancia nao encontrada.' });

  const lancamentos = await prisma.lancamento.findMany({
    where: { instanciaId: instancia.id, usuarioId: req.usuario.id },
    orderBy: { criadoEm: 'desc' },
  });

  const ref = mesReferencia && mesSchema.safeParse(mesReferencia).success ? String(mesReferencia) : mesAtual();
  const jan = janela && janelaValida(String(janela)) ? String(janela) : 'mes';

  // Card por card: so entram na lista os que tem efeito financeiro no mes
  // selecionado (ref), e cada um traz sua propria parcela/valor daquele mes —
  // nunca o estado global do lancamento (ver competenciaDoLancamento acima).
  const doMes = lancamentos
    .map((l) => ({ lancamento: l, competencia: competenciaDoLancamento(l, ref) }))
    .filter(({ competencia }) => competencia !== null);

  const comRestantes = doMes.map(({ lancamento, competencia }) => ({
    ...lancamento,
    pagas: null,
    valorParcela: competencia.valorParcela,
    parcelaAtual: competencia.parcelaAtual,
    restantes: competencia.restantes,
    totalRestante: competencia.totalRestante,
  }));

  const [inicio, fim] = limitesJanela(ref, jan);
  const totalJanela = lancamentos.reduce(
    (acc, l) => acc + projetarLancamentoNaJanela(l, inicio, fim).total,
    0
  );

  return res.json({ lancamentos: comRestantes, totalJanela, janela: jan, mesReferencia: ref });
}));

router.post('/', asyncHandler(async (req, res) => {
  const parsed = baseSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ erro: parsed.error.issues[0].message });

  const erroParcelas = validarParcelasPorTipo(parsed.data);
  if (erroParcelas) return res.status(400).json({ erro: erroParcelas });

  const instancia = await prisma.instancia.findFirst({
    where: { id: parsed.data.instanciaId, usuarioId: req.usuario.id },
  });
  if (!instancia) return res.status(404).json({ erro: 'Instancia nao encontrada.' });

  try {
    parseMes(parsed.data.mesInicio);
  } catch {
    return res.status(400).json({ erro: 'mesInicio invalido.' });
  }

  const mesFim =
    parsed.data.tipo === 'temporario' ? somarMeses(parsed.data.mesInicio, parsed.data.parcelas - 1) : null;

  const { valor, valorUltimaParcela } = resolverValorEResiduo(parsed.data);

  const dadosCriacao = {
    usuarioId: req.usuario.id,
    instanciaId: parsed.data.instanciaId,
    descricao: parsed.data.descricao,
    valor,
    valorUltimaParcela,
    tipo: parsed.data.tipo,
    parcelas: parsed.data.tipo === 'temporario' ? parsed.data.parcelas : null,
    mesInicio: parsed.data.mesInicio,
    mesFim,
    observacoes: parsed.data.observacoes || null,
  };
  if (parsed.data.id) {
    dadosCriacao.id = parsed.data.id;
  }

  // Cliente pode enviar um id proprio (uuid gerado no app, ex.: fila offline).
  // Se um retry reenviar o mesmo id (ex.: a resposta da 1a tentativa se perdeu
  // na rede), o unique constraint do id barra a duplicata — nesse caso
  // devolvemos o registro ja existente como sucesso idempotente, em vez de
  // erro, pra fila de sincronizacao nao ficar presa nem criar copia.
  let lancamento;
  try {
    lancamento = await prisma.lancamento.create({ data: dadosCriacao });
  } catch (err) {
    if (parsed.data.id && err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const existente = await prisma.lancamento.findFirst({
        where: { id: parsed.data.id, usuarioId: req.usuario.id },
      });
      if (existente) {
        return res.status(200).json({ lancamento: await serializarComRestantes(existente) });
      }
    }
    throw err;
  }
  return res.status(201).json({ lancamento: await serializarComRestantes(lancamento) });
}));

const edicaoSchema = z.object({
  descricao: z.string().trim().min(1).optional(),
  valor: z.number().positive('O valor precisa ser maior que zero.').optional(),
  observacoes: z.string().trim().optional().nullable(),
});

router.put('/:id', asyncHandler(async (req, res) => {
  const parsed = edicaoSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ erro: parsed.error.issues[0].message });

  const lancamento = await prisma.lancamento.findFirst({
    where: { id: req.params.id, usuarioId: req.usuario.id },
  });
  if (!lancamento) return res.status(404).json({ erro: 'Lancamento nao encontrado.' });

  const atualizado = await prisma.lancamento.update({ where: { id: lancamento.id }, data: parsed.data });
  return res.json({ lancamento: await serializarComRestantes(atualizado) });
}));

// Edicao completa (reabre o mesmo formulario de criacao ja preenchido): permite
// alterar descricao/valor/tipo/periodo, recalculando mesFim a partir de mesInicio+parcelas.
router.put('/:id/completo', asyncHandler(async (req, res) => {
  const parsed = baseSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ erro: parsed.error.issues[0].message });

  const erroParcelas = validarParcelasPorTipo(parsed.data);
  if (erroParcelas) return res.status(400).json({ erro: erroParcelas });

  const lancamento = await prisma.lancamento.findFirst({
    where: { id: req.params.id, usuarioId: req.usuario.id },
  });
  if (!lancamento) return res.status(404).json({ erro: 'Lancamento nao encontrado.' });

  try {
    parseMes(parsed.data.mesInicio);
  } catch {
    return res.status(400).json({ erro: 'mesInicio invalido.' });
  }

  const mesFim =
    parsed.data.tipo === 'temporario' ? somarMeses(parsed.data.mesInicio, parsed.data.parcelas - 1) : null;

  const { valor, valorUltimaParcela } = resolverValorEResiduo(parsed.data);

  const atualizado = await prisma.lancamento.update({
    where: { id: lancamento.id },
    data: {
      descricao: parsed.data.descricao,
      valor,
      // Sempre reescreve valorUltimaParcela (null no modo parcela) — senão um
      // lancamento editado de volta pra "parcela" ficaria com o residuo da
      // conversao anterior preso no banco, incoerente com o novo valor.
      valorUltimaParcela,
      tipo: parsed.data.tipo,
      parcelas: parsed.data.tipo === 'temporario' ? parsed.data.parcelas : null,
      mesInicio: parsed.data.mesInicio,
      mesFim,
      observacoes: parsed.data.observacoes || null,
    },
  });
  return res.json({ lancamento: await serializarComRestantes(atualizado) });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const lancamento = await prisma.lancamento.findFirst({
    where: { id: req.params.id, usuarioId: req.usuario.id },
  });
  if (!lancamento) return res.status(404).json({ erro: 'Lancamento nao encontrado.' });

  await prisma.lancamento.delete({ where: { id: lancamento.id } });
  return res.json({ ok: true });
}));

module.exports = router;

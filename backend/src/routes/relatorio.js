const express = require('express');
const prisma = require('../lib/prisma');
const { autenticar, exigirRole } = require('../middleware/auth');
const { mesAtual } = require('../utils/mes');
const { janelaValida, limitesJanela, parcelasNaJanela } = require('../utils/projecao');
const { calcularResumo } = require('../utils/resumoFinanceiro');
const { asyncHandler } = require('../utils/asyncHandler');
const { gerarRelatorioPdfBuffer } = require('../lib/relatorioPdf');

const router = express.Router();
router.use(autenticar, exigirRole('USER'));

// Le e normaliza os parametros de recorte (mesReferencia/janela/direcao) da
// query string — compartilhado pelas rotas JSON e PDF pra nao divergir.
function lerRecorte(req) {
  const mesReferencia = req.query.mesReferencia && /^\d{4}-\d{2}$/.test(req.query.mesReferencia)
    ? String(req.query.mesReferencia)
    : mesAtual();
  const janela = req.query.janela && janelaValida(String(req.query.janela)) ? String(req.query.janela) : 'mes';
  const direcao = req.query.direcao === 'passado' ? 'passado' : 'futuro';
  return { mesReferencia, janela, direcao };
}

// Monta o JSON-fonte do Relatorio do Periodo: resumo (mesmos agregados do
// Dashboard) + lancamentos discriminados por instancia, linha a linha, dentro
// da janela selecionada. Compartilhado pela rota JSON e pela rota de PDF.
async function montarRelatorio(usuarioId, { mesReferencia, janela, direcao }) {
  const [instancias, lancamentos, investimentos] = await Promise.all([
    prisma.instancia.findMany({ where: { usuarioId } }),
    prisma.lancamento.findMany({ where: { usuarioId, ativo: true } }),
    prisma.investimento.findMany({ where: { usuarioId } }),
  ]);

  const resumo = calcularResumo({ instancias, lancamentos, investimentos, mesReferencia, janela, direcao });

  const [inicioJanela, fimJanela] = limitesJanela(mesReferencia, janela, direcao);
  const lancamentosPorInstancia = new Map();
  for (const l of lancamentos) {
    if (!lancamentosPorInstancia.has(l.instanciaId)) lancamentosPorInstancia.set(l.instanciaId, []);
    lancamentosPorInstancia.get(l.instanciaId).push(l);
  }

  const porInstancia = instancias
    .map((instancia) => {
      const doGrupo = lancamentosPorInstancia.get(instancia.id) || [];
      const linhas = doGrupo
        .flatMap((l) =>
          parcelasNaJanela(l, inicioJanela, fimJanela).map((p) => ({
            lancamentoId: l.id,
            descricao: l.descricao,
            tipo: l.tipo,
            mes: p.mes,
            valor: p.valor,
            parcela: p.parcela,
            totalParcelas: l.parcelas,
          }))
        )
        .sort((a, b) => (a.mes < b.mes ? -1 : a.mes > b.mes ? 1 : 0));
      return {
        instancia: {
          id: instancia.id,
          nome: instancia.nome,
          grupo: instancia.grupo,
          subgrupo: instancia.subgrupo,
          cor: instancia.cor,
        },
        linhas,
      };
    })
    .filter((item) => item.linhas.length > 0);

  return { resumo, porInstancia };
}

// Nunca gera arquivo nem persiste nada — o frontend so formata isso em
// PDF/XLSX sob demanda.
router.get('/', asyncHandler(async (req, res) => {
  const dados = await montarRelatorio(req.usuario.id, lerRecorte(req));
  return res.json(dados);
}));

// GET /api/relatorio/pdf — gera o PDF do relatorio no servidor e entrega por
// URL direta com Content-Disposition: inline, pro navegador abrir no proprio
// visualizador (inclusive Safari/iOS) em vez de disparar o menu de
// compartilhar do sistema. Autenticacao via cookie de sessao (dominium_token),
// que ja acompanha a navegacao direta do browser sem precisar de token na query.
router.get('/pdf', asyncHandler(async (req, res) => {
  const recorte = lerRecorte(req);
  const dados = await montarRelatorio(req.usuario.id, recorte);
  const buffer = await gerarRelatorioPdfBuffer(dados);

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `inline; filename="relatorio-dominium-${recorte.mesReferencia}-${recorte.janela}-${recorte.direcao}.pdf"`
  );
  res.setHeader('Cache-Control', 'no-store');
  buffer.pipe(res);
}));

module.exports = router;

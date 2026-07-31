const express = require('express');
const prisma = require('../lib/prisma');
const { autenticar } = require('../middleware/auth');

const router = express.Router();
router.use(autenticar);

router.get('/', async (req, res) => {
  const usuarioId = req.usuario.id;

  const [instancias, lancamentos] = await Promise.all([
    prisma.instancia.findMany({ where: { usuarioId, arquivada: false } }),
    prisma.lancamento.findMany({
      where: { usuarioId },
      orderBy: { data: 'asc' },
    }),
  ]);

  const saldoTotal = lancamentos.reduce((acc, l) => acc + l.valor, 0);

  const inicioMes = new Date();
  inicioMes.setDate(1);
  inicioMes.setHours(0, 0, 0, 0);
  const doMes = lancamentos.filter((l) => new Date(l.data) >= inicioMes);
  const entradasMes = doMes.filter((l) => l.tipo === 'entrada').reduce((a, l) => a + l.valor, 0);
  const saidasMes = doMes.filter((l) => l.tipo === 'saida').reduce((a, l) => a + Math.abs(l.valor), 0);

  const porInstancia = instancias.map((i) => {
    const doGrupo = lancamentos.filter((l) => l.instanciaId === i.id);
    return {
      id: i.id,
      nome: i.nome,
      cor: i.cor,
      icone: i.icone,
      tipo: i.tipo,
      saldo: doGrupo.reduce((a, l) => a + l.valor, 0),
    };
  });

  const evolucaoPorMes = {};
  for (const l of lancamentos) {
    const d = new Date(l.data);
    const chave = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    evolucaoPorMes[chave] = (evolucaoPorMes[chave] || 0) + l.valor;
  }
  let acumulado = 0;
  const evolucao = Object.keys(evolucaoPorMes)
    .sort()
    .map((mes) => {
      acumulado += evolucaoPorMes[mes];
      return { mes, saldoAcumulado: acumulado };
    });

  return res.json({
    saldoTotal,
    entradasMes,
    saidasMes,
    porInstancia,
    evolucao,
    totalInstancias: instancias.length,
    totalLancamentos: lancamentos.length,
  });
});

module.exports = router;

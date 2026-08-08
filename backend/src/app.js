// Montagem do app Express, separada do `listen`. Existe para que os testes
// (e o teste de cobertura de rotas do PR A em especial, que percorre a arvore
// de rotas registradas) possam importar o app sem subir um servidor na porta
// de producao. server.js continua sendo o unico ponto que escuta.
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');

const authRouter = require('./routes/auth');
const instanciasRouter = require('./routes/instancias');
const lancamentosRouter = require('./routes/lancamentos');
const pagamentosRouter = require('./routes/pagamentos');
const investimentosRouter = require('./routes/investimentos');
const dashboardRouter = require('./routes/dashboard');
const relatorioRouter = require('./routes/relatorio');
const vouchersRouter = require('./routes/vouchers');
const usuariosAdminRouter = require('./routes/usuariosAdmin');

function criarApp() {
  const app = express();

  // A Vercel (e outros PaaS) fica na frente como proxy reverso e manda X-Forwarded-For.
  // Sem isso, o express-rate-limit lanca ValidationError ao tentar resolver o IP do
  // cliente, travando a resposta ate o timeout da function em vez de responder rapido.
  app.set('trust proxy', 1);

  app.use(
    cors({
      origin: process.env.FRONTEND_URL || 'http://localhost:5000',
      credentials: true,
    })
  );
  app.use(express.json());
  app.use(cookieParser());

  app.get('/api/health', (req, res) => res.json({ ok: true, servico: 'dominium-backend' }));

  app.use('/api/auth', authRouter);
  app.use('/api/instancias', instanciasRouter);
  app.use('/api/lancamentos', lancamentosRouter);
  app.use('/api/pagamentos', pagamentosRouter);
  app.use('/api/investimentos', investimentosRouter);
  app.use('/api/dashboard', dashboardRouter);
  app.use('/api/relatorio', relatorioRouter);
  app.use('/api/admin/vouchers', vouchersRouter);
  app.use('/api/admin/usuarios', usuariosAdminRouter);

  app.use((req, res) => {
    res.status(404).json({ erro: 'Rota nao encontrada.' });
  });

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ erro: 'Erro interno do servidor.' });
  });

  return app;
}

module.exports = { criarApp };

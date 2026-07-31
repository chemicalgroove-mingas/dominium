require('dotenv').config();

const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');

const authRouter = require('./src/routes/auth');
const instanciasRouter = require('./src/routes/instancias');
const lancamentosRouter = require('./src/routes/lancamentos');
const recortesRouter = require('./src/routes/recortes');
const dashboardRouter = require('./src/routes/dashboard');

const app = express();
const PORT = process.env.PORT || 5001;

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
app.use('/api/recortes', recortesRouter);
app.use('/api/dashboard', dashboardRouter);

app.use((req, res) => {
  res.status(404).json({ erro: 'Rota nao encontrada.' });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ erro: 'Erro interno do servidor.' });
});

app.listen(PORT, () => {
  console.log(`DOMINIUM backend rodando em http://localhost:${PORT}`);
});

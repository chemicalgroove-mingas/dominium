const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');
const { asyncHandler } = require('../utils/asyncHandler');
const { licencaVigente } = require('../utils/licenca');

const autenticar = asyncHandler(async function autenticar(req, res, next) {
  const token = req.cookies?.dominium_token;

  if (!token) {
    return res.status(401).json({ erro: 'Sessao nao encontrada.' });
  }

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ erro: 'Sessao invalida ou expirada.' });
  }

  // Role/status sempre lidos do banco (nunca confiar apenas no payload do token):
  // uma conta desativada ou excluida precisa perder acesso imediatamente, mesmo
  // com um JWT ainda valido. A licenca vem no mesmo `include` — um round-trip
  // so, ja que praticamente toda requisicao autenticada precisa dos dois.
  const usuario = await prisma.usuario.findFirst({
    where: { id: payload.id, deletadoEm: null },
    include: { licenca: true },
  });

  if (!usuario) {
    return res.status(401).json({ erro: 'Sessao invalida ou expirada.' });
  }

  if (usuario.status !== 'ATIVO') {
    return res.status(403).json({ erro: 'Sua conta foi desativada pelo administrador.' });
  }

  req.usuario = {
    id: usuario.id,
    nome: usuario.nome,
    login: usuario.login,
    role: usuario.role,
    deveTrocarSenha: usuario.deveTrocarSenha,
  };
  // null quando a conta nao tem licenca — o middleware de escrita trata isso
  // como "nao pode escrever", igual a uma licenca vencida.
  req.licenca = usuario.licenca ?? null;
  next();
});

// Autorizacao de ESCRITA por licenca. Modo estrito: licenca vencida nao cria,
// nao edita e nao exclui — sem excecao para "corrigir" registro existente.
//
// Leitura nunca e bloqueada: os dados continuam sendo do usuario, e ele segue
// com acesso a dashboard, relatorio, PDF e exportacao mesmo sem licenca.
//
// A avaliacao usa o relogio do servidor (default de licencaVigente). Nada que
// venha do cliente — corpo, header, query — participa dessa decisao.
function exigirLicencaParaEscrita(req, res, next) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    return next();
  }

  if (licencaVigente(req.licenca)) {
    return next();
  }

  // Codigo estavel em `erro` — o frontend (PR F) depende dessa string para
  // distinguir licenca expirada de qualquer outro 403.
  return res.status(403).json({
    erro: 'LICENCA_EXPIRADA',
    mensagem:
      'Sua licença expirou. Você continua com acesso aos seus dados, mas não pode registrar novos lançamentos.',
    expiraEm: req.licenca ? req.licenca.expiraEm.toISOString() : null,
  });
}

function exigirRole(role) {
  return (req, res, next) => {
    if (!req.usuario || req.usuario.role !== role) {
      return res.status(403).json({ erro: 'Acesso nao permitido para este papel de usuario.' });
    }
    next();
  };
}

// Sanitiza JWT_EXPIRES_IN: valores mal configurados na env (espaco, aspas
// coladas etc.) nao podem derrubar o login inteiro — cai no default seguro.
function expiresInValido() {
  const valor = (process.env.JWT_EXPIRES_IN || '').trim().replace(/^["']|["']$/g, '');
  return /^\d+$/.test(valor) || /^\d+[smhdwy]$/.test(valor) ? valor : '7d';
}

function gerarToken(usuario) {
  return jwt.sign({ id: usuario.id }, process.env.JWT_SECRET, {
    expiresIn: expiresInValido(),
  });
}

const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000,
  path: '/',
};

module.exports = { autenticar, exigirRole, exigirLicencaParaEscrita, gerarToken, cookieOptions };

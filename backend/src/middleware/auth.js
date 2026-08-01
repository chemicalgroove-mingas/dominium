const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');

async function autenticar(req, res, next) {
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
  // com um JWT ainda valido.
  const usuario = await prisma.usuario.findFirst({
    where: { id: payload.id, deletadoEm: null },
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
  next();
}

function exigirRole(role) {
  return (req, res, next) => {
    if (!req.usuario || req.usuario.role !== role) {
      return res.status(403).json({ erro: 'Acesso nao permitido para este papel de usuario.' });
    }
    next();
  };
}

function gerarToken(usuario) {
  return jwt.sign({ id: usuario.id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
}

const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000,
  path: '/',
};

module.exports = { autenticar, exigirRole, gerarToken, cookieOptions };

const jwt = require('jsonwebtoken');

function autenticar(req, res, next) {
  const token = req.cookies?.dominium_token;

  if (!token) {
    return res.status(401).json({ erro: 'Sessao nao encontrada.' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.usuario = payload;
    next();
  } catch (err) {
    return res.status(401).json({ erro: 'Sessao invalida ou expirada.' });
  }
}

function gerarToken(usuario) {
  return jwt.sign(
    { id: usuario.id, nome: usuario.nome, email: usuario.email },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000,
  path: '/',
};

module.exports = { autenticar, gerarToken, cookieOptions };

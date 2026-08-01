const rateLimit = require('express-rate-limit');

// Barrar brute force basico por IP, sem infraestrutura pesada (memoria local).
// Uso proporcional a um sistema de poucas pessoas, nao pensado para escala.

const limiteLogin = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { erro: 'Muitas tentativas de login. Aguarde alguns minutos e tente novamente.' },
});

const limiteCadastro = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { erro: 'Muitas tentativas de cadastro. Aguarde e tente novamente.' },
});

module.exports = { limiteLogin, limiteCadastro };

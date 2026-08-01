const express = require('express');
const bcrypt = require('bcryptjs');
const { z } = require('zod');

const prisma = require('../lib/prisma');
const { normalizarLogin } = require('../utils/login');
const { gerarToken, cookieOptions, autenticar } = require('../middleware/auth');
const { limiteLogin, limiteCadastro } = require('../middleware/rateLimit');
const { asyncHandler } = require('../utils/asyncHandler');

const router = express.Router();

const cadastroSchema = z
  .object({
    nome: z.string().trim().min(2, 'Informe seu nome completo.'),
    login: z.string().trim().min(3, 'O login precisa ter pelo menos 3 caracteres.'),
    senha: z.string().min(8, 'A senha precisa ter pelo menos 8 caracteres.'),
    confirmacao: z.string(),
    voucher: z.string().trim().min(1, 'Informe o voucher recebido.'),
  })
  .refine((dados) => dados.senha === dados.confirmacao, {
    message: 'As senhas nao coincidem.',
    path: ['confirmacao'],
  });

const loginSchema = z.object({
  login: z.string().trim().min(1, 'Informe seu login.'),
  senha: z.string().min(1, 'Informe sua senha.'),
});

function usuarioPublico(usuario) {
  return {
    id: usuario.id,
    nome: usuario.nome,
    login: usuario.login,
    role: usuario.role,
    deveTrocarSenha: usuario.deveTrocarSenha,
  };
}

router.post('/cadastro', limiteCadastro, asyncHandler(async (req, res) => {
  const parsed = cadastroSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ erro: parsed.error.issues[0].message });
  }

  const { nome, senha, voucher } = parsed.data;
  const loginNormalizado = normalizarLogin(parsed.data.login);
  const codigoVoucher = voucher.trim().toUpperCase();

  if (loginNormalizado.length < 3) {
    return res.status(400).json({ erro: 'O login precisa ter pelo menos 3 caracteres.' });
  }

  const loginExistente = await prisma.usuario.findFirst({
    where: { login: loginNormalizado, deletadoEm: null },
  });
  if (loginExistente) {
    return res.status(409).json({ erro: 'Esse login ja esta em uso, escolha outro.' });
  }

  const senhaHash = await bcrypt.hash(senha, 12);

  try {
    const usuario = await prisma.$transaction(async (tx) => {
      const novoUsuario = await tx.usuario.create({
        data: { nome, login: loginNormalizado, senha: senhaHash, role: 'USER', status: 'ATIVO' },
      });

      // Consumo atomico do voucher: so avanca se, na hora exata do UPDATE, o
      // voucher ainda estiver ATIVO e nao expirado. Se outra requisicao venceu
      // a corrida primeiro (ou o voucher nao existe/ja foi usado/revogado),
      // linhasAfetadas vem 0 e a transacao inteira e desfeita (usuario incluso).
      const linhasAfetadas = await tx.$executeRaw`
        UPDATE "Voucher"
        SET "status" = 'USADO', "usuarioId" = ${novoUsuario.id}, "utilizadoEm" = ${new Date()}
        WHERE "codigo" = ${codigoVoucher}
          AND "status" = 'ATIVO'
          AND ("expiraEm" IS NULL OR "expiraEm" >= ${new Date()})
      `;

      if (linhasAfetadas === 0) {
        throw new Error('VOUCHER_INVALIDO');
      }

      return novoUsuario;
    });

    const token = gerarToken(usuario);
    res.cookie('dominium_token', token, cookieOptions);
    return res.status(201).json({ usuario: usuarioPublico(usuario) });
  } catch (err) {
    if (err.message === 'VOUCHER_INVALIDO') {
      return res.status(400).json({ erro: 'Voucher invalido, ja utilizado, revogado ou expirado.' });
    }
    if (err.code === 'P2002') {
      return res.status(409).json({ erro: 'Esse login ja esta em uso, escolha outro.' });
    }
    console.error('Erro no cadastro:', err);
    return res.status(500).json({ erro: 'Nao foi possivel concluir o cadastro. Tente novamente.' });
  }
}));

router.post('/login', limiteLogin, asyncHandler(async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ erro: parsed.error.issues[0].message });
  }

  const loginNormalizado = normalizarLogin(parsed.data.login);
  const usuario = await prisma.usuario.findFirst({
    where: { login: loginNormalizado, deletadoEm: null },
  });

  const mensagemGenerica = 'Login ou senha invalidos.';
  if (!usuario) {
    return res.status(401).json({ erro: mensagemGenerica });
  }

  if (usuario.status !== 'ATIVO') {
    return res.status(403).json({ erro: 'Sua conta foi desativada pelo administrador.' });
  }

  const senhaOk = await bcrypt.compare(parsed.data.senha, usuario.senha);
  if (!senhaOk) {
    return res.status(401).json({ erro: mensagemGenerica });
  }

  await prisma.usuario.update({ where: { id: usuario.id }, data: { ultimoLogin: new Date() } });

  const token = gerarToken(usuario);
  res.cookie('dominium_token', token, cookieOptions);
  return res.json({ usuario: usuarioPublico(usuario) });
}));

router.post('/logout', (req, res) => {
  res.clearCookie('dominium_token', { ...cookieOptions, maxAge: undefined });
  return res.json({ ok: true });
});

router.get('/me', autenticar, asyncHandler(async (req, res) => {
  return res.json({ usuario: req.usuario });
}));

const trocarSenhaSchema = z
  .object({
    senhaAtual: z.string().min(1, 'Informe sua senha atual.'),
    novaSenha: z.string().min(8, 'A nova senha precisa ter pelo menos 8 caracteres.'),
    confirmacao: z.string(),
  })
  .refine((dados) => dados.novaSenha === dados.confirmacao, {
    message: 'As senhas nao coincidem.',
    path: ['confirmacao'],
  });

router.post('/trocar-senha', autenticar, asyncHandler(async (req, res) => {
  const parsed = trocarSenhaSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ erro: parsed.error.issues[0].message });
  }

  const usuario = await prisma.usuario.findUnique({ where: { id: req.usuario.id } });
  const senhaOk = await bcrypt.compare(parsed.data.senhaAtual, usuario.senha);
  if (!senhaOk) {
    return res.status(401).json({ erro: 'Senha atual incorreta.' });
  }

  const novaSenhaHash = await bcrypt.hash(parsed.data.novaSenha, 12);
  const atualizado = await prisma.usuario.update({
    where: { id: usuario.id },
    data: { senha: novaSenhaHash, deveTrocarSenha: false },
  });

  return res.json({ usuario: usuarioPublico(atualizado) });
}));

module.exports = router;

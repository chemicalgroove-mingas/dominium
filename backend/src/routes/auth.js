const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { z } = require('zod');

const prisma = require('../lib/prisma');
const { cpfValido, limparCpf, formatarCpf } = require('../utils/cpf');
const { gerarToken, cookieOptions, autenticar } = require('../middleware/auth');
const { sendConfirmacaoCadastro, sendPasswordReset } = require('../services/emailService');

const router = express.Router();

const cadastroSchema = z.object({
  nome: z.string().trim().min(2, 'Informe seu nome completo.'),
  cpf: z.string().refine(cpfValido, 'CPF invalido.'),
  email: z.string().trim().email('Email invalido.'),
  senha: z.string().min(8, 'A senha precisa ter pelo menos 8 caracteres.'),
});

const loginSchema = z.object({
  cpf: z.string().min(1, 'Informe seu CPF.'),
  senha: z.string().min(1, 'Informe sua senha.'),
});

router.post('/cadastro', async (req, res) => {
  const parsed = cadastroSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ erro: parsed.error.issues[0].message });
  }

  const { nome, cpf, email, senha } = parsed.data;
  const cpfLimpo = limparCpf(cpf);

  const existente = await prisma.usuario.findFirst({
    where: { OR: [{ cpf: cpfLimpo }, { email: email.toLowerCase() }] },
  });
  if (existente) {
    return res.status(409).json({ erro: 'Ja existe uma conta com este CPF ou email.' });
  }

  const senhaHash = await bcrypt.hash(senha, 12);
  const emailConfirmacaoToken = uuidv4();

  const usuario = await prisma.usuario.create({
    data: {
      nome,
      cpf: cpfLimpo,
      email: email.toLowerCase(),
      senha: senhaHash,
      resetToken: emailConfirmacaoToken,
      resetTokenExpiracao: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  });

  try {
    await sendConfirmacaoCadastro({ to: usuario.email, nome: usuario.nome, token: emailConfirmacaoToken });
  } catch (err) {
    console.error('Falha ao enviar email de confirmacao:', err.message);
  }

  const token = gerarToken(usuario);
  res.cookie('dominium_token', token, cookieOptions);
  return res.status(201).json({
    usuario: { id: usuario.id, nome: usuario.nome, cpf: formatarCpf(usuario.cpf), email: usuario.email },
  });
});

router.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ erro: parsed.error.issues[0].message });
  }

  const cpfLimpo = limparCpf(parsed.data.cpf);
  const usuario = await prisma.usuario.findUnique({ where: { cpf: cpfLimpo } });

  const mensagemGenerica = 'CPF ou senha invalidos.';
  if (!usuario) {
    return res.status(401).json({ erro: mensagemGenerica });
  }

  const senhaOk = await bcrypt.compare(parsed.data.senha, usuario.senha);
  if (!senhaOk) {
    return res.status(401).json({ erro: mensagemGenerica });
  }

  const token = gerarToken(usuario);
  res.cookie('dominium_token', token, cookieOptions);
  return res.json({
    usuario: { id: usuario.id, nome: usuario.nome, cpf: formatarCpf(usuario.cpf), email: usuario.email },
  });
});

router.post('/logout', (req, res) => {
  res.clearCookie('dominium_token', { ...cookieOptions, maxAge: undefined });
  return res.json({ ok: true });
});

router.get('/me', autenticar, async (req, res) => {
  const usuario = await prisma.usuario.findUnique({ where: { id: req.usuario.id } });
  if (!usuario) return res.status(404).json({ erro: 'Usuario nao encontrado.' });
  return res.json({
    usuario: {
      id: usuario.id,
      nome: usuario.nome,
      cpf: formatarCpf(usuario.cpf),
      email: usuario.email,
      emailVerificado: usuario.emailVerificado,
    },
  });
});

router.get('/confirmar-email', async (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).json({ erro: 'Token ausente.' });

  const usuario = await prisma.usuario.findFirst({
    where: { resetToken: String(token), resetTokenExpiracao: { gt: new Date() } },
  });
  if (!usuario) return res.status(400).json({ erro: 'Token invalido ou expirado.' });

  await prisma.usuario.update({
    where: { id: usuario.id },
    data: { emailVerificado: true, resetToken: null, resetTokenExpiracao: null },
  });
  return res.json({ ok: true });
});

router.post('/solicitar-recuperacao', async (req, res) => {
  const { cpf } = req.body;
  const cpfLimpo = limparCpf(cpf || '');
  const mensagem = { mensagem: 'Se o CPF existir em nossa base, um email de recuperacao foi enviado.' };

  const usuario = await prisma.usuario.findUnique({ where: { cpf: cpfLimpo } });
  if (!usuario) return res.json(mensagem);

  const token = uuidv4();
  await prisma.usuario.update({
    where: { id: usuario.id },
    data: { resetToken: token, resetTokenExpiracao: new Date(Date.now() + 60 * 60 * 1000) },
  });

  try {
    await sendPasswordReset({ to: usuario.email, nome: usuario.nome, token });
  } catch (err) {
    console.error('Falha ao enviar email de recuperacao:', err.message);
  }

  return res.json(mensagem);
});

router.post('/redefinir-senha', async (req, res) => {
  const schema = z.object({
    token: z.string().min(1),
    senha: z.string().min(8, 'A senha precisa ter pelo menos 8 caracteres.'),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ erro: parsed.error.issues[0].message });
  }

  const usuario = await prisma.usuario.findFirst({
    where: { resetToken: parsed.data.token, resetTokenExpiracao: { gt: new Date() } },
  });
  if (!usuario) {
    return res.status(400).json({ erro: 'Link invalido ou expirado. Solicite a recuperacao novamente.' });
  }

  const senhaHash = await bcrypt.hash(parsed.data.senha, 12);
  await prisma.usuario.update({
    where: { id: usuario.id },
    data: { senha: senhaHash, resetToken: null, resetTokenExpiracao: null },
  });

  const token = gerarToken(usuario);
  res.cookie('dominium_token', token, cookieOptions);
  return res.json({ ok: true });
});

module.exports = router;

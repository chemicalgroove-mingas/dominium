const express = require('express');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const prisma = require('../lib/prisma');
const { autenticar, exigirRole } = require('../middleware/auth');
const { asyncHandler } = require('../utils/asyncHandler');

const router = express.Router();
router.use(autenticar, exigirRole('ADMIN'));

function serializar(usuario) {
  return {
    id: usuario.id,
    nome: usuario.nome,
    login: usuario.login,
    status: usuario.status,
    ultimoLogin: usuario.ultimoLogin,
    criadoEm: usuario.criadoEm,
  };
}

router.get('/', asyncHandler(async (req, res) => {
  const usuarios = await prisma.usuario.findMany({
    where: { role: 'USER', deletadoEm: null },
    orderBy: { criadoEm: 'desc' },
  });
  return res.json({ usuarios: usuarios.map(serializar) });
}));

const statusSchema = z.object({ status: z.enum(['ATIVO', 'INATIVO']) });

router.patch('/:id/status', asyncHandler(async (req, res) => {
  const parsed = statusSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ erro: parsed.error.issues[0].message });

  const usuario = await prisma.usuario.findFirst({
    where: { id: req.params.id, role: 'USER', deletadoEm: null },
  });
  if (!usuario) return res.status(404).json({ erro: 'Usuario nao encontrado.' });

  const atualizado = await prisma.usuario.update({
    where: { id: usuario.id },
    data: { status: parsed.data.status },
  });
  return res.json({ usuario: serializar(atualizado) });
}));

const senhaSchema = z.object({ novaSenha: z.string().min(8, 'A senha precisa ter pelo menos 8 caracteres.') });

router.patch('/:id/senha', asyncHandler(async (req, res) => {
  const parsed = senhaSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ erro: parsed.error.issues[0].message });

  const usuario = await prisma.usuario.findFirst({
    where: { id: req.params.id, role: 'USER', deletadoEm: null },
  });
  if (!usuario) return res.status(404).json({ erro: 'Usuario nao encontrado.' });

  const senhaHash = await bcrypt.hash(parsed.data.novaSenha, 12);
  await prisma.usuario.update({
    where: { id: usuario.id },
    data: { senha: senhaHash, deveTrocarSenha: true },
  });
  return res.json({ ok: true });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const usuario = await prisma.usuario.findFirst({
    where: { id: req.params.id, role: 'USER', deletadoEm: null },
  });
  if (!usuario) return res.status(404).json({ erro: 'Usuario nao encontrado.' });

  // Soft delete: preserva o historico financeiro, so bloqueia o acesso.
  await prisma.usuario.update({
    where: { id: usuario.id },
    data: { deletadoEm: new Date(), status: 'INATIVO' },
  });
  return res.json({ ok: true });
}));

module.exports = router;

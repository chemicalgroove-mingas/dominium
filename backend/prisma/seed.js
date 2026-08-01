require('dotenv').config();
const bcrypt = require('bcryptjs');
const prisma = require('../src/lib/prisma');
const { normalizarLogin } = require('../src/utils/login');
const { gerarCodigoVoucher } = require('../src/utils/voucher');

async function seedAdmin() {
  const loginDesejado = normalizarLogin(process.env.ADMIN_LOGIN || 'admin');
  const senhaInicial = process.env.ADMIN_SENHA_INICIAL;

  const existente = await prisma.usuario.findFirst({ where: { role: 'ADMIN' } });
  if (existente) {
    console.log(`Admin ja existe (login atual: ${existente.login}). Nada a fazer.`);
    return;
  }

  if (!senhaInicial) {
    throw new Error(
      'ADMIN_SENHA_INICIAL nao definida. Configure essa variavel de ambiente antes de rodar o seed ' +
        '(nunca use uma senha padrao hardcoded).'
    );
  }
  if (senhaInicial.length < 8) {
    throw new Error('ADMIN_SENHA_INICIAL precisa ter pelo menos 8 caracteres.');
  }

  const senhaHash = await bcrypt.hash(senhaInicial, 12);
  const admin = await prisma.usuario.create({
    data: {
      nome: 'Administrador',
      login: loginDesejado,
      senha: senhaHash,
      role: 'ADMIN',
      status: 'ATIVO',
      deveTrocarSenha: true,
    },
  });
  console.log(`Admin criado com login "${admin.login}". Troca de senha obrigatoria no primeiro login.`);
}

async function seedVouchers() {
  const totalExistente = await prisma.voucher.count();
  if (totalExistente > 0) {
    console.log(`Ja existem ${totalExistente} voucher(s). Pulando geracao de vouchers de desenvolvimento.`);
    return;
  }

  for (let i = 0; i < 10; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await prisma.voucher.create({
      data: { codigo: gerarCodigoVoucher(), observacao: 'Gerado pelo seed de desenvolvimento.' },
    });
  }
  console.log('10 vouchers de desenvolvimento gerados.');
}

async function main() {
  await seedAdmin();
  await seedVouchers();
}

main()
  .catch((err) => {
    console.error('Falha no seed:', err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

// Infraestrutura comum dos testes.
//
// IMPORTANTE: este modulo redireciona DATABASE_URL para o banco de teste
// ANTES de qualquer require que instancie o PrismaClient (src/lib/prisma le a
// env no construtor). Por isso ele precisa ser o primeiro require de todo
// arquivo de teste — nenhum teste jamais toca o banco de desenvolvimento, e
// muito menos o de producao.
require('dotenv').config();

if (!process.env.TEST_DATABASE_URL) {
  throw new Error('TEST_DATABASE_URL nao definida — recuse-se a rodar testes contra o banco de dev/producao.');
}
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.DIRECT_URL = process.env.TEST_DATABASE_URL;

const bcrypt = require('bcryptjs');
const prisma = require('../src/lib/prisma');
const { criarApp } = require('../src/app');
const { gerarToken } = require('../src/middleware/auth');
const { MS_POR_DIA } = require('../src/utils/licenca');

// Sobe o app numa porta efemera e devolve um cliente HTTP simples. Sem
// supertest: `fetch` global do Node 24 basta e evita dependencia nova.
async function iniciarServidor() {
  const app = criarApp();
  const servidor = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const base = `http://127.0.0.1:${servidor.address().port}`;

  async function req(metodo, caminho, { cookie, body, headers = {} } = {}) {
    const resposta = await fetch(`${base}${caminho}`, {
      method: metodo,
      headers: {
        'Content-Type': 'application/json',
        ...(cookie ? { Cookie: cookie } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: 'manual',
    });
    const tipo = resposta.headers.get('content-type') || '';
    const corpo = tipo.includes('application/json') ? await resposta.json() : await resposta.text();
    return { status: resposta.status, corpo, headers: resposta.headers };
  }

  return {
    req,
    fechar: () => new Promise((resolve) => servidor.close(resolve)),
  };
}

async function limparBanco() {
  // TRUNCATE ... CASCADE limpa as tabelas dependentes junto (inclusive Voucher,
  // que referencia Usuario com SET NULL).
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "Usuario", "Voucher", "Instancia", "Lancamento", "Pagamento", "Investimento", "ValorExtra", "OrdenacaoInstancia", "Licenca", "ConcessaoLicenca" RESTART IDENTITY CASCADE'
  );
}

// Cria um usuario com licenca em qualquer estado. `diasLicenca` positivo =
// vigente; negativo = vencida ha tantos dias; null = sem licenca nenhuma.
async function criarUsuario({
  login = 'teste',
  nome = 'Usuario de Teste',
  senha = 'senha-de-teste-123',
  role = 'USER',
  status = 'ATIVO',
  diasLicenca = 30,
  origem = 'MIGRACAO',
} = {}) {
  const usuario = await prisma.usuario.create({
    data: { nome, login, senha: await bcrypt.hash(senha, 4), role, status },
  });

  if (diasLicenca !== null) {
    const expiraEm = new Date(Date.now() + diasLicenca * MS_POR_DIA);
    await prisma.licenca.create({
      data: {
        usuarioId: usuario.id,
        inicioEm: new Date(Date.now() - 365 * MS_POR_DIA),
        expiraEm,
        origem,
      },
    });
  }

  return usuario;
}

function cookieDe(usuario) {
  return `dominium_token=${gerarToken(usuario)}`;
}

// Instancia + lancamento minimos, pra exercitar rotas de leitura/escrita reais.
async function criarDadosFinanceiros(usuarioId) {
  const instancia = await prisma.instancia.create({
    data: { usuarioId, nome: 'Cartao', grupo: 'gasto', cor: '#fff' },
  });
  const lancamento = await prisma.lancamento.create({
    data: {
      usuarioId,
      instanciaId: instancia.id,
      descricao: 'Compra',
      valor: 100,
      tipo: 'fixo',
      mesInicio: '2026-01',
    },
  });
  return { instancia, lancamento };
}

module.exports = {
  prisma,
  iniciarServidor,
  limparBanco,
  criarUsuario,
  criarDadosFinanceiros,
  cookieDe,
};

// Comportamento da licenca: bloqueio de escrita, liberdade de leitura, regra
// de acumulo e integridade do historico de concessoes.
const {
  prisma,
  iniciarServidor,
  limparBanco,
  criarUsuario,
  criarDadosFinanceiros,
  cookieDe,
} = require('./helpers');

const test = require('node:test');
const assert = require('node:assert/strict');

const { concederLicenca, licencaVigente, MS_POR_DIA } = require('../src/utils/licenca');

let servidor;

test.before(async () => {
  servidor = await iniciarServidor();
});

test.after(async () => {
  await servidor.fechar();
  await prisma.$disconnect();
});

test.beforeEach(async () => {
  await limparBanco();
});

// ---------------------------------------------------------------------------
// Bloqueio de escrita
// ---------------------------------------------------------------------------

test('escrita com licenca VENCIDA -> 403 LICENCA_EXPIRADA', async () => {
  const usuario = await criarUsuario({ login: 'vencido', diasLicenca: -1 });
  const { instancia } = await criarDadosFinanceiros(usuario.id);

  const res = await servidor.req('POST', '/api/lancamentos', {
    cookie: cookieDe(usuario),
    body: {
      instanciaId: instancia.id,
      descricao: 'Nao deveria entrar',
      valor: 50,
      tipo: 'fixo',
      mesInicio: '2026-08',
    },
  });

  assert.equal(res.status, 403);
  assert.equal(res.corpo.erro, 'LICENCA_EXPIRADA');
  assert.match(res.corpo.mensagem, /licença expirou/i);
  assert.ok(res.corpo.expiraEm, 'expiraEm deve vir no corpo do erro');

  const total = await prisma.lancamento.count({ where: { descricao: 'Nao deveria entrar' } });
  assert.equal(total, 0, 'nada pode ter sido gravado');
});

test('escrita com licenca VIGENTE -> passa', async () => {
  const usuario = await criarUsuario({ login: 'vigente', diasLicenca: 30 });
  const { instancia } = await criarDadosFinanceiros(usuario.id);

  const res = await servidor.req('POST', '/api/lancamentos', {
    cookie: cookieDe(usuario),
    body: {
      instanciaId: instancia.id,
      descricao: 'Compra valida',
      valor: 50,
      tipo: 'fixo',
      mesInicio: '2026-08',
    },
  });

  assert.equal(res.status, 201);
  assert.equal(res.corpo.lancamento.descricao, 'Compra valida');
});

test('modo ESTRITO: licenca vencida tambem bloqueia editar e excluir', async () => {
  const usuario = await criarUsuario({ login: 'estrito', diasLicenca: -5 });
  const { lancamento } = await criarDadosFinanceiros(usuario.id);
  const cookie = cookieDe(usuario);

  const edicao = await servidor.req('PUT', `/api/lancamentos/${lancamento.id}`, {
    cookie,
    body: { descricao: 'Editado' },
  });
  assert.equal(edicao.status, 403);
  assert.equal(edicao.corpo.erro, 'LICENCA_EXPIRADA');

  const exclusao = await servidor.req('DELETE', `/api/lancamentos/${lancamento.id}`, { cookie });
  assert.equal(exclusao.status, 403);
  assert.equal(exclusao.corpo.erro, 'LICENCA_EXPIRADA');

  const aindaExiste = await prisma.lancamento.findUnique({ where: { id: lancamento.id } });
  assert.ok(aindaExiste, 'o lancamento nao pode ter sido apagado');
  assert.equal(aindaExiste.descricao, 'Compra', 'a descricao nao pode ter mudado');
});

test('conta SEM licenca nenhuma e tratada como sem direito de escrita', async () => {
  const usuario = await criarUsuario({ login: 'semlicenca', diasLicenca: null });
  const { instancia } = await criarDadosFinanceiros(usuario.id);

  const res = await servidor.req('POST', '/api/lancamentos', {
    cookie: cookieDe(usuario),
    body: { instanciaId: instancia.id, descricao: 'x', valor: 1, tipo: 'fixo', mesInicio: '2026-08' },
  });

  assert.equal(res.status, 403);
  assert.equal(res.corpo.erro, 'LICENCA_EXPIRADA');
  assert.equal(res.corpo.expiraEm, null, 'sem licenca -> expiraEm null, nao ausente');
});

// ---------------------------------------------------------------------------
// Leitura permanece livre
// ---------------------------------------------------------------------------

test('leitura permanece liberada com licenca vencida', async () => {
  const usuario = await criarUsuario({ login: 'leitor', diasLicenca: -60 });
  const { instancia } = await criarDadosFinanceiros(usuario.id);
  const cookie = cookieDe(usuario);

  const dashboard = await servidor.req('GET', '/api/dashboard', { cookie });
  assert.equal(dashboard.status, 200);
  assert.ok(typeof dashboard.corpo.receitaPeriodo === 'number');

  const relatorio = await servidor.req('GET', '/api/relatorio', { cookie });
  assert.equal(relatorio.status, 200);

  const pdf = await servidor.req('GET', '/api/relatorio/pdf', { cookie });
  assert.equal(pdf.status, 200);
  assert.match(pdf.headers.get('content-type'), /application\/pdf/);

  const lancamentos = await servidor.req('GET', `/api/lancamentos?instanciaId=${instancia.id}`, { cookie });
  assert.equal(lancamentos.status, 200);
  assert.ok(Array.isArray(lancamentos.corpo.lancamentos));
});

// ---------------------------------------------------------------------------
// Regra de acumulo
// ---------------------------------------------------------------------------

test('renovacao com licenca VIGENTE empilha no fim (nao desperdica o restante)', async () => {
  const usuario = await criarUsuario({ login: 'empilha', diasLicenca: 10 });
  const antes = await prisma.licenca.findUnique({ where: { usuarioId: usuario.id } });

  const agora = new Date();
  const nova = await prisma.$transaction((tx) =>
    concederLicenca(tx, { usuarioId: usuario.id, dias: 30, origem: 'PAGAMENTO' }, agora)
  );

  const esperado = new Date(antes.expiraEm.getTime() + 30 * MS_POR_DIA);
  assert.equal(nova.expiraEm.getTime(), esperado.getTime(), 'deve empilhar sobre a validade vigente');

  const concessao = await prisma.concessaoLicenca.findFirst({ where: { usuarioId: usuario.id } });
  assert.equal(concessao.expiraEmAnterior.getTime(), antes.expiraEm.getTime());
  assert.equal(concessao.expiraEmNovo.getTime(), nova.expiraEm.getTime());
});

test('renovacao com licenca VENCIDA ha 60 dias comeca hoje (nao retroage)', async () => {
  const usuario = await criarUsuario({ login: 'vencidoha60', diasLicenca: -60 });
  const antes = await prisma.licenca.findUnique({ where: { usuarioId: usuario.id } });

  const agora = new Date();
  const nova = await prisma.$transaction((tx) =>
    concederLicenca(tx, { usuarioId: usuario.id, dias: 30, origem: 'PAGAMENTO' }, agora)
  );

  const esperado = new Date(agora.getTime() + 30 * MS_POR_DIA);
  assert.equal(nova.expiraEm.getTime(), esperado.getTime(), 'deve comecar de hoje');
  assert.ok(nova.expiraEm > agora, 'a nova validade tem que ser futura');

  // Os 60 dias perdidos nao voltam: a nova validade e' hoje+30, nao
  // vencimento_antigo+30 (que ainda estaria no passado).
  const seRetroagisse = new Date(antes.expiraEm.getTime() + 30 * MS_POR_DIA);
  assert.notEqual(nova.expiraEm.getTime(), seRetroagisse.getTime());
});

test('cada concessao gera exatamente uma linha em ConcessaoLicenca', async () => {
  const usuario = await criarUsuario({ login: 'auditoria', diasLicenca: 5 });

  for (const dias of [10, 20, 30]) {
    await prisma.$transaction((tx) =>
      concederLicenca(tx, { usuarioId: usuario.id, dias, origem: 'CORTESIA' })
    );
  }

  const concessoes = await prisma.concessaoLicenca.findMany({
    where: { usuarioId: usuario.id },
    orderBy: { aplicadaEm: 'asc' },
  });
  assert.equal(concessoes.length, 3, 'tres concessoes -> tres linhas');
  assert.deepEqual(concessoes.map((c) => c.dias), [10, 20, 30]);

  // Encadeamento integro: o "novo" de uma concessao e o "anterior" da seguinte.
  for (let i = 1; i < concessoes.length; i += 1) {
    assert.equal(
      concessoes[i].expiraEmAnterior.getTime(),
      concessoes[i - 1].expiraEmNovo.getTime(),
      'o historico tem que encadear sem buraco'
    );
  }

  // E continua existindo UMA linha corrente em Licenca.
  assert.equal(await prisma.licenca.count({ where: { usuarioId: usuario.id } }), 1);
});

// ---------------------------------------------------------------------------
// Precedencia entre os eixos de estado
// ---------------------------------------------------------------------------

test('conta SUSPENSA com licenca vigente -> 403 pelo caminho de suspensao, nao de licenca', async () => {
  const usuario = await criarUsuario({ login: 'suspenso', status: 'INATIVO', diasLicenca: 365 });
  const { instancia } = await criarDadosFinanceiros(usuario.id);

  const res = await servidor.req('POST', '/api/lancamentos', {
    cookie: cookieDe(usuario),
    body: { instanciaId: instancia.id, descricao: 'x', valor: 1, tipo: 'fixo', mesInicio: '2026-08' },
  });

  assert.equal(res.status, 403);
  assert.notEqual(res.corpo.erro, 'LICENCA_EXPIRADA', 'suspensao nao pode ser confundida com licenca');
  assert.match(res.corpo.erro, /desativada pelo administrador/i);
});

// ---------------------------------------------------------------------------
// O relogio e sempre do servidor
// ---------------------------------------------------------------------------

test('data enviada pelo cliente (corpo ou header) nao altera a avaliacao', async () => {
  const usuario = await criarUsuario({ login: 'trapaceiro', diasLicenca: -1 });
  const { instancia } = await criarDadosFinanceiros(usuario.id);
  const passado = new Date(Date.now() - 400 * MS_POR_DIA).toISOString();

  const tentativas = [
    { rotulo: 'campo agora no corpo', body: { agora: passado } },
    { rotulo: 'campo expiraEm no corpo', body: { expiraEm: '2099-01-01T00:00:00.000Z' } },
    { rotulo: 'campo licenca no corpo', body: { licenca: { expiraEm: '2099-01-01T00:00:00.000Z', vigente: true } } },
    { rotulo: 'header Date', headers: { Date: passado } },
    { rotulo: 'header X-Data-Atual', headers: { 'X-Data-Atual': passado } },
  ];

  for (const tentativa of tentativas) {
    const res = await servidor.req('POST', '/api/lancamentos', {
      cookie: cookieDe(usuario),
      headers: tentativa.headers,
      body: {
        instanciaId: instancia.id,
        descricao: 'x',
        valor: 1,
        tipo: 'fixo',
        mesInicio: '2026-08',
        ...(tentativa.body || {}),
      },
    });
    assert.equal(res.status, 403, `${tentativa.rotulo}: deveria continuar bloqueado`);
    assert.equal(res.corpo.erro, 'LICENCA_EXPIRADA', `${tentativa.rotulo}: deveria continuar LICENCA_EXPIRADA`);
  }

  // E o inverso: licenca vigente nao pode ser derrubada por data do cliente.
  const valido = await criarUsuario({ login: 'honesto', diasLicenca: 30 });
  const dados = await criarDadosFinanceiros(valido.id);
  const res = await servidor.req('POST', '/api/lancamentos', {
    cookie: cookieDe(valido),
    headers: { Date: new Date(Date.now() + 400 * MS_POR_DIA).toUTCString() },
    body: {
      instanciaId: dados.instancia.id,
      descricao: 'ok',
      valor: 1,
      tipo: 'fixo',
      mesInicio: '2026-08',
      agora: '2099-01-01T00:00:00.000Z',
    },
  });
  assert.equal(res.status, 201);
});

test('licencaVigente compara contra o instante recebido, nunca contra dado do cliente', () => {
  const agora = new Date('2026-08-08T12:00:00.000Z');
  assert.equal(licencaVigente({ expiraEm: new Date('2026-08-09T00:00:00.000Z') }, agora), true);
  assert.equal(licencaVigente({ expiraEm: new Date('2026-08-07T00:00:00.000Z') }, agora), false);
  assert.equal(licencaVigente(null, agora), false);
  // Limite exato: expirar "agora" nao e' mais vigente.
  assert.equal(licencaVigente({ expiraEm: agora }, agora), false);
});

// ---------------------------------------------------------------------------
// Cadastro
// ---------------------------------------------------------------------------

test('cadastro cria licenca de LICENCA_PADRAO_DIAS na mesma transacao', async () => {
  await prisma.voucher.create({ data: { codigo: 'DOM-TEST-0001', status: 'ATIVO' } });
  const dias = Number(process.env.LICENCA_PADRAO_DIAS ?? 30);
  const antes = Date.now();

  const res = await servidor.req('POST', '/api/auth/cadastro', {
    body: {
      nome: 'Novo Usuario',
      login: 'novousuario',
      senha: 'senha-forte-123',
      confirmacao: 'senha-forte-123',
      voucher: 'DOM-TEST-0001',
    },
  });

  assert.equal(res.status, 201);

  const usuario = await prisma.usuario.findFirst({
    where: { login: 'novousuario' },
    include: { licenca: true, concessoes: true },
  });

  assert.ok(usuario.licenca, 'conta nova precisa nascer com licenca');
  assert.equal(usuario.licenca.origem, 'VOUCHER');
  assert.ok(licencaVigente(usuario.licenca), 'a licenca do cadastro tem que estar vigente');

  const esperadoMin = antes + dias * MS_POR_DIA - 5000;
  const esperadoMax = Date.now() + dias * MS_POR_DIA + 5000;
  assert.ok(
    usuario.licenca.expiraEm.getTime() >= esperadoMin && usuario.licenca.expiraEm.getTime() <= esperadoMax,
    `expiraEm deveria ser ~hoje+${dias}d`
  );

  assert.equal(usuario.concessoes.length, 1);
  assert.equal(usuario.concessoes[0].dias, dias);
  assert.equal(usuario.concessoes[0].expiraEmAnterior, null);

  // referenciaId aponta pro voucher consumido.
  const voucher = await prisma.voucher.findUnique({ where: { codigo: 'DOM-TEST-0001' } });
  assert.equal(usuario.concessoes[0].referenciaId, voucher.id);
  assert.equal(voucher.status, 'USADO');
});

test('falha no meio da transacao de cadastro nao deixa usuario sem licenca nem voucher consumido', async () => {
  await prisma.voucher.create({ data: { codigo: 'DOM-TEST-0002', status: 'ATIVO' } });

  // LICENCA_PADRAO_DIAS invalido faria concederLicenca lancar... mas o
  // helper licencaPadraoDias() cai no default 30 justamente pra isso nao
  // derrubar cadastro em producao. Entao forcamos a falha de verdade, no
  // ponto mais tardio da transacao: uma origem invalida na CHECK do banco.
  // Simulamos isso com um voucher que sera consumido e um erro posterior,
  // usando o mesmo caminho real: cadastro com login que colide APOS o
  // consumo do voucher e impossivel, entao exercitamos a transacao direto.
  const antesUsuarios = await prisma.usuario.count();

  await assert.rejects(
    prisma.$transaction(async (tx) => {
      const usuario = await tx.usuario.create({
        data: { nome: 'Fantasma', login: 'fantasma', senha: 'x', role: 'USER', status: 'ATIVO' },
      });
      await tx.$executeRaw`
        UPDATE "Voucher" SET "status" = 'USADO', "usuarioId" = ${usuario.id}, "utilizadoEm" = ${new Date()}
        WHERE "codigo" = 'DOM-TEST-0002' AND "status" = 'ATIVO'
      `;
      // Falha DEPOIS do consumo do voucher e da criacao do usuario.
      await concederLicenca(tx, { usuarioId: usuario.id, dias: 0, origem: 'VOUCHER' });
    })
  );

  assert.equal(await prisma.usuario.count(), antesUsuarios, 'o usuario nao pode ter sobrado');
  assert.equal(await prisma.usuario.count({ where: { login: 'fantasma' } }), 0);

  const voucher = await prisma.voucher.findUnique({ where: { codigo: 'DOM-TEST-0002' } });
  assert.equal(voucher.status, 'ATIVO', 'o voucher tem que ter voltado a ficar disponivel');
  assert.equal(voucher.usuarioId, null);
  assert.equal(await prisma.licenca.count(), 0);
  assert.equal(await prisma.concessaoLicenca.count(), 0);
});

// ---------------------------------------------------------------------------
// Exposicao do estado
// ---------------------------------------------------------------------------

test('GET /api/auth/me expoe o estado da licenca', async () => {
  const usuario = await criarUsuario({ login: 'exposto', diasLicenca: 30, origem: 'MIGRACAO' });

  const res = await servidor.req('GET', '/api/auth/me', { cookie: cookieDe(usuario) });

  assert.equal(res.status, 200);
  assert.equal(res.corpo.usuario.login, 'exposto');
  assert.equal(res.corpo.licenca.vigente, true);
  assert.equal(res.corpo.licenca.origem, 'MIGRACAO');
  assert.equal(res.corpo.licenca.diasRestantes, 30);
  assert.match(res.corpo.licenca.expiraEm, /^\d{4}-\d{2}-\d{2}T/);
  // A senha nunca vaza junto.
  assert.equal(res.corpo.usuario.senha, undefined);
});

test('GET /api/auth/me com licenca vencida: vigente=false e diasRestantes nunca negativo', async () => {
  const usuario = await criarUsuario({ login: 'expostovencido', diasLicenca: -45 });

  const res = await servidor.req('GET', '/api/auth/me', { cookie: cookieDe(usuario) });

  assert.equal(res.status, 200);
  assert.equal(res.corpo.licenca.vigente, false);
  assert.equal(res.corpo.licenca.diasRestantes, 0, 'nunca negativo');
});

test('GET /api/auth/me sem licenca devolve a chave com null (nunca omitida)', async () => {
  const usuario = await criarUsuario({ login: 'expostosem', diasLicenca: null });

  const res = await servidor.req('GET', '/api/auth/me', { cookie: cookieDe(usuario) });

  assert.equal(res.status, 200);
  assert.ok('licenca' in res.corpo, 'a chave precisa existir mesmo sem licenca');
  assert.equal(res.corpo.licenca, null);
});

// ---------------------------------------------------------------------------
// Rotas admin nao entram na regra de licenca
// ---------------------------------------------------------------------------

test('admin opera sobre contas mesmo sem licenca vigente propria', async () => {
  const admin = await criarUsuario({ login: 'adminsemlic', role: 'ADMIN', diasLicenca: -100 });
  const alvo = await criarUsuario({ login: 'alvo', diasLicenca: 30 });

  const res = await servidor.req('PATCH', `/api/admin/usuarios/${alvo.id}/status`, {
    cookie: cookieDe(admin),
    body: { status: 'INATIVO' },
  });

  assert.equal(res.status, 200);
  assert.equal(res.corpo.usuario.status, 'INATIVO');
});

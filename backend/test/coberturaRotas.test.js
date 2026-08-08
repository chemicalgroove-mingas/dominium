// TESTE DE COBERTURA DE ROTAS — o item mais importante do PR A.
//
// Objetivo: um router novo criado daqui a seis meses NAO pode nascer
// desprotegido em silencio. Em vez de listar as rotas conhecidas a mao (que
// envelhece no dia seguinte), este teste percorre a arvore de rotas que o
// Express realmente registrou em tempo de execucao e cobra, de cada rota
// mutante sob /api, ou a presenca de `exigirLicencaParaEscrita` na cadeia, ou
// uma entrada na allow-list curta e explicita abaixo.
require('./helpers');

const test = require('node:test');
const assert = require('node:assert/strict');

const { criarApp } = require('../src/app');
const { exigirLicencaParaEscrita } = require('../src/middleware/auth');

const METODOS_MUTANTES = ['post', 'put', 'patch', 'delete'];

// Allow-list deliberadamente curta. Cada linha e uma rota mutante que NAO deve
// exigir licenca, com o motivo:
//   - /api/auth/*  : autenticacao e gestao da propria sessao/senha. Bloquear
//                    por licenca aqui trancaria o usuario pra fora da conta —
//                    e a conta nunca vence, so o direito de escrever dados.
//   - /api/admin/* : operacao da plataforma. O admin nao tem dados financeiros
//                    e precisa justamente conseguir agir sobre contas vencidas.
const ALLOW_LIST = new Set([
  'POST /api/auth/cadastro',
  'POST /api/auth/login',
  'POST /api/auth/logout',
  'POST /api/auth/trocar-senha',
  'POST /api/admin/vouchers',
  'POST /api/admin/vouchers/lote',
  'PATCH /api/admin/vouchers/:id/revogar',
  'DELETE /api/admin/vouchers/:id',
  'PATCH /api/admin/usuarios/:id/status',
  'PATCH /api/admin/usuarios/:id/senha',
  'DELETE /api/admin/usuarios/:id',
]);

// Reconstroi o caminho de montagem a partir do regexp da layer (Express 4 nao
// guarda o path original em lugar nenhum acessivel).
function caminhoDaLayer(layer) {
  if (!layer.regexp || layer.regexp.fast_slash) return '';
  return layer.regexp.source
    .replace(/^\^/, '')
    .replace(/\\\/\?\(\?=\\\/\|\$\)$/, '')
    .replace(/\\\/\?\$$/, '')
    .replace(/\$$/, '')
    .replace(/\\\//g, '/');
}

function juntar(prefixo, sufixo) {
  const caminho = `${prefixo}${sufixo === '/' ? '' : sufixo}`;
  return caminho === '' ? '/' : caminho;
}

// Percorre recursivamente a arvore, propagando os middlewares herdados de cada
// router (os registrados via router.use, que valem para todas as rotas dele).
function coletarRotas(stack, prefixo = '', herdados = []) {
  const rotas = [];
  const doNivel = [...herdados];

  for (const layer of stack) {
    if (layer.route) {
      const caminho = juntar(prefixo, layer.route.path);
      const handlersDaRota = layer.route.stack.map((l) => l.handle);
      const metodos = Object.keys(layer.route.methods).filter((m) => layer.route.methods[m]);
      for (const metodo of metodos) {
        rotas.push({
          metodo: metodo.toUpperCase(),
          caminho,
          middlewares: [...doNivel, ...handlersDaRota],
        });
      }
    } else if (layer.handle && layer.handle.stack) {
      rotas.push(...coletarRotas(layer.handle.stack, juntar(prefixo, caminhoDaLayer(layer)), doNivel));
    } else if (layer.handle) {
      // router.use(mw) — vale para todas as rotas registradas neste router.
      doNivel.push(layer.handle);
    }
  }

  return rotas;
}

function todasAsRotas() {
  const app = criarApp();
  const stack = app._router ? app._router.stack : app.router.stack;
  return coletarRotas(stack).filter((r) => r.caminho.startsWith('/api'));
}

test('toda rota mutante sob /api exige licenca ou esta na allow-list', () => {
  const rotas = todasAsRotas();
  const mutantes = rotas.filter((r) => METODOS_MUTANTES.includes(r.metodo.toLowerCase()));

  const desprotegidas = mutantes
    .filter((r) => !r.middlewares.includes(exigirLicencaParaEscrita))
    .map((r) => `${r.metodo} ${r.caminho}`)
    .filter((chave) => !ALLOW_LIST.has(chave));

  assert.deepEqual(
    desprotegidas,
    [],
    'Rota(s) mutante(s) sem exigirLicencaParaEscrita e fora da allow-list:\n  ' +
      desprotegidas.join('\n  ') +
      '\n\nSe a rota deve exigir licenca, aplique exigirLicencaParaEscrita no router.' +
      '\nSe ela NAO deve (auth/admin), acrescente-a a ALLOW_LIST com justificativa.'
  );
});

test('a allow-list nao tem entrada morta (rota que nao existe mais)', () => {
  const existentes = new Set(todasAsRotas().map((r) => `${r.metodo} ${r.caminho}`));
  const mortas = [...ALLOW_LIST].filter((chave) => !existentes.has(chave));

  assert.deepEqual(mortas, [], `Entrada(s) da allow-list sem rota correspondente: ${mortas.join(', ')}`);
});

// Numeros conferidos contra a AUDITORIA_FASE0.md, item 6.1/6.2. Se divergirem,
// o teste falha e obriga uma decisao consciente em vez de um ajuste silencioso.
//
// Sao 47 rotas e 25 mutantes, nao 48 e 24: as duas linhas de total da auditoria
// tinham erro de soma (as tabelas dela sempre enumeraram 47 e 25). Conferido
// rota a rota na primeira execucao deste teste; o documento foi corrigido.
test('a superficie da API continua com 47 rotas, 25 delas mutando estado financeiro', () => {
  const rotas = todasAsRotas();
  const mutantesFinanceiras = rotas.filter(
    (r) =>
      METODOS_MUTANTES.includes(r.metodo.toLowerCase()) &&
      r.middlewares.includes(exigirLicencaParaEscrita)
  );

  assert.equal(rotas.length, 47, `Esperado 47 rotas sob /api, encontradas ${rotas.length}.`);
  assert.equal(
    mutantesFinanceiras.length,
    25,
    `Esperado 25 rotas mutando estado financeiro, encontradas ${mutantesFinanceiras.length}.`
  );
});

test('nenhuma rota de leitura foi bloqueada por engano', () => {
  // GET/HEAD nunca podem depender de licenca. O middleware ja libera por
  // metodo, mas este teste trava a intencao: se alguem trocar a checagem por
  // uma que bloqueie leitura, quebra aqui.
  const leituras = todasAsRotas().filter((r) => r.metodo === 'GET');
  assert.ok(leituras.length > 0, 'Nenhuma rota GET encontrada — a coleta de rotas quebrou.');

  for (const rota of leituras) {
    const res = { statusCode: null, corpo: null };
    let passou = false;
    exigirLicencaParaEscrita(
      { method: 'GET', licenca: null },
      {
        status(codigo) {
          res.statusCode = codigo;
          return { json: (c) => { res.corpo = c; } };
        },
      },
      () => { passou = true; }
    );
    assert.ok(passou, `GET ${rota.caminho} seria bloqueado sem licenca — leitura nunca pode bloquear.`);
  }
});

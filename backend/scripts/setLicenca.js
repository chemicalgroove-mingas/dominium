#!/usr/bin/env node
// Ajuste manual de licenca por linha de comando.
//
// Serve para (a) testar os estados de vencimento em desenvolvimento e (b)
// intervencao pontual em producao enquanto o painel admin nao tem essa funcao.
//
// Passa SEMPRE por concederLicenca — nunca escreve direto na tabela — pra que
// o historico em ConcessaoLicenca continue integro e toda validade permaneca
// explicavel por uma concessao.
//
// Uso:
//   node scripts/setLicenca.js --login mingas --dias 30
//   node scripts/setLicenca.js --login mingas --ate 2027-12-31
//   node scripts/setLicenca.js --login mingas --dias 30 --origem CORTESIA
//   node scripts/setLicenca.js --login mingas --ate 2026-07-09 --forcar   (data no passado)
//
// --dias N   : empilha N dias a partir de max(agora, expiraEm atual).
// --ate DATA : concede dias inteiros suficientes para cobrir ATE aquela data,
//              respeitando a mesma regra de acumulo. Como ConcessaoLicenca so
//              aceita dias inteiros (CHECK dias > 0), o resultado e' sempre
//              ">= a data pedida", podendo passar algumas horas dela — a
//              diferenca e' informada na saida.
require('dotenv').config();

const prisma = require('../src/lib/prisma');
const { normalizarLogin } = require('../src/utils/login');
const { concederLicenca, ORIGENS, MS_POR_DIA } = require('../src/utils/licenca');

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const atual = argv[i];
    if (!atual.startsWith('--')) continue;
    const chave = atual.slice(2);
    const proximo = argv[i + 1];
    if (proximo && !proximo.startsWith('--')) {
      args[chave] = proximo;
      i += 1;
    } else {
      args[chave] = true;
    }
  }
  return args;
}

function ajuda() {
  console.log(`
Uso: node scripts/setLicenca.js --login <login> (--dias <n> | --ate <AAAA-MM-DD>) [--origem <ORIGEM>] [--forcar]

  --login   login do usuario (normalizado igual ao cadastro)
  --dias    numero inteiro positivo de dias a conceder
  --ate     data final desejada (AAAA-MM-DD, interpretada como 23:59:59 UTC).
            Concede dias inteiros, entao a validade final fica >= essa data.
  --origem  ${ORIGENS.join(' | ')}   (padrao: CORTESIA)
  --forcar  permite --ate no passado (util pra testar licenca vencida em dev)
`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help || args.h) {
    ajuda();
    return;
  }

  const login = typeof args.login === 'string' ? normalizarLogin(args.login) : null;
  if (!login) {
    ajuda();
    throw new Error('--login e obrigatorio.');
  }

  const origem = typeof args.origem === 'string' ? args.origem.toUpperCase() : 'CORTESIA';
  if (!ORIGENS.includes(origem)) {
    throw new Error(`--origem invalida "${origem}". Use uma de: ${ORIGENS.join(', ')}.`);
  }

  if ((args.dias && args.ate) || (!args.dias && !args.ate)) {
    ajuda();
    throw new Error('Informe exatamente um entre --dias e --ate.');
  }

  const usuario = await prisma.usuario.findFirst({
    where: { login, deletadoEm: null },
    include: { licenca: true },
  });
  if (!usuario) throw new Error(`Usuario "${login}" nao encontrado (ou esta excluido).`);

  const agora = new Date();
  let dias;
  let alvoPedido = null;

  if (args.dias) {
    dias = Number(args.dias);
    if (!Number.isInteger(dias) || dias <= 0) throw new Error('--dias precisa ser um inteiro positivo.');
  } else {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(args.ate))) {
      throw new Error('--ate precisa estar no formato AAAA-MM-DD.');
    }
    const alvo = new Date(`${args.ate}T23:59:59.000Z`);
    if (Number.isNaN(alvo.getTime())) throw new Error(`--ate invalida: "${args.ate}".`);
    alvoPedido = alvo;

    // Mesma base de acumulo de concederLicenca, pra que "--ate X" resulte
    // exatamente em X (empilhando sobre a licenca vigente, se houver).
    const atual = usuario.licenca;
    const base = atual && atual.expiraEm > agora ? atual.expiraEm : agora;
    const deltaMs = alvo.getTime() - base.getTime();

    if (deltaMs <= 0) {
      if (!args.forcar) {
        throw new Error(
          `--ate ${args.ate} nao avanca a validade atual (${base.toISOString()}). ` +
            'Use --forcar se a intencao e mesmo reduzir/vencer (so faz sentido em dev).'
        );
      }
      // Reducao/vencimento manual so existe pra dev: como concederLicenca nunca
      // encurta (dias > 0 por constraint), aqui a Licenca e ajustada direto e
      // isso e registrado como tal na saida — nao gera ConcessaoLicenca porque
      // nao houve concessao nenhuma.
      const licenca = await prisma.licenca.update({
        where: { usuarioId: usuario.id },
        data: { expiraEm: alvo, origem },
      });
      console.log(`[FORCADO] Licenca de "${login}" ajustada para ${licenca.expiraEm.toISOString()} (origem ${origem}).`);
      console.log('Nenhuma ConcessaoLicenca gerada: reducao manual nao e concessao.');
      return;
    }

    dias = Math.ceil(deltaMs / MS_POR_DIA);
  }

  const licenca = await prisma.$transaction((tx) =>
    concederLicenca(tx, { usuarioId: usuario.id, dias, origem, referenciaId: null }, agora)
  );

  const anterior = usuario.licenca ? usuario.licenca.expiraEm.toISOString() : '(sem licenca)';
  console.log(`Usuario:   ${usuario.login} (${usuario.id})`);
  console.log(`Anterior:  ${anterior}`);
  console.log(`Concedido: ${dias} dia(s), origem ${origem}`);
  console.log(`Novo:      ${licenca.expiraEm.toISOString()}`);

  if (alvoPedido && licenca.expiraEm.getTime() !== alvoPedido.getTime()) {
    const horas = Math.round((licenca.expiraEm.getTime() - alvoPedido.getTime()) / 3600000);
    console.log(
      `Nota:      voce pediu ${alvoPedido.toISOString()}; como a concessao e em dias inteiros, ` +
        `a validade ficou ${horas}h alem disso.`
    );
  }
}

main()
  .catch((err) => {
    console.error(`Falha: ${err.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

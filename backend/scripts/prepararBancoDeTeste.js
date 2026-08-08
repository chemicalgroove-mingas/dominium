#!/usr/bin/env node
// Aplica as migrations no banco de teste antes da suite rodar.
//
// Roda `prisma migrate deploy` (nao `migrate dev`): so aplica o que ja esta
// versionado, nunca gera migration nova nem pede reset interativo.
//
// Recusa-se a rodar sem TEST_DATABASE_URL — o banco de teste e truncado a cada
// caso, e apontar isso pra dev (ou pior, producao) apagaria dados reais.
require('dotenv').config();

const { execFileSync } = require('node:child_process');

const url = process.env.TEST_DATABASE_URL;

if (!url) {
  console.error(
    'TEST_DATABASE_URL nao definida. Defina um banco DESCARTAVEL (a suite trunca todas as tabelas).\n' +
      'Ex.: TEST_DATABASE_URL="postgresql://dominium@127.0.0.1:5434/dominium_test"'
  );
  process.exit(1);
}

if (/supabase\.(co|com)/i.test(url)) {
  console.error('TEST_DATABASE_URL aponta para o Supabase. Recusando: a suite APAGA todas as tabelas.');
  process.exit(1);
}

execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
  stdio: 'inherit',
  env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url },
});

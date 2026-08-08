# AUDITORIA_FASE0 — Estado de linha de base do DOMINIUM

Data da auditoria: 2026-08-08
Branch inspecionada: `feat/duas-colunas-ui` (working tree limpa, commit `b88ae99`)
Escopo: leitura de código + consultas somente-leitura ao Postgres de produção
(Supabase) usando as credenciais já presentes em `backend/.env`. Nenhum arquivo
existente foi alterado; nenhuma escrita no banco foi executada.

---

## Sumário — pontos que exigem decisão sua

1. **Não existe nenhum mecanismo de recuperação de conta.** Nenhum campo de chave/código/token de reset, nem hasheado, nem cifrado, nem em texto puro.
2. **`Usuario.status` é um único enum `ATIVO|INATIVO`** (com CHECK no banco) que hoje mistura "suspensão administrativa" e "acesso permitido" — é o mesmo campo lido no login e no middleware.
3. **Voucher concede acesso binário, não tempo.** `expiraEm` é a validade do *cupom*, não do acesso da conta; `utilizadoEm` existe e está preenchido.
4. **O código do voucher está em texto puro** no banco, com `UNIQUE` — consumo já é atômico (UPDATE condicional em transação), sem corrida.
5. **Zero rotinas sem sessão de usuário**: nenhum cron, job, worker, trigger, view materializada, função Postgres ou policy RLS. Confirmado no código e no catálogo do banco.
6. **Nenhuma agregação de valor no lado do banco** — todo `SUM` é feito em JavaScript. Exceção: `valorAbatido`/`valorRendimento` são atualizados com `increment`/`decrement` (aritmética dentro do UPDATE), em 4 pontos.
7. **CHECK constraints do Postgres operam sobre campos monetários** (`valor > 0`, `valorPago > 0`, `valor != 0`) — cifrar essas colunas quebra as constraints.
8. **Não há busca textual** (`ILIKE`, full-text, campo de pesquisa) sobre `descricao`/`observacoes` em lugar nenhum.
9. **`Lancamento.descricao` é renderizada em PDF gerado no servidor** (`GET /api/relatorio/pdf`) — cifragem exigiria a chave no servidor ou mudança para geração no cliente.
10. **Produção tem 2 contas**: `admin` (ADMIN, 0 dados) e `mingas` (USER, 33 lançamentos). Nenhuma conta de terceiro real.
11. **3 vouchers marcados `USADO` estão com `usuarioId = NULL`** — indício de 3 contas apagadas em hard delete (`onDelete: SetNull`), embora a rota admin só faça soft delete.
12. **Não existe rota para o usuário alterar o próprio login/nome.** Só troca de senha (`POST /api/auth/trocar-senha`).
13. **Sessão é JWT de 7 dias em cookie httpOnly, sem refresh e sem registro de dispositivo**; o token não é revogável (só via `status`/`deletadoEm`).
14. **O IndexedDB guarda valores financeiros** (`snapshots` das telas + `outbox` com os lançamentos digitados), contrariando a política declarada nos comentários do service worker de que "dado financeiro nunca vem do cache".
15. **`backend/.env` local aponta para o banco de produção** (Supabase), não para SQLite — o `.env.example` ainda descreve SQLite local.

---

## Parte 1 — Autenticação e conta

### 1.1 Modelo de usuário

Arquivo: [schema.prisma:14-32](backend/prisma/schema.prisma#L14-L32).
DDL correspondente: [migration.sql](backend/prisma/migrations/20260801004809_init/migration.sql).

| Campo | Tipo (Postgres) | Nulo | Default | Índice / constraint |
|---|---|---|---|---|
| `id` | `TEXT` | não | `uuid()` (gerado pelo Prisma, não pelo banco) | PK `Usuario_pkey` |
| `nome` | `TEXT` | não | — | — |
| `login` | `TEXT` | não | — | `UNIQUE Usuario_login_key` |
| `senha` | `TEXT` | não | — | — |
| `role` | `TEXT` | não | `'USER'` | `CHECK role IN ('USER','ADMIN')` |
| `status` | `TEXT` | não | `'ATIVO'` | `CHECK status IN ('ATIVO','INATIVO')` |
| `deveTrocarSenha` | `BOOLEAN` | não | `false` | — |
| `ultimoLogin` | `TIMESTAMP(3)` | sim | — | — |
| `deletadoEm` | `TIMESTAMP(3)` | sim | — | — |
| `criadoEm` | `TIMESTAMP(3)` | não | `CURRENT_TIMESTAMP` | — |
| `atualizadoEm` | `TIMESTAMP(3)` | não | `@updatedAt` (aplicação) | — |

Índices reais confirmados no banco de produção: apenas `Usuario_pkey` (id) e
`Usuario_login_key` (login). Não há índice em `status`, `role` ou `deletadoEm`,
apesar de todas as consultas filtrarem por `deletadoEm: null`.

Relações: `instancias`, `lancamentos`, `pagamentos`, `investimentos` (todas
`onDelete: Cascade`) e `vouchers` (`onDelete: SetNull`).

### 1.2 Chave de recuperação / token de reset

**Não existe.** Nenhum campo de chave de recuperação, código de recuperação,
token de reset ou segredo de recuperação em nenhum modelo do schema. Nenhuma
rota de "esqueci minha senha". O único caminho de recuperação hoje é
`PATCH /api/admin/usuarios/:id/senha`, em que o administrador define uma nova
senha e o sistema marca `deveTrocarSenha = true`
([usuariosAdmin.js:50-65](backend/src/routes/usuariosAdmin.js#L50-L65)).

### 1.3 Armazenamento da senha

bcrypt (`bcryptjs` ^2.4.3), **cost factor 12**, em três pontos, todos com o
mesmo parâmetro:

- Cadastro: [auth.js:62](backend/src/routes/auth.js#L62) — `bcrypt.hash(senha, 12)`
- Troca de senha pelo usuário: [auth.js:168](backend/src/routes/auth.js#L168)
- Reset pelo admin: [usuariosAdmin.js:59](backend/src/routes/usuariosAdmin.js#L59)
- Seed do admin: [seed.js:27](backend/prisma/seed.js#L27)

bcrypt não tem parâmetro de memória nem de paralelismo — só o custo (2^12
iterações). Não há Argon2/scrypt em uso. Verificação sempre via
`bcrypt.compare` ([auth.js:124](backend/src/routes/auth.js#L124),
[auth.js:163](backend/src/routes/auth.js#L163)).

### 1.4 Campo de status

Um único campo, `Usuario.status`, com dois valores possíveis, garantidos por
CHECK constraint no banco: `ATIVO` e `INATIVO`.

Onde é escrito:
- Criação (cadastro e seed): sempre `ATIVO`.
- `PATCH /api/admin/usuarios/:id/status` — admin alterna entre os dois ([usuariosAdmin.js:32-46](backend/src/routes/usuariosAdmin.js#L32-L46)).
- `DELETE /api/admin/usuarios/:id` — soft delete grava `deletadoEm` **e** `status: 'INATIVO'` juntos ([usuariosAdmin.js:74-77](backend/src/routes/usuariosAdmin.js#L74-L77)).

Onde é lido:
- Login: `status !== 'ATIVO'` → 403 "Sua conta foi desativada pelo administrador" ([auth.js:120-122](backend/src/routes/auth.js#L120-L122)).
- Middleware `autenticar`, a cada requisição autenticada: mesma checagem, mesma mensagem ([auth.js:30-32](backend/src/middleware/auth.js#L30-L32)).
- Serialização para o painel admin ([usuariosAdmin.js:16](backend/src/routes/usuariosAdmin.js#L16)).

**Confirmação do que você perguntou:** sim, hoje há um único campo misturando
estados de natureza diferente. `INATIVO` significa simultaneamente "suspenso
pelo administrador" e "sem acesso", e é também o estado colateral do soft
delete. Não existe nenhum campo separado de situação de acesso, de vigência,
de licença ou de período. A mensagem de erro é a mesma nos dois cenários
(suspensão e exclusão lógica), embora a exclusão lógica seja detectada antes,
pelo filtro `deletadoEm: null`.

### 1.5 Sessão

- **Mecanismo:** JWT assinado com `jsonwebtoken` (HS256, default da lib), transportado em cookie.
- **Payload:** apenas `{ id }` ([auth.js:61](backend/src/middleware/auth.js#L61)). Role e status nunca vêm do token — são relidos do banco a cada requisição ([auth.js:22-32](backend/src/middleware/auth.js#L22-L32)).
- **Cookie:** nome `dominium_token`; `httpOnly: true`, `secure` só quando `NODE_ENV === 'production'`, `sameSite: 'lax'`, `maxAge` 7 dias, `path: '/'` ([auth.js:66-72](backend/src/middleware/auth.js#L66-L72)).
- **Expiração do token:** `JWT_EXPIRES_IN` (env), default e valor atual `7d`; sanitizado por `expiresInValido()` que cai em `'7d'` se o formato for inválido ([auth.js:55-58](backend/src/middleware/auth.js#L55-L58)).
- **Refresh:** não existe. Não há rota de refresh, nem renovação silenciosa, nem sliding expiration — o cookie e o token são emitidos apenas em `/login` e `/cadastro`.
- **Registro de dispositivo:** não existe. Nenhuma tabela de sessões, nenhum device id, nenhum user agent registrado. `ultimoLogin` (único carimbo por usuário) é o único rastro.
- **Revogação:** não há lista de tokens revogados. Um JWT válido só perde efeito por expiração ou porque o middleware relê `status`/`deletadoEm` do banco.
- **Rate limit:** `express-rate-limit` em memória, 5 tentativas/15min no login e 10/hora no cadastro ([rateLimit.js](backend/src/middleware/rateLimit.js)). Em ambiente serverless o contador é por instância.
- **Guarda no frontend:** o middleware Next ([proxy.ts](frontend/src/proxy.ts)) só checa **presença** do cookie, não validade; a validação real é o `GET /api/auth/me`.

### 1.6 Endpoints de auto-serviço da conta

- **Senha própria:** `POST /api/auth/trocar-senha` ([auth.js:156-175](backend/src/routes/auth.js#L156-L175)). Exige `autenticar`. Validação zod: `senhaAtual` não vazia, `novaSenha` ≥ 8 caracteres, `confirmacao` igual à nova. Confere a senha atual com `bcrypt.compare` antes de gravar e zera `deveTrocarSenha`. Não há verificação de força além do tamanho mínimo, nem bloqueio de reutilização da senha anterior, nem invalidação da sessão após a troca.
- **Login/nome próprios:** **não existe rota.** `nome` e `login` só são gravados no cadastro; nem o usuário nem o administrador têm endpoint para alterá-los depois.

---

## Parte 2 — Voucher e administração

### 2.1 Modelo de voucher

Arquivo: [schema.prisma:35-46](backend/prisma/schema.prisma#L35-L46).

| Campo | Tipo | Nulo | Default | Índice / constraint |
|---|---|---|---|---|
| `id` | `TEXT` | não | `uuid()` | PK |
| `codigo` | `TEXT` | não | — | `UNIQUE Voucher_codigo_key` |
| `status` | `TEXT` | não | `'ATIVO'` | `CHECK status IN ('ATIVO','USADO','REVOGADO','EXPIRADO')` |
| `usuarioId` | `TEXT` | sim | — | FK → `Usuario.id`, `ON DELETE SET NULL` |
| `criadoEm` | `TIMESTAMP(3)` | não | `CURRENT_TIMESTAMP` | — |
| `utilizadoEm` | `TIMESTAMP(3)` | sim | — | — |
| `expiraEm` | `TIMESTAMP(3)` | sim | — | — |
| `criadoPor` | `TEXT` | sim | — | login do admin, texto solto (não FK) |
| `observacao` | `TEXT` | sim | — | — |

Observação: o valor `EXPIRADO` existe na CHECK constraint mas **nunca é
escrito** por nenhum ponto do código. A expiração é derivada em tempo de
leitura (`serializar()` calcula um booleano `expirado`,
[vouchers.js:13-18](backend/src/routes/vouchers.js#L13-L18)).

### 2.2 Geração e armazenamento do código

**Texto puro.** O código é gravado como veio e comparado literalmente no
cadastro — não há hash nem cifragem.

Geração: [voucher.js](backend/src/utils/voucher.js).
- Fonte de aleatoriedade: `crypto.randomBytes` (CSPRNG do Node).
- Alfabeto de 31 símbolos, sem caracteres ambíguos: `ABCDEFGHJKMNPQRSTUVWXYZ23456789`.
- Formato: `PREFIXO-XXXX-XXXX-XXXX` (default `DOM`, 3 segmentos de 4). Em lote o prefixo (1–10 chars) e o comprimento do segmento (3–8) são parametrizáveis.
- Entropia no formato default: 12 símbolos × log2(31) ≈ **59,5 bits**.
- Viés: `bytes[i] % 31` introduz viés modular leve (256 não é múltiplo de 31); efeito prático desprezível para esse tamanho, mas é um desvio de uniformidade.
- Colisão: tratada por retry de até 5 tentativas em cima do erro `P2002` do unique ([vouchers.js:42-60](backend/src/routes/vouchers.js#L42-L60)).

No cadastro, o código digitado é normalizado com `trim().toUpperCase()` antes
da comparação ([auth.js:49](backend/src/routes/auth.js#L49)).

### 2.3 Consumo do voucher — atomicidade

**É atômico.** Não é check-then-write. O consumo acontece dentro de
`prisma.$transaction` e usa um UPDATE condicional cujo próprio `WHERE` carrega
todas as pré-condições ([auth.js:65-87](backend/src/routes/auth.js#L65-L87)):

```js
const usuario = await prisma.$transaction(async (tx) => {
  const novoUsuario = await tx.usuario.create({ ... });

  const linhasAfetadas = await tx.$executeRaw`
    UPDATE "Voucher"
    SET "status" = 'USADO', "usuarioId" = ${novoUsuario.id}, "utilizadoEm" = ${new Date()}
    WHERE "codigo" = ${codigoVoucher}
      AND "status" = 'ATIVO'
      AND ("expiraEm" IS NULL OR "expiraEm" >= ${new Date()})
  `;

  if (linhasAfetadas === 0) throw new Error('VOUCHER_INVALIDO');
  return novoUsuario;
});
```

Se duas requisições concorrerem pelo mesmo código, a segunda encontra
`status != 'ATIVO'`, recebe `linhasAfetadas === 0`, e a transação inteira é
desfeita — inclusive o usuário recém-criado. A unicidade de login é protegida
em paralelo pelo unique index (`P2002` tratado em
[auth.js:96-98](backend/src/routes/auth.js#L96-L98)).

Nota: a checagem prévia de login duplicado ([auth.js:55-60](backend/src/routes/auth.js#L55-L60))
é um check-then-write, mas com fallback correto no unique constraint.

### 2.4 Voucher concede tempo ou acesso binário?

**Acesso binário.** Consumir um voucher cria a conta; nada mais. Não existe
nenhum campo de duração de licença, vigência, data de início/fim de acesso ou
período concedido — nem no `Voucher`, nem no `Usuario`.

Os únicos campos temporais do voucher são: `criadoEm`, `utilizadoEm` (quando
foi consumido) e `expiraEm`. **`expiraEm` é a validade do cupom em si** — o
prazo até quando ele ainda pode ser resgatado —, verificada só no momento do
consumo (`AND ("expiraEm" IS NULL OR "expiraEm" >= now)`). Depois de usado,
`expiraEm` não é lido em nenhum lugar e não tem qualquer efeito sobre a conta.

Em produção, **todos os 10 vouchers têm `expiraEm = NULL`**.

### 2.5 Rotas do painel administrativo

Todas montadas sob `router.use(autenticar, exigirRole('ADMIN'))`
([vouchers.js:9](backend/src/routes/vouchers.js#L9),
[usuariosAdmin.js:9](backend/src/routes/usuariosAdmin.js#L9)).

| Método | Rota | O que acessa |
|---|---|---|
| GET | `/api/admin/vouchers?status=` | Lista vouchers (filtro `ativos|usados|revogados`), com `{id, nome, login}` do usuário que resgatou |
| POST | `/api/admin/vouchers` | Cria 1 voucher (`expiraEm`, `observacao`) |
| POST | `/api/admin/vouchers/lote` | Cria até 1000 vouchers (prefixo/comprimento/observação/expiraEm) |
| PATCH | `/api/admin/vouchers/:id/revogar` | `status` → `REVOGADO` (só se estiver `ATIVO`) |
| DELETE | `/api/admin/vouchers/:id` | Apaga voucher (bloqueado se `USADO`) |
| GET | `/api/admin/usuarios` | Lista usuários `role='USER'` não deletados: `id, nome, login, status, ultimoLogin, criadoEm` |
| PATCH | `/api/admin/usuarios/:id/status` | `ATIVO`/`INATIVO` |
| PATCH | `/api/admin/usuarios/:id/senha` | Define nova senha (bcrypt 12) + `deveTrocarSenha = true` |
| DELETE | `/api/admin/usuarios/:id` | Soft delete: `deletadoEm = now`, `status = 'INATIVO'` |

**Confirmação explícita:** nenhuma rota administrativa lê ou escreve dados
financeiros. As tabelas `Instancia`, `Lancamento`, `Pagamento`, `Investimento`,
`ValorExtra` e `OrdenacaoInstancia` não são referenciadas em nenhum arquivo de
rota admin. O `serializar()` de usuários expõe apenas os 6 campos listados
acima (não expõe `senha` nem `role`). O isolamento é reforçado nos dois
sentidos: as rotas financeiras exigem `exigirRole('USER')`, então um ADMIN
recebe 403 nelas; e o `AppLayout` do frontend redireciona ADMIN para
`/admin/usuarios` ([layout.tsx:23-24](frontend/src/app/(app)/layout.tsx#L23-L24)).

O soft delete preserva todo o histórico financeiro do usuário no banco — os
`Cascade` só disparam em hard delete.

### 2.6 Distinção da conta de administrador

**Flag na própria tabela `Usuario`:** o campo `role`, `TEXT` com default
`'USER'` e CHECK `IN ('USER','ADMIN')`. Não há tabela separada.

- Nunca é definido por rota: nenhum endpoint escreve `role`. O cadastro grava `role: 'USER'` fixo ([auth.js:67](backend/src/routes/auth.js#L67)).
- O único caminho para criar um ADMIN é o **seed** ([seed.js:7-39](backend/prisma/seed.js#L7-L39)), que é idempotente (aborta se já houver qualquer ADMIN), exige `ADMIN_SENHA_INICIAL` com ≥ 8 caracteres via env (sem default hardcoded) e cria a conta com `deveTrocarSenha = true`.
- Aplicação: `exigirRole(role)` compara `req.usuario.role !== role` e devolve 403 ([auth.js:44-51](backend/src/middleware/auth.js#L44-L51)).
- Promover um usuário a ADMIN hoje só é possível por acesso direto ao banco.

---

## Parte 3 — Contas existentes em produção

O ambiente **tem** acesso ao banco de produção: `backend/.env` aponta
`DATABASE_URL` para `aws-1-us-west-2.pooler.supabase.com:6543` e `DIRECT_URL`
para `db.cxsgmotmrkdpesidxqmc.supabase.co:5432`. Os números abaixo vêm de
consultas `SELECT`/`count` executadas contra esse banco em 2026-08-08. Nenhuma
escrita foi feita.

### 3.1 Quantidade de contas

**Total: 2 contas.** Nenhuma com `deletadoEm` preenchido.

| Categoria | Quantidade | Quais |
|---|---|---|
| Sua conta / operação própria | 2 | `admin` (ADMIN) e `mingas` (USER) |
| Contas de teste identificáveis | 0 | — |
| Contas de terceiros reais | 0 | — |

Não há nenhuma conta que não seja sua. (Ver 3.3 e "Divergências" para o
indício de contas que existiram e foram apagadas.)

### 3.2 Detalhe por conta não-teste

| Login | Papel | Criada em | Último acesso | Instâncias | Lançamentos | Pagamentos | Investimentos |
|---|---|---|---|---|---|---|---|
| `admin` | ADMIN | 2026-08-01 01:42 UTC | 2026-08-01 02:08 UTC | 0 | 0 | 0 | 0 |
| `mingas` | USER | 2026-08-01 02:09 UTC | 2026-08-07 18:45 UTC | 14 | 33 | 10 | 0 |

`ultimoLogin` é o único carimbo de acesso registrado (atualizado só no login,
[auth.js:129](backend/src/routes/auth.js#L129)) — não há registro de atividade
por requisição.

### 3.3 Histórico de vouchers consumidos

Existe: `utilizadoEm` está preenchido nos vouchers usados. Os 10 vouchers em
produção foram todos criados pelo seed em 2026-08-01 01:42 UTC, todos com
`expiraEm = NULL` e `criadoPor = NULL`.

| Código | Status | Utilizado em | usuarioId |
|---|---|---|---|
| `DOM-BFYM-TP58-FRTA` | USADO | 2026-08-01 02:09:52 | `3c4967a3…` (mingas) |
| `DOM-AHV5-D68V-523J` | USADO | 2026-08-01 12:50:23 | **NULL** |
| `DOM-T93B-7PKA-TDWK` | USADO | 2026-08-01 13:21:36 | **NULL** |
| `DOM-66A5-VBW5-DMVC` | USADO | 2026-08-01 13:30:41 | **NULL** |
| 6 demais (`DOM-4WEB…`, `DOM-6C43…`, `DOM-PKXK…`, `DOM-5SSP…`, `DOM-J492…`, `DOM-5WYB…`) | ATIVO | — | NULL |

Resumo: 4 consumidos, 6 ativos, 0 revogados. Todos os consumos ocorreram em
2026-08-01. Como todos os vouchers têm `expiraEm = NULL`, não há nenhum dado
histórico de prazo concedido que possa servir de base para a validade a
atribuir na migração — a única âncora temporal disponível é `utilizadoEm` (ou,
para contas, `criadoEm`).

Os três `USADO` com `usuarioId = NULL` estão comentados em "Divergências".

---

## Parte 4 — Rotinas sem sessão de usuário

### 4.1 Existe alguma?

**Nenhuma.** Resposta explícita: não existe nenhum job agendado, cron,
função serverless periódica, webhook, worker, trigger de banco ou rotina de
background que leia ou escreva campos financeiros de usuários.

Evidências:

- **Código do backend:** `backend/server.js` monta apenas 9 routers HTTP e um `app.listen`. Não há `setInterval`, `setTimeout`, fila, worker thread ou child process em nenhum arquivo de `backend/src/` (grep confirmado — as únicas ocorrências de "cron" no repositório são a palavra "cronograma" em comentários de `patrimonio.js` e `investimentos.js`).
- **Dependências:** `backend/package.json` não inclui `node-cron`, `bullmq`, `agenda`, `bee-queue` ou equivalente.
- **Plataforma:** `vercel.json` define apenas dois services e dois rewrites — não há bloco `crons`.
- **Webhooks:** nenhuma rota de webhook (nenhum endpoint de pagamento, nenhum callback externo). Não há integração com serviço de pagamento ainda.
- **Banco:** consulta ao catálogo do Postgres de produção retornou **0 triggers**, **0 funções** em `public`, **0 views**, **0 views materializadas**. A extensão `pg_cron` não está instalada (`cron.job` não existe); extensões presentes: `plpgsql`, `pg_stat_statements`, `uuid-ossp`, `pgcrypto`, `supabase_vault`.
- **Materialização de lançamentos fixos/recorrentes no virar do mês: não acontece.** Lançamento fixo/temporário é um único registro com `mesInicio`/`mesFim`; as parcelas nunca são materializadas como linhas. A projeção é calculada por competência a cada requisição em [projecao.js](backend/src/utils/projecao.js) (`parcelasNaJanela`, `projetarLancamentoNaJanela`).
- **Cálculo/cache de projeções: não existe cache.** `calcularResumo` ([resumoFinanceiro.js](backend/src/utils/resumoFinanceiro.js)) é recomputado do zero a cada `GET /api/dashboard` e `GET /api/relatorio`. Nenhum resultado agregado é persistido.
- **Relatórios agendados: não existem.** O PDF é gerado sob demanda em `GET /api/relatorio/pdf` e devolvido no corpo da resposta — o comentário em [relatorio.js:75-76](backend/src/routes/relatorio.js#L75-L76) confirma: "Nunca gera arquivo nem persiste nada".
- **Recálculo de parcelas:** só ocorre dentro de requisições autenticadas explícitas (`POST /api/investimentos/aporte/:id/recalcular`).
- **Agregações pré-computadas:** nenhuma. Não há tabela de totais, saldo consolidado ou snapshot no servidor.

Os únicos scripts fora de requisição são **manuais, one-shot e não financeiros**:
[backfillOrdenacaoInstancia.js](backend/prisma/backfillOrdenacaoInstancia.js) e
[backfillOrdenacaoColuna.js](backend/prisma/backfillOrdenacaoColuna.js) (escrevem
só em `OrdenacaoInstancia`: `contexto`, `coluna`, `ordem`), e
[seed.js](backend/prisma/seed.js) (usuário admin + vouchers). Nenhum é agendado.

Existe um único temporizador em todo o sistema, e ele roda **no cliente**:
o backoff de retry da outbox em
[syncManager.ts:19](frontend/src/lib/offline/syncManager.ts#L19) — um
`setTimeout` que reenvia operações do próprio usuário logado, com a sessão dele.

### 4.2 Detalhamento por rotina

Não aplicável — nenhuma rotina encontrada. Consequentemente, a pergunta "poderia
funcionar rodando no cliente, na próxima abertura do app" não tem nenhum caso a
avaliar: **todo cálculo financeiro já acontece dentro de uma requisição
autenticada em curso**, em JavaScript no servidor, a partir de linhas lidas na
hora.

### 4.3 Objetos no banco que operam sobre valores

**Nenhuma view materializada, nenhum trigger, nenhuma função Postgres e
nenhuma policy do Supabase.** Consulta a `pg_policies` retornou vazio e
`relrowsecurity = false` em todas as 9 tabelas de `public` (`Usuario`,
`Voucher`, `Instancia`, `Lancamento`, `Pagamento`, `Investimento`,
`ValorExtra`, `OrdenacaoInstancia`, `_prisma_migrations`). O RLS do Supabase
está **desligado** — o isolamento entre usuários é feito inteiramente na
aplicação, por `where: { usuarioId: req.usuario.id }` em cada query.

O que **existe** no banco operando sobre valores são **CHECK constraints**
(estáticas, avaliadas em cada INSERT/UPDATE):

- `Lancamento_valor_check`: `"valor" > 0`
- `Pagamento_valorPago_check`: `"valorPago" > 0`
- `Investimento_valor_check`: `"valor" != 0`
- `Lancamento_parcelas_check`, `Lancamento_meta_check`, `Lancamento_tipo_check`, `Instancia_grupo_check`, `Instancia_subgrupo_check`, `Usuario_role_check`, `Usuario_status_check`, `Voucher_status_check`

As três primeiras são relevantes para o desenho da criptografia: são comparações
numéricas sobre colunas monetárias, e não sobreviveriam à conversão dessas
colunas para texto cifrado.

---

## Parte 5 — Classificação de campos para criptografia

### 5.1 Modelos com dados financeiros de usuário

Não existem modelos de "conta bancária", "cartão", "categoria" ou "reserva"
como entidades próprias. O modelo é: `Instancia` é a gaveta genérica (o cartão,
a conta, a categoria, a reserva — distinguidos por `grupo`/`subgrupo`), e
`Lancamento` é tanto a despesa/receita quanto o aporte de reserva.

**Instancia** ([schema.prisma:49-64](backend/prisma/schema.prisma#L49-L64))

| Campo | Tipo |
|---|---|
| `id` | String (uuid) |
| `usuarioId` | String (FK) |
| `nome` | String |
| `grupo` | String (`gasto`\|`receita`\|`investimento`) |
| `subgrupo` | String? (`pessoal`\|`patrimonial`) |
| `cor` | String |
| `ativa` | Boolean |
| `criadoEm` | DateTime |

**Lancamento** ([schema.prisma:84-121](backend/prisma/schema.prisma#L84-L121))

| Campo | Tipo |
|---|---|
| `id` | String (uuid) |
| `usuarioId` | String (FK) |
| `instanciaId` | String (FK) |
| `descricao` | String |
| `valor` | Float |
| `tipo` | String (`fixo`\|`temporario`) |
| `parcelas` | Int? |
| `mesInicio` | String (`YYYY-MM`) |
| `mesFim` | String? (`YYYY-MM`) |
| `valorMeta` | Float? |
| `valorUltimaParcela` | Float? |
| `valorAbatido` | Float (default 0) |
| `valorRendimento` | Float (default 0) |
| `valorBaseAcumulado` | Float (default 0) |
| `criadoPorPagamentoId` | String? (não é FK) |
| `ativo` | Boolean |
| `observacoes` | String? |
| `criadoEm` | DateTime |

**Pagamento** ([schema.prisma:139-152](backend/prisma/schema.prisma#L139-L152))

| Campo | Tipo |
|---|---|
| `id`, `usuarioId`, `instanciaId` | String |
| `lancamentoId` | String? (FK, SetNull) |
| `mesReferencia` | String (`YYYY-MM`) |
| `valorPago` | Float |
| `tipo` | String (`total`\|`selecionado`\|`parcial`\|`avulso`) |
| `observacoes` | String? |
| `criadoEm` | DateTime |

**Investimento** (resgates/ajustes; valores negativos) ([schema.prisma:154-164](backend/prisma/schema.prisma#L154-L164))

| Campo | Tipo |
|---|---|
| `id`, `usuarioId`, `instanciaId` | String |
| `descricao` | String |
| `valor` | Float |
| `observacoes` | String? |
| `criadoEm` | DateTime |

**ValorExtra** ([schema.prisma:125-136](backend/prisma/schema.prisma#L125-L136))

| Campo | Tipo |
|---|---|
| `id`, `lancamentoId` | String |
| `valor` | Float |
| `descricao` | String? |
| `viaRecalculo` | Boolean |
| `criadoEm` | DateTime |

**OrdenacaoInstancia** (não é financeiro, mas participa das telas)
([schema.prisma:71-81](backend/prisma/schema.prisma#L71-L81)): `id`,
`instanciaId`, `contexto`, `coluna` (Int), `ordem` (Int), `criadoEm`.

### 5.2 Uso de cada campo

Nenhum índice existe sobre qualquer campo financeiro — os únicos índices em
produção são PKs, `Usuario_login_key`, `Voucher_codigo_key` e
`OrdenacaoInstancia_instanciaId_contexto_key`. A coluna "índice" está portanto
vazia em toda a tabela abaixo e foi omitida.

**Instancia**

| Campo | Uso |
|---|---|
| `id` | `WHERE` (todas as rotas), `JOIN` implícito (relações), chave de agrupamento em memória |
| `usuarioId` | `WHERE` em **toda** query financeira (isolamento por usuário) |
| `nome` | Somente leitura/exibição; interpolado em string de descrição no `POST /api/investimentos/migrar` ([investimentos.js:663](backend/src/routes/investimentos.js#L663)) |
| `grupo` | `WHERE` — `grupo: 'gasto'` ([pagamentos.js:58](backend/src/routes/pagamentos.js#L58), [pagamentos.js:105](backend/src/routes/pagamentos.js#L105)), `grupo: 'investimento'` ([investimentos.js:63](backend/src/routes/investimentos.js#L63) e outras); filtro opcional em `GET /api/instancias` |
| `subgrupo` | `WHERE` ([investimentos.js:65](backend/src/routes/investimentos.js#L65), [investimentos.js:643-646](backend/src/routes/investimentos.js#L643-L646)); filtro em memória em `calcularResumo` |
| `cor` | Somente exibição |
| `ativa` | `WHERE` (`ativa: true`) em pagamentos e investimentos; filtro em memória no dashboard |
| `criadoEm` | `ORDER BY` (`asc`) em instâncias e pagamentos |

**Lancamento**

| Campo | Uso |
|---|---|
| `id` | `WHERE`, chave de idempotência (unique) |
| `usuarioId` | `WHERE` em todas as queries |
| `instanciaId` | `WHERE`; `GROUP BY` **em memória** (Map por instância em [relatorio.js:37-41](backend/src/routes/relatorio.js#L37-L41) e [resumoFinanceiro.js:126-130](backend/src/utils/resumoFinanceiro.js#L126-L130)) |
| `descricao` | Exibição; interpolada ao gerar pendência (`Pendência: ${item.descricao}`, [pagamentos.js:320](backend/src/routes/pagamentos.js#L320)); **renderizada no PDF do servidor** ([relatorioPdf.js:524](backend/src/lib/relatorioPdf.js#L524)); sobrescrita pelo nome do projeto em `POST/PUT /projeto`. Nunca em `WHERE`. |
| `valor` | **Agregação intensa, toda em JavaScript** (`reduce`) — ver 5.3. Aritmética **no banco** apenas por `CHECK valor > 0`. Nunca em `WHERE`, `ORDER BY` ou `GROUP BY` de SQL |
| `tipo` | Comparado em memória (`tipo === 'temporario'`) em dezenas de pontos; `CHECK` no banco; nunca em `WHERE` de query |
| `parcelas` | Aritmética em memória; `CHECK` no banco |
| `mesInicio` / `mesFim` | **Comparação de intervalo, sempre em memória** — `compararMeses`, `maiorMes`, `menorMes` em [projecao.js](backend/src/utils/projecao.js) e [mes.js](backend/src/utils/mes.js). Nunca em `WHERE` de SQL |
| `valorMeta` | Comparado em memória (`valorMeta == null`, `>= valorMeta - EPS`); `CHECK Lancamento_meta_check` |
| `valorUltimaParcela` | Aritmética em memória; `CHECK Lancamento_meta_check` |
| `valorAbatido` | **Aritmética no banco**: `{ increment }` / `{ decrement }` — ver 5.3 |
| `valorRendimento` | **Aritmética no banco**: `{ increment }` — ver 5.3 |
| `valorBaseAcumulado` | Escrito com valor calculado na aplicação; somado em memória |
| `criadoPorPagamentoId` | **`WHERE ... IN`** ([pagamentos.js:343](backend/src/routes/pagamentos.js#L343)) |
| `ativo` | **`WHERE ativo: true`** ([dashboard.js:21](backend/src/routes/dashboard.js#L21), [relatorio.js:30](backend/src/routes/relatorio.js#L30)); também checado em memória |
| `observacoes` | Somente exibição; nunca filtrado |
| `criadoEm` | **`ORDER BY criadoEm desc`** ([lancamentos.js:110](backend/src/routes/lancamentos.js#L110), [investimentos.js:28](backend/src/routes/investimentos.js#L28)) |

**Pagamento**

| Campo | Uso |
|---|---|
| `id` | Retorno; referenciado por `criadoPorPagamentoId` |
| `usuarioId`, `instanciaId` | Escrita; `usuarioId` implícito via lançamento |
| `lancamentoId` | **`WHERE`** e **`WHERE ... IN`** ([pagamentos.js:32](backend/src/routes/pagamentos.js#L32), [pagamentos.js:87](backend/src/routes/pagamentos.js#L87), [pagamentos.js:346-347](backend/src/routes/pagamentos.js#L346-L347)); **`COUNT(*)`** em [lancamentos.js:59](backend/src/routes/lancamentos.js#L59) |
| `mesReferencia` | **`WHERE`** (igualdade) em [pagamentos.js:33](backend/src/routes/pagamentos.js#L33), [pagamentos.js:87](backend/src/routes/pagamentos.js#L87), [pagamentos.js:366](backend/src/routes/pagamentos.js#L366), [pagamentos.js:375](backend/src/routes/pagamentos.js#L375) |
| `valorPago` | Somado **em memória** ([pagamentos.js:42](backend/src/routes/pagamentos.js#L42)); `CHECK valorPago > 0` |
| `tipo` | Escrito; `CHECK` |
| `observacoes` | Exibição |
| `criadoEm` | Sem uso em query |

**Investimento**

| Campo | Uso |
|---|---|
| `id` | `WHERE` |
| `usuarioId`, `instanciaId` | `WHERE` |
| `descricao` | Exibição |
| `valor` | Somado **em memória** ([investimentos.js:35](backend/src/routes/investimentos.js#L35), [resumoFinanceiro.js:161](backend/src/utils/resumoFinanceiro.js#L161)); `CHECK valor != 0` |
| `observacoes` | Exibição |
| `criadoEm` | **`ORDER BY desc`** ([investimentos.js:31](backend/src/routes/investimentos.js#L31)) |

**ValorExtra**

| Campo | Uso |
|---|---|
| `id` | `WHERE` |
| `lancamentoId` | `WHERE` (via relação, com filtro de `usuarioId` do lançamento) |
| `valor` | Fonte do `increment`/`decrement` em `Lancamento.valorAbatido` — ver 5.3 |
| `descricao` | Exibição |
| `viaRecalculo` | Comparado em memória |
| `criadoEm` | **`ORDER BY desc`** em vários `include` |

**OrdenacaoInstancia**

| Campo | Uso |
|---|---|
| `instanciaId` + `contexto` | `WHERE`, **UNIQUE** (usado em `upsert`) |
| `coluna` | `WHERE` + **`COUNT`** ([ordenacaoInstancia.js:32-38](backend/src/utils/ordenacaoInstancia.js#L32-L38)) |
| `ordem` | **`MAX()` no banco** (`aggregate _max`) — campo inteiro, não monetário |

### 5.3 Cálculo de `valor` no lado do banco vs. na aplicação

**A esmagadora maioria dos cálculos é feita na aplicação.** Todo `SUM` é um
`reduce` em JavaScript sobre linhas já carregadas: `totalPorGrupo`
([resumoFinanceiro.js:11-15](backend/src/utils/resumoFinanceiro.js#L11-L15)),
`totalJanela` ([lancamentos.js:133-136](backend/src/routes/lancamentos.js#L133-L136)),
`patrimonio` ([investimentos.js:34-36](backend/src/routes/investimentos.js#L34-L36)),
`totalAberto` ([pagamentos.js:73](backend/src/routes/pagamentos.js#L73)),
`subtotal` do PDF ([relatorioPdf.js:514](backend/src/lib/relatorioPdf.js#L514)).
**Não há um único `SUM`, `AVG`, `MIN` ou `MAX` de SQL sobre campo monetário** —
`aggregate` aparece só sobre `OrdenacaoInstancia.ordem` (inteiro de posição).

Os **únicos** pontos em que um campo monetário entra em cálculo dentro do
banco (`UPDATE ... SET col = col ± n`, via `{ increment }`/`{ decrement }` do
Prisma) são estes quatro:

1. [investimentos.js:227](backend/src/routes/investimentos.js#L227) — `POST /api/investimentos/aporte/:id/abater`: `valorAbatido: { increment: parsed.data.valor }`
2. [investimentos.js:327](backend/src/routes/investimentos.js#L327) — `DELETE /api/investimentos/valor-extra/:id`: `valorAbatido: { decrement: extra.valor }`
3. [investimentos.js:578](backend/src/routes/investimentos.js#L578) — `POST /api/investimentos/:id/atualizar-valor`: `valorAbatido: { increment: diferenca }`
4. [investimentos.js:579](backend/src/routes/investimentos.js#L579) — mesma rota: `valorRendimento: { increment: diferenca }`

Além disso, as três **CHECK constraints** sobre valores (`Lancamento.valor > 0`,
`Pagamento.valorPago > 0`, `Investimento.valor != 0`) são avaliadas pelo banco a
cada escrita, o que também é cálculo/comparação numérica no lado do banco.

### 5.4 Busca textual sobre descrição/observação

**Não existe.** Grep no repositório inteiro: nenhuma ocorrência de `ILIKE`,
`contains:`, `search:`, `startsWith:`, `to_tsvector`, `tsquery` ou índice GIN.
Não há campo de pesquisa em nenhuma tela do frontend (o único "filtro" da UI é
o seletor de status na página administrativa de vouchers, que filtra
`Voucher.status`, não texto). Cifrar `descricao`/`observacoes` **não removeria
nenhuma funcionalidade existente hoje** — removeria a possibilidade de
implementá-la depois no lado do servidor.

### 5.5 Tabela de classificação

| Modelo | Campo | Tipo | Usado em | Candidato a cifragem | Motivo |
|---|---|---|---|---|---|
| Instancia | `id` | String | WHERE, JOIN, chave de agrupamento | NÃO | Chave primária e alvo de FK |
| Instancia | `usuarioId` | String | WHERE (todas as queries) | NÃO | FK e base do isolamento por usuário |
| Instancia | `nome` | String | Exibição; interpolado em descrição gerada | AVALIAR | Texto livre e nunca filtrado, mas é copiado para `Lancamento.descricao` em `POST /migrar` e impresso no PDF gerado no servidor — cifrar exige que o servidor tenha a chave ou que essas operações mudem de lugar |
| Instancia | `grupo` | String | WHERE, CHECK | NÃO | Filtro de query e CHECK constraint |
| Instancia | `subgrupo` | String? | WHERE, CHECK | NÃO | Filtro de query e CHECK constraint |
| Instancia | `cor` | String | Exibição | NÃO | Não é dado financeiro nem pessoal; cifrar não traz benefício |
| Instancia | `ativa` | Boolean | WHERE | NÃO | Filtro de query |
| Instancia | `criadoEm` | DateTime | ORDER BY | NÃO | Ordenação no banco |
| Lancamento | `id` | String | WHERE, unique (idempotência) | NÃO | Chave primária |
| Lancamento | `usuarioId` | String | WHERE | NÃO | FK e isolamento |
| Lancamento | `instanciaId` | String | WHERE, GROUP BY em memória | NÃO | FK e filtro |
| Lancamento | `descricao` | String | Exibição; interpolação; PDF do servidor | AVALIAR | Texto livre, nunca em WHERE/ORDER/agregação — melhor candidato do modelo. Conflito: é lida pelo servidor em `GET /api/relatorio/pdf` e em `POST /api/pagamentos/outro-valor` (gera `Pendência: ${descricao}`). Cifrar exige mover a geração do PDF para o cliente e repensar a descrição da pendência |
| Lancamento | `valor` | Float | Agregação (em memória, em ~10 pontos); CHECK `> 0` no banco | NÃO | Campo central de toda soma/projeção; a CHECK constraint numérica quebra |
| Lancamento | `tipo` | String | Comparação em memória; CHECK | NÃO | CHECK constraint e ramificação de regra |
| Lancamento | `parcelas` | Int? | Aritmética; CHECK | NÃO | CHECK constraint |
| Lancamento | `mesInicio` | String | Comparação de intervalo (em memória) | NÃO | Base de toda a competência; a regra de partida preserva datas em claro |
| Lancamento | `mesFim` | String? | Comparação de intervalo (em memória) | NÃO | Idem |
| Lancamento | `valorMeta` | Float? | Comparação; CHECK | NÃO | Numérico, comparado contra acumulado |
| Lancamento | `valorUltimaParcela` | Float? | Aritmética; CHECK | NÃO | Numérico |
| Lancamento | `valorAbatido` | Float | **`increment`/`decrement` no banco** | NÃO | Aritmética executada dentro do UPDATE |
| Lancamento | `valorRendimento` | Float | **`increment` no banco** | NÃO | Idem |
| Lancamento | `valorBaseAcumulado` | Float | Soma em memória | NÃO | Numérico, participa de todo acumulado |
| Lancamento | `criadoPorPagamentoId` | String? | WHERE ... IN | NÃO | Chave de vínculo usada em filtro |
| Lancamento | `ativo` | Boolean | WHERE | NÃO | Filtro de query |
| Lancamento | `observacoes` | String? | Exibição apenas | SIM | Texto livre, nunca em WHERE/ORDER BY/GROUP BY/agregação/JOIN/índice/busca. Não é lido pelo PDF do servidor |
| Lancamento | `criadoEm` | DateTime | ORDER BY | NÃO | Ordenação no banco |
| Pagamento | `id` | String | Referência | NÃO | Chave primária |
| Pagamento | `usuarioId` / `instanciaId` | String | WHERE | NÃO | FK e isolamento |
| Pagamento | `lancamentoId` | String? | WHERE, IN, COUNT | NÃO | FK e filtro |
| Pagamento | `mesReferencia` | String | WHERE (igualdade) | NÃO | Filtro de query em 4 pontos |
| Pagamento | `valorPago` | Float | Soma em memória; CHECK `> 0` | NÃO | CHECK numérica; agregado |
| Pagamento | `tipo` | String | CHECK | NÃO | CHECK constraint |
| Pagamento | `observacoes` | String? | Exibição apenas | SIM | Texto livre sem uso em query |
| Pagamento | `criadoEm` | DateTime | — | NÃO | Data |
| Investimento | `id` | String | WHERE | NÃO | Chave primária |
| Investimento | `usuarioId` / `instanciaId` | String | WHERE | NÃO | FK e isolamento |
| Investimento | `descricao` | String | Exibição apenas | AVALIAR | Texto livre e sem uso em query — mas é preenchida automaticamente pelo servidor em 3 ramos (`'Rendimento'`, `'Ajuste'`, `Migrado de "..."`), o que exigiria cifrar no servidor ou mudar quem gera o texto |
| Investimento | `valor` | Float | Soma em memória; CHECK `!= 0` | NÃO | CHECK numérica; agregado |
| Investimento | `observacoes` | String? | Exibição apenas | SIM | Texto livre sem uso em query |
| Investimento | `criadoEm` | DateTime | ORDER BY | NÃO | Ordenação no banco |
| ValorExtra | `id` | String | WHERE | NÃO | Chave primária |
| ValorExtra | `lancamentoId` | String | WHERE (via relação) | NÃO | FK |
| ValorExtra | `valor` | Float | Origem do `increment`/`decrement` no banco | NÃO | Alimenta aritmética executada no UPDATE |
| ValorExtra | `descricao` | String? | Exibição apenas | SIM | Texto livre sem uso em query |
| ValorExtra | `viaRecalculo` | Boolean | Comparação em memória | NÃO | Flag de regra |
| ValorExtra | `criadoEm` | DateTime | ORDER BY | NÃO | Ordenação no banco |
| OrdenacaoInstancia | `contexto` / `coluna` / `ordem` | String / Int / Int | WHERE, UNIQUE, COUNT, MAX | NÃO | Não é dado financeiro; participa de índice único e agregação |

Resumo da coluna de candidatura: **4 `SIM`** (`Lancamento.observacoes`,
`Pagamento.observacoes`, `Investimento.observacoes`, `ValorExtra.descricao`),
**3 `AVALIAR`** (`Instancia.nome`, `Lancamento.descricao`,
`Investimento.descricao`), todo o resto `NÃO`.

---

## Parte 6 — Superfície de escrita

### 6.1 e 6.2 — Todas as rotas da API

Prefixos montados em [server.js:35-43](backend/server.js#L35-L43). A coluna
"Auth" indica o middleware aplicado; "Muta financeiro" responde a 6.2.

| Método | Caminho | Auth | Muta financeiro | Observação |
|---|---|---|---|---|
| GET | `/api/health` | **nenhuma** | não | Health check |
| POST | `/api/auth/cadastro` | **nenhuma** (+ rate limit) | não | Cria `Usuario` e consome `Voucher` |
| POST | `/api/auth/login` | **nenhuma** (+ rate limit) | não | Escreve `ultimoLogin` |
| POST | `/api/auth/logout` | **nenhuma** | não | Só limpa o cookie |
| GET | `/api/auth/me` | `autenticar` | não | — |
| POST | `/api/auth/trocar-senha` | `autenticar` | não | Escreve `senha`, `deveTrocarSenha` |
| GET | `/api/instancias` | `autenticar` + USER | não | — |
| PATCH | `/api/instancias/ordenacao` | `autenticar` + USER | **SIM** (reordenar) | Upsert em massa em `OrdenacaoInstancia`, em transação |
| POST | `/api/instancias` | `autenticar` + USER | **SIM** (criar conta/cartão/gaveta) | Cria `Instancia` + ordenações iniciais |
| PUT | `/api/instancias/:id` | `autenticar` + USER | **SIM** (editar) | — |
| PATCH | `/api/instancias/:id/ativa` | `autenticar` + USER | **SIM** (arquivar/reativar) | — |
| DELETE | `/api/instancias/:id` | `autenticar` + USER | **SIM** (excluir) | **Cascade apaga lançamentos, pagamentos e investimentos** |
| GET | `/api/lancamentos?instanciaId=` | `autenticar` + USER | não | — |
| POST | `/api/lancamentos` | `autenticar` + USER | **SIM** (criar) | Aceita `id` do cliente; retry idempotente via P2002 |
| PUT | `/api/lancamentos/:id` | `autenticar` + USER | **SIM** (editar parcial) | `descricao`, `valor`, `observacoes` |
| PUT | `/api/lancamentos/:id/completo` | `autenticar` + USER | **SIM** (editar completo) | Recalcula `mesFim`, `valorUltimaParcela` |
| DELETE | `/api/lancamentos/:id` | `autenticar` + USER | **SIM** (excluir) | Hard delete |
| GET | `/api/pagamentos/em-aberto` | `autenticar` + USER | não | — |
| POST | `/api/pagamentos/total` | `autenticar` + USER | **SIM** | Cria N `Pagamento` em transação |
| POST | `/api/pagamentos/selecionados` | `autenticar` + USER | **SIM** | Idem |
| POST | `/api/pagamentos/outro-valor` | `autenticar` + USER | **SIM** | Cria pagamentos **e** pode gerar `Lancamento` (excedente ou pendência) |
| POST | `/api/pagamentos/reverter` | `autenticar` + USER | **SIM** | Apaga pagamentos e a cadeia de lançamentos gerados (recursivo) |
| GET | `/api/investimentos` | `autenticar` + USER | não | — |
| POST | `/api/investimentos/aporte` | `autenticar` + USER | **SIM** | Cria `Lancamento`; idempotente por `id` |
| PUT | `/api/investimentos/aporte/:id` | `autenticar` + USER | **SIM** | — |
| DELETE | `/api/investimentos/aporte/:id` | `autenticar` + USER | **SIM** | Hard delete (cascade em `ValorExtra`) |
| POST | `/api/investimentos/aporte/:id/abater` | `autenticar` + USER | **SIM** | Cria `ValorExtra` + `increment` em `valorAbatido` |
| POST | `/api/investimentos/aporte/:id/recalcular` | `autenticar` + USER | **SIM** | Reescreve cronograma inteiro (`mesInicio`, `mesFim`, `parcelas`, `valor`, `valorUltimaParcela`, `valorAbatido`, `valorBaseAcumulado`) |
| DELETE | `/api/investimentos/valor-extra/:id` | `autenticar` + USER | **SIM** | Apaga `ValorExtra` + `decrement` |
| POST | `/api/investimentos/projeto` | `autenticar` + USER | **SIM** | Cria `Instancia` + `Lancamento` + ordenações, em transação |
| PUT | `/api/investimentos/projeto/:instanciaId` | `autenticar` + USER | **SIM** | Atualiza instância e aporte em transação |
| POST | `/api/investimentos/resgate` | `autenticar` + USER | **SIM** | Cria `Investimento` com valor negativo; idempotente por `id` |
| DELETE | `/api/investimentos/resgate/:id` | `autenticar` + USER | **SIM** | — |
| POST | `/api/investimentos/:id/atualizar-valor` | `autenticar` + USER | **SIM** | Três ramos: `increment` em meta, novo aporte, ou novo resgate |
| POST | `/api/investimentos/migrar` | `autenticar` + USER | **SIM** | Cria transferência e arquiva a origem, em transação |
| GET | `/api/dashboard` | `autenticar` + USER | não | — |
| GET | `/api/relatorio` | `autenticar` + USER | não | — |
| GET | `/api/relatorio/pdf` | `autenticar` + USER | não | Gera PDF em memória; não persiste |
| GET | `/api/admin/vouchers` | `autenticar` + ADMIN | não | — |
| POST | `/api/admin/vouchers` | `autenticar` + ADMIN | não | — |
| POST | `/api/admin/vouchers/lote` | `autenticar` + ADMIN | não | Até 1000 por chamada, sequencial |
| PATCH | `/api/admin/vouchers/:id/revogar` | `autenticar` + ADMIN | não | — |
| DELETE | `/api/admin/vouchers/:id` | `autenticar` + ADMIN | não | — |
| GET | `/api/admin/usuarios` | `autenticar` + ADMIN | não | — |
| PATCH | `/api/admin/usuarios/:id/status` | `autenticar` + ADMIN | não | — |
| PATCH | `/api/admin/usuarios/:id/senha` | `autenticar` + ADMIN | não | — |
| DELETE | `/api/admin/usuarios/:id` | `autenticar` + ADMIN | não | Soft delete; preserva o financeiro |

Total: **47 rotas**, das quais **25 mutam estado financeiro** do usuário.

Não existe rota de importação, de duplicação nem de exportação que persista
dados — o único "importar/exportar" é o PDF, e ele é somente leitura.

### 6.3 Middleware de autorização além da autenticação

Sim: **`exigirRole(role)`** ([auth.js:44-51](backend/src/middleware/auth.js#L44-L51)),
que compara `req.usuario.role` com o papel exigido e devolve 403.

Aplicação — **por router, nunca globalmente**, sempre como
`router.use(autenticar, exigirRole(...))` na primeira linha do arquivo:

| Router | Linha | Papel exigido |
|---|---|---|
| `instancias` | [instancias.js:15](backend/src/routes/instancias.js#L15) | USER |
| `lancamentos` | [lancamentos.js:12](backend/src/routes/lancamentos.js#L12) | USER |
| `pagamentos` | [pagamentos.js:10](backend/src/routes/pagamentos.js#L10) | USER |
| `investimentos` | [investimentos.js:20](backend/src/routes/investimentos.js#L20) | USER |
| `dashboard` | [dashboard.js:10](backend/src/routes/dashboard.js#L10) | USER |
| `relatorio` | [relatorio.js:11](backend/src/routes/relatorio.js#L11) | USER |
| `vouchers` | [vouchers.js:9](backend/src/routes/vouchers.js#L9) | ADMIN |
| `usuariosAdmin` | [usuariosAdmin.js:9](backend/src/routes/usuariosAdmin.js#L9) | ADMIN |

Em `auth` o middleware é aplicado **por handler** (`/me` e `/trocar-senha`),
não no router.

A autorização por **propriedade do recurso** (o registro pertence ao usuário
logado?) não é um middleware: é feita manualmente, rota a rota, com
`where: { id, usuarioId: req.usuario.id }` antes de qualquer escrita. Auditei
os 25 handlers mutantes: **todos** fazem essa verificação. Dois casos merecem
registro pelo formato diferente, ambos corretos:
`DELETE /api/investimentos/valor-extra/:id` filtra pela relação
(`lancamento: { usuarioId: req.usuario.id }`,
[investimentos.js:314](backend/src/routes/investimentos.js#L314)) e
`PATCH /api/instancias/ordenacao` valida a posse em bloco comparando a
contagem de ids encontrados com a de ids enviados
([instancias.js:76-82](backend/src/routes/instancias.js#L76-L82)).

Não há middleware de CSRF. O cookie é `sameSite: 'lax'`, e as escritas usam
`Content-Type: application/json` — o que mitiga, mas não é uma verificação
explícita.

### 6.4 Rotas mutantes sem autenticação

Três, todas em `/api/auth`, e todas intencionais:

- **`POST /api/auth/cadastro`** — cria `Usuario` e consome `Voucher`. É a superfície não autenticada mais sensível: escreve em duas tabelas. Protegida por rate limit (10/h por IP), pela exigência de um código de voucher válido e pelo consumo atômico.
- **`POST /api/auth/login`** — escreve `ultimoLogin` **antes de emitir o token, mas só depois de validar a senha** ([auth.js:129](backend/src/routes/auth.js#L129)). Rate limit de 5/15min.
- **`POST /api/auth/logout`** — apenas `res.clearCookie`; não toca no banco.

**Nenhuma rota que altere estado financeiro está sem autenticação.** A rota
não autenticada restante é `GET /api/health`, que é somente leitura e não
consulta o banco.

Observação de configuração: o CORS é fixado em `FRONTEND_URL` com
`credentials: true` ([server.js:25-30](backend/server.js#L25-L30)); em produção
na Vercel o rewrite deixa tudo same-origin, então essa verificação não chega a
ser exercida.

---

## Parte 7 — PWA e service worker

### 7.1 Tratamento de `/api/*` pelo service worker

**Bypass total.** Arquivo: [sw.js](frontend/public/sw.js), `CACHE_VERSION = "v4"`.

```js
function isApiRequest(url) {
  return url.pathname.startsWith("/api/");
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Bypass total: dados de API nunca passam pelo SW, nem para leitura de cache.
  if (isApiRequest(url)) return;
  ...
```

([sw.js:81-103](frontend/public/sw.js#L81-L103)). Sem `event.respondWith`, a
requisição segue direto para a rede. O SW só intercepta: navegações HTML
(network-first → cache do shell → `/offline`) e assets estáticos
(`/_next/static/`, `/icons/`, `manifest.json`, `apple-touch-icon.png`,
`favicon.ico`, cache-first). Requisições não-GET nunca são interceptadas.

Há uma regra defensiva relevante: nada é gravado no cache sem
`response.ok && !response.redirected`
([sw.js:51-55](frontend/public/sw.js#L51-L55)), para não guardar o redirect
para `/login` sob a chave de uma rota protegida.

O `matcher` do middleware Next também exclui `/api` e `sw.js` da guarda de
sessão ([proxy.ts:26-30](frontend/src/proxy.ts#L26-L30)).

### 7.2 Push notification

**Não existe nenhum suporte.** Grep no repositório: nenhuma ocorrência de
`PushManager`, `pushManager.subscribe`, `showNotification`,
`Notification.requestPermission`, `VAPID` ou `web-push`. Nenhum listener de
`push` ou `notificationclick` no service worker (ele registra apenas `install`,
`activate`, `fetch` e `message`). Nenhuma dependência de push no
`package.json` do frontend ou do backend. Nenhum endpoint de envio, nenhuma
tabela de subscriptions.

### 7.3 Armazenamento local no navegador

**`localStorage` e `sessionStorage`: zero ocorrências** em todo o frontend.

**IndexedDB: sim**, via Dexie — base `dominium-offline`, versão 3, definida em
[db.ts](frontend/src/lib/offline/db.ts). Quatro tabelas:

| Tabela | Conteúdo | Contém valor financeiro? |
|---|---|---|
| `outbox` | Operações digitadas e ainda não confirmadas pelo servidor: `criar-lancamento`, `criar-aporte`, `criar-resgate`. Payload inclui `descricao`, **`valor`**, `parcelas`, `mesInicio`, `observacoes`, além de `opId`, `clienteId` (uuid reusado como id definitivo, para idempotência), `status`, `tentativas`, `ultimoErro` | **Sim** |
| `instanciasCache` | Espelho de `Instancia`: `id`, `usuarioId`, `nome`, `grupo`, `subgrupo`, `cor`, `ativa` | Não (só metadados de agrupamento) |
| `sessaoLocal` | Snapshot do último `/api/auth/me` bem-sucedido: `{ id, nome, login, role, deveTrocarSenha }` + `atualizadoEm`. **Sem senha e sem token.** Validade de 7 dias, espelhando o `maxAge` do cookie ([sessaoLocal.ts:10](frontend/src/lib/offline/sessaoLocal.ts#L10)) | Não |
| `snapshots` | Última resposta bem-sucedida das telas de leitura, gravada **como veio do backend** | **Sim** |

As chaves de `snapshots` em uso (`${tela}:${usuarioId}`):
`dashboard` ([dashboard/page.tsx:64](frontend/src/app/(app)/dashboard/page.tsx#L64)) —
guarda o objeto inteiro de `GET /api/dashboard` (receita, despesa, saldo,
patrimônio, séries mensais);
`pagamentos` ([pagamentos/page.tsx:58](frontend/src/app/(app)/pagamentos/page.tsx#L58));
`lancamentos:${instanciaId}` ([lancamentos/page.tsx:177](frontend/src/app/(app)/lancamentos/page.tsx#L177));
e `${SNAPSHOT}:${subgrupo}` de reservas
([investimentos/page.tsx:117](frontend/src/app/(app)/investimentos/page.tsx#L117)).

Tudo é gravado **em texto puro** no IndexedDB — não há cifragem no cliente.

Limpeza: `limparDadosLocaisDoUsuario(usuarioId)`
([outbox.ts:79-88](frontend/src/lib/offline/outbox.ts#L79-L88)) apaga outbox,
`instanciasCache`, `sessaoLocal` e `snapshots` numa transação, e é chamada no
logout; o logout também apaga **todos** os Cache Storage
([AuthContext.tsx:139-147](frontend/src/contexts/AuthContext.tsx#L139-L147)).
Se o usuário fechar o app sem deslogar, os dados permanecem.

**Cache Storage** (`dominium-shell-v4`): só HTML de navegação e assets
estáticos. As rotas autenticadas `/dashboard`, `/lancamentos`, `/pagamentos`,
`/investimentos` são "esquentadas" após o login em
[shellCache.ts](frontend/src/lib/offline/shellCache.ts) — mas são páginas
client-side sem dado server-side embutido (todo dado vem depois via `/api/*`),
então o HTML cacheado não carrega valores.

---

## Divergências e ambiguidades

1. **Três vouchers `USADO` com `usuarioId = NULL`** (`DOM-AHV5-D68V-523J`, `DOM-T93B-7PKA-TDWK`, `DOM-66A5-VBW5-DMVC`, consumidos em 2026-08-01 entre 12:50 e 13:30). O consumo sempre grava `usuarioId` na mesma transação, e a rota admin de exclusão faz **soft** delete (não apaga a linha, portanto não dispara o `SET NULL`). A leitura mais direta é que três contas foram apagadas em **hard delete** direto no banco (ou via Prisma Studio) depois de criadas. Não consigo confirmar quem eram nem se eram suas ou de terceiros — o registro se perdeu junto com a linha. Isso afeta a resposta de 3.1: hoje só há 2 contas, mas o histórico sugere que 3 outras existiram.

2. **`.env.example` e `.env` divergem sobre o alvo do banco.** O `.env.example` do backend descreve SQLite local (`file:./dev.db`) como padrão de protótipo, e existe um `backend/prisma/dev.db` no working tree, mas o `backend/.env` real aponta para o Postgres de produção no Supabase, com `NODE_ENV=development`. Não consegui determinar se isso é intencional (desenvolver contra produção) ou resíduo. Consequência prática: rodar `npm run dev`, `prisma migrate dev` ou `db:seed` nesta máquina atinge o banco de produção.

3. **Política declarada vs. implementação, sobre dado financeiro em cache.** O cabeçalho do service worker afirma como "regra inegociável" que "dado financeiro (saldo, lançamento, pagamento) é sempre buscado direto na rede ou não é mostrado — nunca uma resposta de cache" ([sw.js:3-5](frontend/public/sw.js#L3-L5)), e é verdade para o SW. Mas a camada de snapshots do IndexedDB guarda exatamente essas respostas e as exibe offline. Os comentários de `db.ts` reconhecem isso ("nunca fonte de verdade financeira, só o último dado confirmado com timestamp"), mas as duas afirmações não são conciliáveis como uma política única. Não classifiquei isso como bug — registro como ambiguidade de política, relevante porque o desenho de criptografia precisa saber se o cliente pode ou não persistir valores em claro.

4. **`Voucher.status = 'EXPIRADO'` é código morto no banco.** O valor consta na CHECK constraint e no comentário do schema, mas nenhum ponto do código o escreve; a expiração é sempre derivada em tempo de leitura. Não sei se a intenção original era uma rotina de varredura que nunca foi escrita, ou se o valor está no enum apenas por completude.

5. **Semântica de `expiraEm` após o consumo.** Interpretei `expiraEm` como validade do cupom (prazo para resgate), porque é assim que ele é usado (só no `WHERE` do UPDATE de consumo) e porque nada o lê depois. Mas o campo tem nome genérico o bastante para ter sido pensado como "expiração do acesso concedido". Como todos os 10 vouchers em produção têm `expiraEm = NULL`, não há dado que desempate. Registro em vez de escolher: se a intenção original era vigência de acesso, ela nunca foi implementada.

6. **`Usuario.atualizadoEm` é mantido pelo Prisma (`@updatedAt`), não pelo banco.** Não há trigger nem `DEFAULT` que o preencha. Qualquer UPDATE feito fora do Prisma Client — inclusive o `$executeRaw` de consumo de voucher, se algum dia tocar `Usuario` — deixaria o campo desatualizado.

7. **`Lancamento` acumula dois papéis distintos** — despesa/receita comum e aporte de reserva com meta (com `valorMeta`, `valorAbatido`, `valorRendimento`, `valorBaseAcumulado`, `ValorExtra`). Isso não é uma incoerência do código, mas cria uma ambiguidade para a Parte 5: a mesma coluna `descricao` é digitada pelo usuário num caso e sobrescrita pelo servidor com o nome do projeto no outro (`POST/PUT /api/investimentos/projeto`). Uma decisão de cifrar `descricao` não se aplica uniformemente aos dois papéis.

8. **`criadoPorPagamentoId` é uma chave de vínculo sem FK.** É usada em `WHERE ... IN` na reversão recursiva de pagamentos ([pagamentos.js:343](backend/src/routes/pagamentos.js#L343)), mas não tem constraint nem índice. Não determinei se a ausência de FK foi deliberada (o comentário no schema diz "não FK, só bookkeeping") ou se há um caso em que o pagamento apontado já não existe.

9. **O `deletadoEm` cria um segundo eixo de estado além de `status`.** Toda query de usuário filtra por `deletadoEm: null`, e o soft delete grava os dois campos juntos. Isso significa que o par (`status`, `deletadoEm`) já expressa três estados distintos hoje (ativo / suspenso / excluído) com dois campos de naturezas diferentes. Registro porque, ao introduzir estado de licença, é preciso decidir se ele entra como terceiro eixo ou se consolida os existentes — e essa é uma decisão sua, não minha.

10. **Não consegui determinar quantas sessões estão ativas neste momento**, nem em quais dispositivos: não há registro de sessão, e o JWT não é rastreado. Se a migração precisar invalidar sessões existentes, o único meio hoje é trocar `JWT_SECRET` (derruba todos, sem seletividade).

---

*Fim do relatório. Nenhum arquivo existente foi modificado; nenhuma migração foi criada; nenhuma escrita foi feita no banco.*

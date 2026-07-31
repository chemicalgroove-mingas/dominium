# DOMINIUM — Prompt de Construção do Sistema

> Documento de especificação para o agente que vai codar o projeto. Ler por completo antes de iniciar qualquer implementação. Este arquivo é a fonte da verdade do escopo — se algo não estiver aqui, perguntar antes de assumir.

## 1. O que é o DOMINIUM

Sistema pessoal de controle financeiro/patrimonial. Tagline: **"Controle • Planeje • Conquiste"**.

Não é um SaaS de cobrança nem gera entregáveis (relatórios em PDF, exportações, etc. não são o foco). É uma ferramenta de uso próprio: o usuário insere informações (lançamentos, instâncias que ele mesmo define) e o sistema mantém o controle visual disso — dashboard e recortes analíticos. Cada usuário tem sua conta pessoal, totalmente isolada e invisível para qualquer outro usuário (multi-tenant por `usuario_id` em toda a base, sem exceções).

Princípio central: **o usuário monta o sistema do jeito dele**. Não existe um plano de contas fixo pré-definido pelo sistema. O usuário cria, edita e exclui suas próprias **instâncias** (ex.: "Cartão Nubank", "Aluguel", "Reserva de emergência", "Viagem 2027", "Investimentos CDB", "Salário", "Freelas") — cada instância é um contêiner de lançamentos com suas próprias propriedades (nome, cor, ícone, tipo, meta opcional). O dashboard e os recortes são compostos dinamicamente a partir das instâncias que o usuário criou, não de categorias fixas do sistema.

## 2. Identidade visual

Baseada na logo de referência em `/home/mingas/projeto_DOMINIUM/logotipo/96eb06a2-4d42-4798-a8f7-8fe01342b616.png`: círculo azul-marinho profundo, "D" dourado estilizado com barras de gráfico ascendentes embutidas (referência visual a crescimento/patrimônio), tipografia serifada elegante em branco/creme, tagline em dourado. Tom: sobriedade, autoridade financeira, luxo discreto — nada de gamificação colorida ou visual "fintech genérico".

Paleta extraída da logo (usar como base, ajustar tons de acordo com necessidade de contraste/acessibilidade AA):

```css
--dominium-navy-950: #0B131F;   /* fundo base dark mode */
--dominium-navy-900: #0E1A2B;   /* fundo padrão */
--dominium-navy-800: #16283F;   /* cards, superfícies elevadas */
--dominium-navy-700: #1F3552;   /* bordas, hover de superfície */
--dominium-gold-500: #C9A24B;   /* cor de destaque primária (ações, links, ícones) */
--dominium-gold-300: #E3C77A;   /* hover/gradiente do gold, texto de destaque secundário */
--dominium-cream-100: #F7F5F0;  /* texto principal sobre fundo escuro */
--dominium-white: #FFFFFF;
--dominium-success: #4CAF7D;    /* variações de verde compatíveis com o tom (entradas/positivo) */
--dominium-danger: #D9614F;     /* saídas/negativo, sem ser um vermelho berrante */
```

- Registrar essas cores via `@theme` do Tailwind v4 (não usar `tailwind.config.js` legado nem hex literal espalhado pelo JSX — aprender com o erro do SISBANDA, onde as CSS vars existiam mas não estavam conectadas ao Tailwind e o código tinha hex duplicado inline).
- Suportar dark mode como padrão (a identidade da marca é escura). Light mode é opcional/fase 2 — se implementado, inverter para navy-950 como texto sobre fundo cream, mantendo o dourado como constante de marca nos dois modos.
- Tipografia: uma serifada para títulos/logo (ex. Playfair Display ou Fraunces) + uma sans neutra e legível para UI/dados (ex. Inter ou Geist). Números (valores monetários) sempre em fonte tabular (`font-variant-numeric: tabular-nums`).
- Usar a logo já fornecida como favicon/app icon (gerar variações quadradas/maskable para PWA a partir do PNG de referência).

## 3. Conceito funcional

### 3.1 Instâncias (o núcleo do sistema)
- CRUD completo: o usuário cria, edita, exclui e reordena suas instâncias.
- Campos de uma instância: nome, tipo (ex.: conta, cartão, categoria de gasto, categoria de receita, meta/objetivo — o próprio usuário escolhe o tipo dentre um enum simples, mas a nomenclatura e organização são livres), cor (color picker dentro da paleta ou livre), ícone (biblioteca de ícones, ex. lucide-react), saldo/valor atual (calculado ou informado, dependendo do tipo), meta opcional (valor-alvo + prazo, para objetivos), ativa/arquivada.
- Exclusão de instância com lançamentos vinculados: exigir confirmação explícita e decisão sobre os lançamentos (excluir em cascata ou mover para "sem instância") — nunca apagar silenciosamente dados históricos.
- Instâncias podem ser agrupadas livremente (ex. pastas/grupos definidos pelo usuário), mas isso pode ficar para uma fase 2 se aumentar muito o escopo inicial.

### 3.2 Lançamentos (a operação mais frequente — é o coração do mobile)
- Registro rápido de gasto/receita vinculado a uma instância: valor, data, descrição, tipo (entrada/saída/transferência entre instâncias), tags opcionais, recorrência opcional (mensal fixo, ex. aluguel).
- Fluxo mobile tem que ser o mais curto possível: abrir app → botão flutuante "+" sempre visível → escolher instância (chips com cor/ícone, não dropdown escondido) → valor (teclado numérico nativo) → salvar. Meta: registrar um gasto em menos de 10 segundos, sem rolagem, sem múltiplas telas.
- Edição e exclusão de lançamentos com o mesmo nível de facilidade.
- Suporte a duplicar um lançamento anterior (para gastos recorrentes não fixos, ex. "mesma padaria de sempre").

### 3.3 Dashboard
- Visão consolidada: saldo total, entradas x saídas do período, evolução patrimonial (gráfico de linha/área ao longo do tempo), distribuição por instância (gráfico de rosca/barras).
- Totalmente componível a partir das instâncias do usuário — sem métricas fixas que não fazem sentido para quem não usa aquele tipo de instância.
- Widgets/cards reordenáveis ou pelo menos configuráveis (mostrar/ocultar) é desejável, não obrigatório na v1.

### 3.4 Recortes
- Filtros salvos/reutilizáveis sobre os lançamentos: por período (mês, trimestre, custom), por instância(s), por tipo, por tags.
- Um "recorte" é nomeado e salvo pelo usuário (ex. "Gastos fixos do mês", "Investimentos do ano") e vira um atalho no menu — evita reconfigurar filtros toda vez.
- Cada recorte abre uma visão com total, lista de lançamentos filtrados e um mini-gráfico.

### 3.5 Fora de escopo da v1 (explicitar para não expandir escopo à toa)
- Sem geração de PDF/relatório para terceiros, sem exportação contábil, sem integração bancária automática (open finance) — tudo é entrada manual do usuário.
- Sem colaboração multi-usuário em uma mesma conta (cada conta é estritamente pessoal).

## 4. Stack técnica

- **Frontend + Backend**: Next.js (App Router), TypeScript, deploy único no **Vercel** (API via Route Handlers/Server Actions — não separar em dois projetos como o SISBANDA fez com Render, já que aqui tudo é Vercel). Isso evita CORS e simplifica auth via cookies httpOnly em vez de localStorage.
- **Estilo**: Tailwind CSS v4 (config via `@theme` em CSS, sem `tailwind.config.js`), componentes com `shadcn/ui` como base (acelera e mantém acessibilidade).
- **Banco de dados**: PostgreSQL no **Supabase**. Acesso via **Prisma** (como no SISBANDA), usando o connection pooler do Supabase (`pgbouncer=true`, porta 6543) para `DATABASE_URL` de runtime e a porta direta (5432) para `DIRECT_URL` usada só em migrations — necessário porque Vercel é serverless e não pode manter muitas conexões diretas abertas.
- **Gráficos**: Recharts ou Tremor (ambos leves e com boa base para dashboards financeiros).
- **Ícones**: lucide-react.
- **Email transacional**: **Brevo** (`@getbrevo/brevo`), replicando o padrão do SISBANDA (`emailService.js`), mas limpo — usar só `BREVO_API_KEY` + `MAIL_FROM_NAME`/`MAIL_FROM_ADDRESS`/`MAIL_REPLY_TO`, sem resquícios de outro provedor.
- **PWA**: manifest + service worker básico (installable, ícone da marca) para dar cara de app no celular sem precisar publicar em loja.

## 5. Autenticação

Adaptar o padrão do SISBANDA (`/home/mingas/projeto_SISBANDA/backend/src/routes/usuarios.js` e `middleware/auth.js`), com as seguintes diferenças importantes:

| Aspecto | SISBANDA | DOMINIUM |
|---|---|---|
| Identificador de login | Matrícula (`000.000-0`) | **CPF** (`000.000.000-00`) |
| Criação de conta | Só admin cria, sem self-signup | **Self-signup público** (é um app pessoal, cada um cria a própria conta) |
| Verificação de CPF | N/A | Validar dígitos verificadores do CPF de verdade (algoritmo módulo 11), não só máscara |
| Sessão | JWT em localStorage/sessionStorage | JWT em **cookie httpOnly + secure + sameSite=lax** (mais seguro, e simplifica por estar tudo no mesmo domínio Vercel) |
| Verificação de email | Não existe | Recomendado ter (conta pessoal com dados financeiros sensíveis) — enviar email de confirmação no cadastro via Brevo antes de liberar login |

Fluxos a implementar:
1. **Cadastro**: nome, CPF (validado), email, senha (+ confirmação). Hash com `bcryptjs`, custo 12 (mesmo padrão do SISBANDA). Enviar email de boas-vindas/confirmação via Brevo.
2. **Login**: CPF + senha. Mensagens de erro genéricas (não revelar se o CPF existe ou não, mesma prática anti-enumeração do SISBANDA).
3. **Recuperação de senha**: token aleatório (`uuid`) armazenado no próprio registro do usuário com expiração de 1h (padrão do SISBANDA — mais simples de revogar que JWT de reset), email via Brevo com link para `${APP_URL}/redefinir-senha?token=...`.
4. **Middleware de autenticação**: todas as rotas de API (exceto login/cadastro/reset) exigem sessão válida; toda query no banco deve ser escopada por `usuario_id` extraído do token — nunca confiar em `usuario_id` vindo do client.
5. Sem RBAC/perfis (não precisa do sistema de permissões do SISBANDA — aqui só existe um tipo de usuário, dono da própria conta).

## 6. Esboço do modelo de dados (Prisma)

```prisma
model Usuario {
  id                  String    @id @default(uuid())
  nome                String
  cpf                 String    @unique
  email               String    @unique
  emailVerificado     Boolean   @default(false)
  senha               String
  resetToken          String?
  resetTokenExpiracao DateTime?
  criadoEm            DateTime  @default(now())
  atualizadoEm        DateTime  @updatedAt

  instancias          Instancia[]
  lancamentos         Lancamento[]
  recortes            Recorte[]
}

model Instancia {
  id          String    @id @default(uuid())
  usuarioId   String
  usuario     Usuario   @relation(fields: [usuarioId], references: [id])
  nome        String
  tipo        String    // conta | cartao | categoria_gasto | categoria_receita | objetivo
  cor         String
  icone       String
  metaValor   Decimal?
  metaPrazo   DateTime?
  arquivada   Boolean   @default(false)
  ordem       Int       @default(0)
  criadoEm    DateTime  @default(now())

  lancamentos Lancamento[]
}

model Lancamento {
  id           String    @id @default(uuid())
  usuarioId    String
  usuario      Usuario   @relation(fields: [usuarioId], references: [id])
  instanciaId  String
  instancia    Instancia @relation(fields: [instanciaId], references: [id])
  tipo         String    // entrada | saida | transferencia
  valor        Decimal
  descricao    String?
  data         DateTime
  tags         String[]
  recorrente   Boolean   @default(false)
  criadoEm     DateTime  @default(now())
}

model Recorte {
  id         String   @id @default(uuid())
  usuarioId  String
  usuario    Usuario  @relation(fields: [usuarioId], references: [id])
  nome       String
  filtros    Json     // { periodo, instanciaIds, tipos, tags }
  criadoEm   DateTime @default(now())
}
```
(Ajustar/expandir conforme necessidade real durante a implementação — isto é um ponto de partida, não contrato fechado.)

## 7. Estrutura de pastas sugerida

```
projeto_DOMINIUM/
├── logotipo/                     # já existe — assets de marca
├── prisma/
│   └── schema.prisma
├── src/
│   ├── app/
│   │   ├── (auth)/
│   │   │   ├── login/
│   │   │   ├── cadastro/
│   │   │   ├── recuperar-senha/
│   │   │   └── redefinir-senha/
│   │   ├── (app)/                # route group autenticado
│   │   │   ├── dashboard/
│   │   │   ├── instancias/
│   │   │   ├── lancamentos/
│   │   │   └── recortes/
│   │   └── api/
│   │       ├── auth/
│   │       ├── instancias/
│   │       ├── lancamentos/
│   │       └── recortes/
│   ├── components/
│   │   ├── ui/                   # shadcn primitives
│   │   └── dominium/              # componentes de domínio (InstanciaCard, LancamentoQuickAdd, etc.)
│   ├── lib/
│   │   ├── prisma.ts
│   │   ├── auth.ts                # geração/validação de JWT, hashing
│   │   ├── cpf.ts                 # validação/máscara de CPF
│   │   └── email.ts                # Brevo
│   └── styles/globals.css         # @theme com paleta DOMINIUM
├── public/
│   └── icons/                     # ícones PWA gerados a partir da logo
├── .env.example
└── package.json
```

## 8. Requisitos mobile (prioridade máxima)

- Mobile-first de verdade: desenhar o fluxo de "adicionar lançamento" primeiro para tela pequena, depois adaptar para desktop — não o inverso.
- Botão de ação flutuante persistente para novo lançamento em qualquer tela do app autenticado.
- Inputs numéricos com `inputmode="decimal"`, seleção de instância por chips horizontais roláveis com cor/ícone (reconhecimento visual rápido, sem precisar ler o nome).
- Áreas de toque com no mínimo 44x44px, sem depender de hover para nenhuma ação essencial.
- Testar em viewport de celular real (Chrome DevTools +, se possível, dispositivo físico) antes de considerar uma tela pronta.
- PWA instalável (manifest.json + ícone da logo) para o usuário adicionar à tela inicial e abrir como app.

## 9. Variáveis de ambiente (`.env.example`)

```
DATABASE_URL=              # Supabase pooler (porta 6543, pgbouncer=true)
DIRECT_URL=                # Supabase direto (porta 5432, só para migrations)
JWT_SECRET=
JWT_EXPIRES_IN=7d
APP_URL=                   # URL pública do app no Vercel
BREVO_API_KEY=
MAIL_FROM_NAME=DOMINIUM
MAIL_FROM_ADDRESS=
MAIL_REPLY_TO=
```

## 10. Fases de implementação sugeridas

1. **Fundação**: setup Next.js + Tailwind v4 com paleta DOMINIUM registrada, Prisma + Supabase conectados, deploy inicial vazio no Vercel funcionando.
2. **Autenticação completa**: cadastro (com validação de CPF), login, verificação de email via Brevo, recuperação de senha, middleware protegendo rotas.
3. **Instâncias**: CRUD completo com UI de criação/edição (cor, ícone, tipo, meta).
4. **Lançamentos**: quick-add mobile, listagem, edição, exclusão, vínculo com instância.
5. **Dashboard**: agregações e gráficos a partir de instâncias + lançamentos reais.
6. **Recortes**: filtros salvos e reutilizáveis.
7. **Polish PWA + mobile**: manifest, ícones, testes de fluxo em viewport mobile, revisão de acessibilidade de contraste (paleta escura + dourado precisa ser validada em AA).

---

**Antes de começar a codar**: confirmar com o usuário se este escopo e esta paleta batem com o que foi discutido anteriormente (o usuário mencionou "conceito de cores" definido em conversa anterior não presente neste contexto — validar se a paleta extraída da logo é suficiente ou se há ajustes específicos já combinados).

# DOMINIUM

Sistema pessoal de controle financeiro e patrimonial. **Controle • Planeje • Conquiste**

Cada usuário monta o sistema do seu jeito: cria, edita e exclui suas próprias **instâncias**
(agrupadores de gasto, receita ou investimento, com nome e cor livres). Dentro delas registra
**lançamentos** — fixos (recorrentes indefinidamente) ou temporários (parcelados, com nº de
parcelas e mês de início/fim calculado automaticamente) — e quita débitos na aba **Pagamentos**
(total, seleção de itens, ou valor customizado com geração automática de pendência/excedente).
A aba **Reserva e Investimentos** trata contas de investimento como fluxos de aporte/resgate.
O **Dashboard** projeta tudo isso numa janela temporal (mês/3/6/12 meses) escolhida pelo usuário.
Não há entregáveis — é uma ferramenta de controle pessoal, com conta 100% isolada por usuário.

Ver [PROMPT_DOMINIUM.md](./PROMPT_DOMINIUM.md) para a especificação original do produto e
[ADEQUACOES_MODELO_V2.md](./ADEQUACOES_MODELO_V2.md) para o modelo de dados e regras de negócio
efetivamente implementados (fixo/temporário, pagamentos, projeção por janela temporal).

## Stack

- **Frontend**: Next.js 16 (App Router) + TypeScript + Tailwind CSS v4, porta `5000`
- **Backend**: Express + Prisma, porta `5001`
- **Banco de dados**: SQLite localmente (protótipo) → PostgreSQL no Supabase em produção
- **Autenticação**: login + senha, JWT em cookie httpOnly, bcrypt (custo 12). Sem e-mail —
  contas só são criadas por voucher de uso único, gerado pelo administrador. Sem recuperação
  de senha self-service: esqueceu a senha, fala com o admin.
- **Papéis**: `USER` (dono de seus próprios dados financeiros) e `ADMIN` (gerencia usuários e
  vouchers em `/admin`, isolado — nunca vê dados financeiros de ninguém).
- **Deploy alvo**: Vercel (frontend e backend, ver `vercel.json`)

## Rodando localmente

### Opção 1 — atalho (Linux com ambiente gráfico)

Duplo clique no ícone **DOMINIUM** na Área de Trabalho, ou:

```bash
bash abrir_dominium.sh
```

Isso sobe o backend e o frontend em janelas de terminal separadas e abre
`http://localhost:5000` no navegador.

### Opção 2 — manual

```bash
# Terminal 1 — backend (porta 5001)
cd backend
cp .env.example .env   # já vem pronto para SQLite local
npm install
npx prisma migrate dev
npm run dev

# Terminal 2 — frontend (porta 5000)
cd frontend
cp .env.example .env.local
npm install
npm run dev
```

Acesse `http://localhost:5000`.

## Estrutura

```
projeto_DOMINIUM/
├── backend/          # Express + Prisma (API REST)
├── frontend/          # Next.js (App Router)
├── logotipo/           # Identidade visual de referência
├── abrir_dominium.sh    # Launcher local (dev)
└── PROMPT_DOMINIUM.md    # Especificação do produto
```

## Migrando para Supabase + deploy no Vercel

1. Criar um projeto no Supabase e pegar a connection string do *connection pooler*
   (porta 6543) e a direta (porta 5432).
2. Em `backend/prisma/schema.prisma`, trocar `provider = "sqlite"` por `provider = "postgresql"`
   e adicionar `directUrl = env("DIRECT_URL")` no bloco `datasource`.
3. Apagar `backend/prisma/migrations/` (migrations do SQLite não se aplicam ao Postgres) e rodar
   `npx prisma migrate dev --name init` apontando para o Supabase.
4. No Vercel, criar dois projetos (ou um projeto com dois deploys) apontando para `backend/` e
   `frontend/`, configurando as variáveis de ambiente de produção (`DATABASE_URL`, `DIRECT_URL`,
   `JWT_SECRET`, `FRONTEND_URL`, `BREVO_API_KEY`, etc. — ver `.env.example` em cada pasta).
5. Atualizar `NEXT_PUBLIC_API_URL` no frontend para a URL pública do backend em produção.

# DOMINIUM — Adequações para o modelo funcional validado (v2)

> Comparação entre o que existe hoje no protótipo e o que este modelo exige. Serve de guia para a reescrita — quase tudo do domínio financeiro muda; autenticação e casca do app (layout, tema, PWA) permanecem.

## 1. O que se mantém

- Autenticação por CPF + senha (bcrypt, JWT em cookie httpOnly), cadastro, recuperação de senha via Brevo — sem mudanças de fluxo.
- Layout/navegação (sidebar desktop, bottom-nav mobile, FAB), tema visual, ícones/PWA.
- Princípio de isolamento por usuário em toda query.
- Migração SQLite → Supabase/Postgres (já estava pendente — este modelo já assume Postgres/Supabase).

## 2. O que muda por completo (domínio financeiro)

O modelo atual (`Instancia` genérica com `tipo` livre + `Lancamento` simples entrada/saída + `Recorte` como filtro salvo nomeado) **não é reaproveitável** para as regras de negócio pedidas. É uma reescrita do domínio:

| Hoje | Modelo v2 |
|---|---|
| `Instancia.tipo`: conta/cartao/categoria_gasto/categoria_receita/objetivo (5 valores livres) | `instancias.grupo`: **gasto \| receita \| investimento** (3 valores fechados) |
| `Lancamento`: entrada/saida/transferencia, valor com sinal, data única | `lancamentos`: **fixo \| temporario**, `mes_inicio`/`mes_fim`, `parcelas`, sem data única — parcela é conceito mensal, não um evento datado |
| Sem conceito de "pagamento" | Tabela **`pagamentos`** nova — quitação de parcela é um evento separado do lançamento (permite parcial, atraso, adiantamento, idempotência) |
| Investimento = instância tipo "objetivo" com lançamentos normais | Tabela **`investimentos`** própria — fluxos +/- vinculados a uma instância do grupo investimento, sem afetar o saldo do fluxo mensal (exceto o aporte, que conta como comprometimento) |
| `Recorte`: filtro nomeado e salvo pelo usuário | **Recorte vira um seletor global de janela temporal** (mês/3/6/12) aplicado ao Dashboard e à aba Lançamentos — não é mais um objeto salvo pelo usuário |

Isso implica: **dropar** o model `Recorte` atual (ou re-propositar), **reescrever** `Instancia` e `Lancamento`, **criar** `Pagamento` e `Investimento`. No frontend: reescrever as páginas Instâncias, Lançamentos, Recortes (viram abas "Lançamentos / Pagamentos / Reserva e Investimentos") e o Dashboard.

## 3. Novo schema (rascunho)

```prisma
model Instancia {
  id        String   @id @default(uuid())
  usuarioId String
  nome      String
  grupo     String   // gasto | receita | investimento
  cor       String
  ativa     Boolean  @default(true)
  criadoEm  DateTime @default(now())

  lancamentos  Lancamento[]
  pagamentos   Pagamento[]
  investimentos Investimento[]
}

model Lancamento {
  id           String    @id @default(uuid())
  usuarioId    String
  instanciaId  String
  instancia    Instancia @relation(fields: [instanciaId], references: [id], onDelete: Cascade)
  descricao    String
  valor        Decimal   // valor da parcela/mensalidade, sempre > 0
  tipo         String    // fixo | temporario
  parcelas     Int?      // obrigatório e >=1 se temporario; NULL se fixo (nunca 1 como default silencioso)
  mesInicio    String    // "YYYY-MM"
  mesFim       String?   // calculado = mesInicio + parcelas - 1 (só temporario)
  ativo        Boolean   @default(true)
  observacoes  String?
  criadoEm     DateTime  @default(now())

  pagamentos Pagamento[]

  @@check(valor > 0)  // via CHECK no migration SQL (Prisma não gera CHECK nativamente pre-6.x sem raw SQL)
}

model Pagamento {
  id             String    @id @default(uuid())
  usuarioId      String
  instanciaId    String
  instancia      Instancia @relation(fields: [instanciaId], references: [id], onDelete: Cascade)
  lancamentoId   String?
  lancamento     Lancamento? @relation(fields: [lancamentoId], references: [id], onDelete: SetNull)
  mesReferencia  String    // "YYYY-MM"
  valorPago      Decimal
  tipo           String    // total | selecionado | parcial | avulso
  observacoes    String?
  criadoEm       DateTime  @default(now())
}

model Investimento {
  id          String    @id @default(uuid())
  usuarioId   String
  instanciaId String
  instancia   Instancia @relation(fields: [instanciaId], references: [id], onDelete: Cascade)
  descricao   String
  valor       Decimal   // + aporte, - resgate
  observacoes String?
  criadoEm    DateTime  @default(now())
}
```

Constraints a aplicar via SQL de migração (Prisma não expõe `CHECK` de forma nativa em todas as versões — vamos escrever no `migration.sql` manualmente):
- `CHECK (valor > 0)` em `lancamentos.valor`.
- `CHECK ((tipo = 'temporario' AND parcelas >= 1) OR (tipo = 'fixo' AND parcelas IS NULL))`.
- `NOT NULL` em todos os campos obrigatórios listados acima.
- RLS (ver decisão pendente na seção 5).

## 4. Regras de negócio — pontos que exigem lógica dedicada (não é só CRUD)

1. **Cálculo de `mes_fim`**: no backend, ao criar lançamento temporário, calcular `mesInicio + parcelas - 1` em meses — precisa de uma função utilitária de aritmética de "YYYY-MM" (somar meses, não dias).
2. **Parcelas restantes = parcelas − COUNT(pagamentos daquele lancamento_id)`, nunca por calendário.** Isso é uma query agregada, recalculada a cada leitura — não um campo armazenado que pode dessincronizar.
3. **Recorte temporal projetando fixo vs temporário diferente**: fixo = `valor × meses_da_janela`; temporário = contar apenas as parcelas cujo índice cai dentro da janela (a partir do mês atual, considerando quantas parcelas já foram pagas). Isso é uma função de projeção compartilhada entre Dashboard e aba Lançamentos — não duplicar a lógica nos dois lugares.
4. **Vencimento = último dia do `mes_referencia`** (calcular dinamicamente, não persistir uma data fixa) + flag "em atraso" calculada em runtime (`hoje > fim do mês E há débito em aberto`), nunca persistida como campo de status que pode ficar velho.
5. **Pagamento "Outro valor" com 3 ramos**: igual/maior/menor que o devido — o ramo "menor" cria uma **Pendência** (novo `Lancamento` tipo `temporario`, 1 parcela, no mês seguinte) automaticamente. Isso é uma transação que grava em duas tabelas (`Pagamento` + `Lancamento`) atomicamente — precisa de `prisma.$transaction`.
5b. **Pagamento "Outro valor" com valor > devido**: quita a parcela + cria `Lancamento` avulso **já quitado** (grava `Lancamento` ativo=false ou equivalente + `Pagamento` do excedente) — também transacional.
6. **Idempotência de pagamento**: não bloquear, só avisar no client antes de enviar (checar se já existe pagamento com mesma `instanciaId + mesReferencia` e perguntar "já há pagamento este mês, confirmar?").
7. **Investimento**: aporte (+) soma no comprometimento do recorte (conta como saída no dashboard); resgate (−) não reentra em lugar nenhum automaticamente — é só ajuste de patrimônio da conta.
8. **Nunca usar defaults silenciosos**: `parcelas` ausente com `tipo=temporario` é erro 400 explícito, não vira `1`. Validar com Zod tanto a forma (`tipo=temporario` → `parcelas` obrigatório `int >= 1`; `tipo=fixo` → `parcelas` deve ser omitido/null) quanto no schema do banco (CHECK).
9. **Todo cálculo agrega por `id`, nunca por `nome`** — nomes de instância podem repetir ou ser editados; isso já é natural no schema (FKs por id), só reforçar que nenhuma query de agregação deve fazer `GROUP BY nome`.

## 5. Decisões em aberto (preciso da sua confirmação antes de reescrever)

**(a) RLS real do Postgres/Supabase vs. isolamento por query (como hoje).**
O prompt pede RLS explicitamente, mas a autenticação é CPF+senha custom (JWT próprio via Express), não Supabase Auth. RLS nativo (`auth.uid()`) só funciona de graça quando o token vem do GoTrue (Supabase Auth) ou quando configuramos "Third-Party Auth" no Supabase apontando pro nosso emissor de JWT. Três caminhos:
  - **A1 — Manter Express + Prisma, isolamento por query (como já está).** Mais simples, zero mudança de arquitetura, mas não é RLS "de verdade" — se um dia um bug esquecer o filtro `WHERE usuarioId = ...`, vaza dado. Mitigo com testes automatizados nesse ponto.
  - **A2 — Configurar Supabase "Third-Party Auth"** para o Postgres aceitar nosso JWT (assinado com o mesmo algoritmo/claims esperados) e escrever policies RLS reais com `auth.jwt() ->> 'sub'`. Mantém o backend Express, ganha RLS de verdade, mas dá trabalho extra de configuração.
  - **A3 — Migrar para Supabase Auth de fato** (abandona bcrypt/JWT próprio, usa `supabase.auth` com CPF como campo customizado de perfil, login via um fluxo de troca CPF→email interno). Mudança maior na autenticação, que você pediu para preservar.
  
  **Recomendo A1 agora** (preserva o que já validamos, isolamento por query já está em todo lugar) **e deixo A2 como hardening de produção depois que o modelo de dados estiver estável** — evita re-trabalho se o schema ainda mudar. Confirma?

**(b) Paleta visual**: já extraí uma paleta real da logo (navy `#0E1A2B` / dourado `#C9A24B` / creme `#F7F5F0`) e ela está aplicada no protótipo atual. Este prompt novo traz uma paleta de fallback diferente (slate `#0f172a`, verde `#34d399`, vermelho `#f87171`, azul `#60a5fa`, roxo `#a78bfa`). Como já temos a paleta real da logo, **recomendo mantê-la como base** e usar os tons semânticos (positivo/negativo/alerta/investimento) do fallback só como referência de contraste — ajustando pro dourado/navy. Confirma, ou prefere adotar a paleta de fallback (mais "SaaS genérico", mas é a que foi validada na planilha)?

**(c) A aba "Recortes" (filtro salvo e nomeado) que já existe no protótipo não aparece neste modelo** — no lugar entra um seletor global de janela temporal (mês/3/6/12). Vou **remover** a funcionalidade de recorte nomeado/salvo e substituir pelo seletor de janela. Confirma que pode sair?

## 6. Ordem de implementação sugerida

1. Schema novo no Prisma (SQLite local por ora, ainda vamos migrar pra Supabase) + migração com CHECKs manuais.
2. Backend: rotas `instancias` (grupo fechado), `lancamentos` (fixo/temporário + cálculo de mes_fim), `pagamentos` (as 3 ações: total/selecionado/outro valor com os 3 ramos), `investimentos`.
3. Lib compartilhada de projeção temporal (mês/3/6/12) usada por dashboard e lançamentos — implementar uma vez, testar isolado.
4. Frontend — Aba Lançamentos (sub-seletor gasto/receita, botões de instância, form + gaveta).
5. Frontend — Aba Pagamentos (seletor de mês, 3 ações por instância, submodal "outro valor").
6. Frontend — Aba Reserva e Investimentos.
7. Dashboard completo (cards, saldo ao longo do tempo, evolução mensal, impacto por instância, patrimônio investido) + versão compacta reaproveitada no topo de Lançamentos.
8. Ajustar `.desktop`/launcher e testar E2E de novo.

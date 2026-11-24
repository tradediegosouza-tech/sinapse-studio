# Banco do Sinapse Studio (Supabase `zjsqtzqrwdktdcsinbcs`)

Lido ao vivo do banco em 24/11/2026 (information_schema + pg_policies).

## Tabelas (RLS ligado nas 3)

**clientes** — 1 linha por assinante; `id` = id do usuário no Supabase Auth.
`id uuid` · `email` · `nome` · `profissao` · `registro` · `plano` (padrão `essencial`) ·
`status` (`ativa` / `pausada` / `cancelada` / `inadimplente`, padrão `ativa`) ·
`creditos_por_mes` (padrão 10) · `renova_em date` · `criado_em`

**creditos** — livro-caixa de créditos (+ na compra/renovação, −1 por Reel).
`id` · `cliente_id` · `delta int` · `motivo` · `origem` · `criado_em`

**reels** — pedidos de Reel.
`id` · `cliente_id` · `tema` · `tom` · `roteiro` · `status` (`na_fila` / `produzindo` / `pronto` / `erro`) ·
`video_url` · `erro` · `criado_em` · `atualizado_em`

## Funções
- `saldo_creditos() -> integer` — saldo da cliente logada.
- `pedir_reel(p_tema text, p_tom text default null) -> bigint` — confere assinatura ativa e saldo,
  gasta 1 crédito e cria o Reel `na_fila`, tudo de uma vez.

## Políticas
- clientes: lê o próprio cadastro (SELECT); atualiza o próprio perfil (UPDATE: nome, profissão, registro).
- creditos: lê os próprios (SELECT).
- reels: lê os próprios (SELECT). Criação só pela função `pedir_reel`.

## O que escreve no banco por fora do app (n8n, com a chave service_role, só na VPS)
1. **Cakto → n8n**: compra/renovação cria o usuário no Auth (convite por e-mail), a linha em `clientes`
   e o `+créditos` em `creditos`. Cancelamento/inadimplência muda `clientes.status`.
2. **Fila → fábrica**: pega `reels` em `na_fila`, marca `produzindo`, gera na fábrica custo zero e grava
   `video_url` + `pronto` (ou `erro`).

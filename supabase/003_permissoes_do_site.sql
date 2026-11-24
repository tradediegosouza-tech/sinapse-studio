-- Sinapse Studio · migração 003: permissões do site (rodar no Editor SQL do Supabase)
--
-- PROBLEMA (visto em 24/11 com a cliente de teste logada): "permission denied for table clientes".
-- As regras de linha (RLS) existem, mas o papel "authenticated" (cliente logada) não tinha
-- permissão nem para LER as tabelas. Sem isto ninguém entra no painel.
--
-- Só ACRESCENTA permissões de leitura. Pode rodar de novo sem problema.
-- A cliente continua vendo SÓ as linhas dela (RLS) e só muda nome, profissão e registro:
-- status, plano e créditos NÃO podem ser alterados pelo site.

begin;

grant usage on schema public to authenticated;

grant select on public.clientes, public.creditos, public.reels to authenticated;

-- Perfil: só estas 3 colunas. Tira qualquer permissão mais larga que exista.
revoke insert, update, delete on public.clientes, public.creditos, public.reels from authenticated;
grant update (nome, profissao, registro) on public.clientes to authenticated;

grant execute on function public.saldo_creditos()       to authenticated;
grant execute on function public.pedir_reel(text, text) to authenticated;

-- Visitante sem login não lê nem escreve nada.
revoke all on public.clientes, public.creditos, public.reels from anon;

commit;

-- CONFERIR (tem que dar: select = true nas 3; update da tabela inteira = false; update do nome = true):
-- select t,
--        has_table_privilege('authenticated', 'public.' || t, 'select') as le,
--        has_table_privilege('authenticated', 'public.' || t, 'update') as muda_tudo
--   from (values ('clientes'), ('creditos'), ('reels')) v(t);
-- select has_column_privilege('authenticated', 'public.clientes', 'nome', 'update')   as muda_nome,
--        has_column_privilege('authenticated', 'public.clientes', 'status', 'update') as muda_status;

-- REVERTER:
-- revoke select on public.clientes, public.creditos, public.reels from authenticated;
-- revoke update (nome, profissao, registro) on public.clientes from authenticated;

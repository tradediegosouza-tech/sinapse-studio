-- Sinapse Studio · migração 002 (PROPOSTA: ainda NÃO rodada no banco)
-- Só ACRESCENTA: colunas novas, funções novas. Não apaga nem altera o que a 001 criou.
-- Desfazer: bloco "REVERTER" no fim do arquivo.
--
-- O que entra:
--   A) Reel com objetivo, formato, legenda, aprovação e 1 ajuste.
--   B) Funções da PONTE (só a chave service_role do n8n pode chamar):
--      pagamento → libera acesso e créditos; cancelamento → muda status;
--      fila → fábrica → vídeo pronto.

begin;

-- ───────────────────────── A) REEL ─────────────────────────
alter table public.reels
  add column if not exists objetivo      text,
  add column if not exists formato       text,
  add column if not exists legenda       text,
  add column if not exists aprovado_em   timestamptz,
  add column if not exists ajuste_pedido text,
  add column if not exists ajuste_em     timestamptz;

-- Pedir Reel com objetivo e formato. Reusa a pedir_reel da 001 (assinatura ativa + saldo + gasta 1 crédito).
create or replace function public.pedir_reel_completo(
  p_tema text, p_tom text default null, p_objetivo text default null, p_formato text default null
) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_id bigint;
begin
  if auth.uid() is null then raise exception 'Faça login.'; end if;
  v_id := public.pedir_reel(p_tema, p_tom);
  update public.reels
     set objetivo = nullif(left(trim(p_objetivo), 200), ''),
         formato  = nullif(left(trim(p_formato), 60), '')
   where id = v_id and cliente_id = auth.uid();
  return v_id;
end $$;

-- Aprovar: só o próprio Reel, só quando está pronto.
create or replace function public.aprovar_reel(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.reels set aprovado_em = now()
   where id = p_id and cliente_id = auth.uid() and status = 'pronto' and aprovado_em is null;
  if not found then raise exception 'Este Reel não pode ser aprovado agora.'; end if;
end $$;

-- Pedir ajuste: 1 por Reel, sem gastar crédito. Volta para a fila com o pedido escrito.
create or replace function public.pedir_ajuste(p_id bigint, p_texto text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(length(trim(p_texto)), 0) < 5 then raise exception 'Conte o que você quer ajustar.'; end if;
  update public.reels
     set ajuste_pedido = left(trim(p_texto), 500), ajuste_em = now(),
         status = 'na_fila', atualizado_em = now()
   where id = p_id and cliente_id = auth.uid() and status = 'pronto'
     and aprovado_em is null and ajuste_pedido is null;
  if not found then raise exception 'Este Reel já teve 1 ajuste ou já foi aprovado.'; end if;
end $$;

revoke all on function public.pedir_reel_completo(text, text, text, text) from public, anon;
revoke all on function public.aprovar_reel(bigint)                        from public, anon;
revoke all on function public.pedir_ajuste(bigint, text)                  from public, anon;
grant execute on function public.pedir_reel_completo(text, text, text, text) to authenticated;
grant execute on function public.aprovar_reel(bigint)                        to authenticated;
grant execute on function public.pedir_ajuste(bigint, text)                  to authenticated;

-- ───────────────────────── B) PONTE (service_role) ─────────────────────────

-- Pagamento aprovado ou renovação. p_user_id = id do usuário criado/achado no Supabase Auth pelo n8n.
-- p_origem = identificador único do pagamento (ex.: 'cakto:<id do pedido>'): rodar 2x não credita 2x.
-- p_zerar_antes = true na renovação: créditos do mês anterior não acumulam.
create or replace function public.studio_liberar(
  p_user_id uuid, p_email text, p_nome text, p_plano text, p_creditos_por_mes int,
  p_creditos int, p_origem text, p_motivo text, p_renova_em date default null, p_zerar_antes boolean default false
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_saldo int; v_ja boolean;
begin
  if p_origem is null or p_origem = '' then raise exception 'origem obrigatória'; end if;

  insert into public.clientes (id, email, nome, plano, status, creditos_por_mes, renova_em)
  values (p_user_id, lower(p_email), p_nome, coalesce(p_plano, 'essencial'), 'ativa',
          coalesce(p_creditos_por_mes, 10), p_renova_em)
  on conflict (id) do update
     set status = 'ativa',
         plano = coalesce(excluded.plano, public.clientes.plano),
         creditos_por_mes = coalesce(p_creditos_por_mes, public.clientes.creditos_por_mes),
         renova_em = coalesce(excluded.renova_em, public.clientes.renova_em);

  perform 1 from public.clientes where id = p_user_id for update;
  select exists (select 1 from public.creditos where cliente_id = p_user_id and origem = p_origem) into v_ja;
  if not v_ja then
    if p_zerar_antes then
      select coalesce(sum(delta), 0) into v_saldo from public.creditos where cliente_id = p_user_id;
      if v_saldo > 0 then
        insert into public.creditos (cliente_id, delta, motivo, origem)
        values (p_user_id, -v_saldo, 'Créditos do mês anterior venceram', p_origem || ':zerar');
      end if;
    end if;
    if coalesce(p_creditos, 0) <> 0 then
      insert into public.creditos (cliente_id, delta, motivo, origem)
      values (p_user_id, p_creditos, p_motivo, p_origem);
    end if;
  end if;

  select coalesce(sum(delta), 0) into v_saldo from public.creditos where cliente_id = p_user_id;
  return jsonb_build_object('cliente_id', p_user_id, 'repetido', v_ja, 'saldo', v_saldo);
end $$;

-- Cancelamento, inadimplência, reembolso. p_zerar = true tira os créditos (reembolso/chargeback).
create or replace function public.studio_status(
  p_email text, p_status text, p_origem text, p_zerar boolean default false
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_saldo int;
begin
  if p_status not in ('ativa', 'pausada', 'cancelada', 'inadimplente') then
    raise exception 'status inválido: %', p_status;
  end if;
  update public.clientes set status = p_status where email = lower(p_email) returning id into v_id;
  if v_id is null then return jsonb_build_object('achou', false); end if;
  if p_zerar and not exists (select 1 from public.creditos where cliente_id = v_id and origem = p_origem) then
    select coalesce(sum(delta), 0) into v_saldo from public.creditos where cliente_id = v_id;
    if v_saldo > 0 then
      insert into public.creditos (cliente_id, delta, motivo, origem)
      values (v_id, -v_saldo, 'Créditos retirados (' || p_status || ')', p_origem);
    end if;
  end if;
  return jsonb_build_object('achou', true, 'cliente_id', v_id, 'status', p_status);
end $$;

-- Fábrica: pega o próximo Reel da fila (1 por vez, sem dois robôs pegarem o mesmo) e marca "produzindo".
create or replace function public.studio_proximo_reel() returns jsonb
language plpgsql security definer set search_path = public as $$
declare r public.reels; c public.clientes;
begin
  select * into r from public.reels where status = 'na_fila'
   order by criado_em for update skip locked limit 1;
  if not found then return null; end if;
  update public.reels set status = 'produzindo', atualizado_em = now() where id = r.id;
  select * into c from public.clientes where id = r.cliente_id;
  return jsonb_build_object(
    'reel_id', r.id, 'tema', r.tema, 'tom', r.tom, 'objetivo', r.objetivo, 'formato', r.formato,
    'ajuste_pedido', r.ajuste_pedido, 'roteiro_anterior', r.roteiro,
    'nome', c.nome, 'profissao', c.profissao, 'registro', c.registro, 'email', c.email);
end $$;

-- Fábrica terminou.
create or replace function public.studio_reel_pronto(
  p_id bigint, p_video_url text, p_roteiro text default null, p_legenda text default null
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_video_url !~ '^https://' then raise exception 'video_url precisa ser https'; end if;
  update public.reels
     set status = 'pronto', video_url = p_video_url, erro = null, atualizado_em = now(),
         roteiro = coalesce(p_roteiro, roteiro), legenda = coalesce(p_legenda, legenda)
   where id = p_id and status = 'produzindo';
  if not found then raise exception 'Reel % não está em produção', p_id; end if;
end $$;

-- Fábrica falhou: marca erro e DEVOLVE o crédito (1 vez só), a não ser que fosse um ajuste (ajuste não gastou crédito).
create or replace function public.studio_reel_erro(p_id bigint, p_erro text) returns void
language plpgsql security definer set search_path = public as $$
declare r public.reels;
begin
  update public.reels set status = 'erro', erro = left(p_erro, 500), atualizado_em = now()
   where id = p_id and status = 'produzindo' returning * into r;
  if not found then raise exception 'Reel % não está em produção', p_id; end if;
  if r.ajuste_pedido is null
     and not exists (select 1 from public.creditos where origem = 'devolucao:reel:' || p_id) then
    insert into public.creditos (cliente_id, delta, motivo, origem)
    values (r.cliente_id, 1, 'Crédito devolvido: o Reel não pôde ser gerado', 'devolucao:reel:' || p_id);
  end if;
end $$;

-- As funções da ponte NÃO podem ser chamadas pelo site (anon/authenticated). Só service_role.
do $$
declare f text;
begin
  foreach f in array array[
    'public.studio_liberar(uuid, text, text, text, int, int, text, text, date, boolean)',
    'public.studio_status(text, text, text, boolean)',
    'public.studio_proximo_reel()',
    'public.studio_reel_pronto(bigint, text, text, text)',
    'public.studio_reel_erro(bigint, text)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

commit;

-- ───────────────────────── CONFERIR DEPOIS DE RODAR ─────────────────────────
-- 1) Site não pode chamar a ponte (tem que dar "permission denied"), logada como cliente:
--      select public.studio_proximo_reel();
-- 2) Permissões:
--      select p.proname, r.rolname, has_function_privilege(r.rolname, p.oid, 'execute') pode
--      from pg_proc p cross join (values ('anon'), ('authenticated'), ('service_role')) r(rolname)
--      where p.pronamespace = 'public'::regnamespace and p.proname like 'studio_%' order by 1, 2;

-- ───────────────────────── REVERTER ─────────────────────────
-- drop function if exists public.studio_reel_erro(bigint, text);
-- drop function if exists public.studio_reel_pronto(bigint, text, text, text);
-- drop function if exists public.studio_proximo_reel();
-- drop function if exists public.studio_status(text, text, text, boolean);
-- drop function if exists public.studio_liberar(uuid, text, text, text, int, int, text, text, date, boolean);
-- drop function if exists public.pedir_ajuste(bigint, text);
-- drop function if exists public.aprovar_reel(bigint);
-- drop function if exists public.pedir_reel_completo(text, text, text, text);
-- alter table public.reels drop column if exists objetivo, drop column if exists formato,
--   drop column if exists legenda, drop column if exists aprovado_em,
--   drop column if exists ajuste_pedido, drop column if exists ajuste_em;

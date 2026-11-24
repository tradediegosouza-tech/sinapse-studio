-- Sinapse Studio · migração 004 (PROPOSTA: rodar no Editor SQL do Supabase DEPOIS da 002 e da 003)
-- Pedido do Diego + parecer do GPT (24/11): travar a criação de Reel enquanto a fábrica não está ligada
-- e corrigir os defeitos de crédito achados na auditoria de compra simulada.
-- Desfazer: bloco "REVERTER" no fim.

begin;

-- ───────── A) TRAVA: produção em ativação ─────────
-- Enquanto a fila não estiver ligada à fábrica, a cliente NÃO consegue pedir Reel nem ajuste,
-- nem chamando o banco direto. Assim nenhum crédito é descontado.
revoke execute on function public.pedir_reel(text, text)                     from public, anon, authenticated;
revoke execute on function public.pedir_reel_completo(text, text, text, text) from public, anon, authenticated;
revoke execute on function public.pedir_ajuste(bigint, text)                  from authenticated;

-- ───────── B) Ajuste só para assinatura ativa ─────────
create or replace function public.pedir_ajuste(p_id bigint, p_texto text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if coalesce(length(trim(p_texto)), 0) < 5 then raise exception 'Conte o que você quer ajustar.'; end if;
  if not exists (select 1 from public.clientes where id = auth.uid() and status = 'ativa') then
    raise exception 'Sua assinatura precisa estar ativa para pedir ajuste.';
  end if;
  update public.reels
     set ajuste_pedido = left(trim(p_texto), 500), ajuste_em = now(),
         status = 'na_fila', atualizado_em = now()
   where id = p_id and cliente_id = auth.uid() and status = 'pronto'
     and aprovado_em is null and ajuste_pedido is null;
  if not found then raise exception 'Este Reel já teve 1 ajuste ou já foi aprovado.'; end if;
end $$;
revoke execute on function public.pedir_ajuste(bigint, text) from public, anon, authenticated;

-- ───────── C) Liberar créditos sem os defeitos da auditoria ─────────
-- Correções:
--  1) Evento repetido (mesma origem) não muda NADA (antes reativava quem foi reembolsada).
--  2) Só o plano PRINCIPAL ativa a assinatura. Upgrade, bump e avulso nunca reativam
--     quem cancelou, está inadimplente ou foi reembolsada.
--  3) O principal não rebaixa quem é Pro.
--  4) "Créditos não acumulam" zera só o que é do ciclo anterior: créditos ganhos nos
--     últimos 3 dias (renovação do upgrade, avulso comprado na véspera) ficam.
create or replace function public.studio_liberar(
  p_user_id uuid, p_email text, p_nome text, p_plano text, p_creditos_por_mes int,
  p_creditos int, p_origem text, p_motivo text, p_renova_em date default null,
  p_zerar_antes boolean default false, p_tipo text default 'principal'
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_saldo int; v_recente int; v_ja boolean; v_existe boolean; v_plano text;
begin
  if p_origem is null or p_origem = '' then raise exception 'origem obrigatória'; end if;
  if p_tipo not in ('principal', 'upgrade', 'bump', 'avulso') then raise exception 'tipo inválido: %', p_tipo; end if;

  select exists (select 1 from public.creditos where cliente_id = p_user_id and origem = p_origem) into v_ja;
  if v_ja then
    select coalesce(sum(delta), 0) into v_saldo from public.creditos where cliente_id = p_user_id;
    return jsonb_build_object('cliente_id', p_user_id, 'repetido', true, 'saldo', v_saldo);
  end if;

  select exists (select 1 from public.clientes where id = p_user_id), plano
    into v_existe, v_plano from public.clientes where id = p_user_id;
  v_existe := coalesce(v_existe, false);

  if not v_existe then
    -- Cliente nova: ativa (pagou). Plano: o do produto; para bump/avulso, básico.
    insert into public.clientes (id, email, nome, plano, status, creditos_por_mes, renova_em)
    values (p_user_id, lower(trim(p_email)), p_nome, coalesce(p_plano, 'studio'), 'ativa',
            coalesce(p_creditos_por_mes, 10), p_renova_em);
  elsif p_tipo = 'principal' then
    update public.clientes
       set status = 'ativa',
           plano = case when v_plano = 'studio_pro' then v_plano else coalesce(p_plano, plano) end,
           creditos_por_mes = case when v_plano = 'studio_pro' then creditos_por_mes
                                   else coalesce(p_creditos_por_mes, creditos_por_mes) end,
           renova_em = coalesce(p_renova_em, renova_em)
     where id = p_user_id;
  elsif p_tipo = 'upgrade' then
    -- Upgrade muda o plano, mas NÃO reativa quem não está ativa.
    update public.clientes
       set plano = coalesce(p_plano, plano),
           creditos_por_mes = coalesce(p_creditos_por_mes, creditos_por_mes)
     where id = p_user_id;
  end if;
  -- bump/avulso de cliente existente: só créditos.

  perform 1 from public.clientes where id = p_user_id for update;

  if p_zerar_antes then
    select coalesce(sum(delta), 0) into v_saldo from public.creditos where cliente_id = p_user_id;
    select coalesce(sum(delta), 0) into v_recente from public.creditos
     where cliente_id = p_user_id and delta > 0 and criado_em >= now() - interval '3 days';
    v_saldo := greatest(0, v_saldo - v_recente);
    if v_saldo > 0 then
      insert into public.creditos (cliente_id, delta, motivo, origem)
      values (p_user_id, -v_saldo, 'Créditos do mês anterior venceram', p_origem || ':zerar');
    end if;
  end if;

  if coalesce(p_creditos, 0) <> 0 then
    insert into public.creditos (cliente_id, delta, motivo, origem)
    values (p_user_id, p_creditos, p_motivo, p_origem);
  end if;

  select coalesce(sum(delta), 0) into v_saldo from public.creditos where cliente_id = p_user_id;
  return jsonb_build_object('cliente_id', p_user_id, 'repetido', false, 'saldo', v_saldo);
end $$;

-- ───────── D) Estorno de compra de créditos (reembolso de bump, upgrade ou avulso) ─────────
-- Tira os créditos daquela compra (nunca deixa o saldo negativo). Rodar 2x não estorna 2x.
create or replace function public.studio_estornar(p_email text, p_origem_compra text, p_origem text)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid; v_compra int; v_saldo int; v_tira int;
begin
  select id into v_id from public.clientes where lower(email) = lower(trim(p_email)) order by criado_em limit 1;
  if v_id is null then raise exception 'cliente não encontrada para estorno'; end if;
  perform 1 from public.clientes where id = v_id for update;
  if exists (select 1 from public.creditos where cliente_id = v_id and origem = p_origem) then
    return jsonb_build_object('cliente_id', v_id, 'repetido', true);
  end if;
  select coalesce(sum(delta), 0) into v_compra from public.creditos
   where cliente_id = v_id and origem = p_origem_compra and delta > 0;
  select coalesce(sum(delta), 0) into v_saldo from public.creditos where cliente_id = v_id;
  v_tira := least(v_compra, greatest(v_saldo, 0));
  if v_tira > 0 then
    insert into public.creditos (cliente_id, delta, motivo, origem)
    values (v_id, -v_tira, 'Créditos estornados (reembolso)', p_origem);
  end if;
  return jsonb_build_object('cliente_id', v_id, 'repetido', false, 'estornado', v_tira);
end $$;

-- ───────── E) Status: acha e-mail sem diferenciar maiúscula; erro se não achar ─────────
create or replace function public.studio_status(
  p_email text, p_status text, p_origem text, p_zerar boolean default false
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid; v_saldo int;
begin
  if p_status not in ('ativa', 'pausada', 'cancelada', 'inadimplente') then
    raise exception 'status inválido: %', p_status;
  end if;
  select id into v_id from public.clientes where lower(email) = lower(trim(p_email)) order by criado_em limit 1;
  if v_id is null then raise exception 'cliente não encontrada: status % não aplicado', p_status; end if;
  update public.clientes set status = p_status where id = v_id;
  if p_zerar and not exists (select 1 from public.creditos where cliente_id = v_id and origem = p_origem) then
    select coalesce(sum(delta), 0) into v_saldo from public.creditos where cliente_id = v_id;
    if v_saldo > 0 then
      insert into public.creditos (cliente_id, delta, motivo, origem)
      values (v_id, -v_saldo, 'Créditos retirados (' || p_status || ')', p_origem);
    end if;
  end if;
  return jsonb_build_object('achou', true, 'cliente_id', v_id, 'status', p_status);
end $$;

-- A função antiga de liberar (10 parâmetros) sai: o fluxo passa a mandar p_tipo.
drop function if exists public.studio_liberar(uuid, text, text, text, int, int, text, text, date, boolean);

-- Mesmo crédito não pode entrar 2x (proteção extra contra corrida).
create unique index if not exists creditos_cliente_origem_unico on public.creditos (cliente_id, origem);

-- Ponte: só service_role.
do $$
declare f text;
begin
  foreach f in array array[
    'public.studio_liberar(uuid, text, text, text, int, int, text, text, date, boolean, text)',
    'public.studio_estornar(text, text, text)',
    'public.studio_status(text, text, text, boolean)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

commit;

-- ───────── CONFERIR ─────────
-- Tem que dar pode = false para authenticated em pedir_reel, pedir_reel_completo e pedir_ajuste
-- e false para anon/authenticated em todas as studio_*:
-- select p.proname, r.rolname, has_function_privilege(r.rolname, p.oid, 'execute') pode
--   from pg_proc p cross join (values ('anon'), ('authenticated'), ('service_role')) r(rolname)
--  where p.pronamespace = 'public'::regnamespace
--    and (p.proname like 'studio_%' or p.proname in ('pedir_reel', 'pedir_reel_completo', 'pedir_ajuste'))
--  order by 1, 2;
-- Se o índice único falhar, já existem créditos repetidos: rode
-- select cliente_id, origem, count(*) from public.creditos group by 1, 2 having count(*) > 1;

-- ───────── LIGAR A PRODUÇÃO (só quando a fila estiver ligada à fábrica) ─────────
-- grant execute on function public.pedir_reel(text, text)                     to authenticated;
-- grant execute on function public.pedir_reel_completo(text, text, text, text) to authenticated;
-- grant execute on function public.pedir_ajuste(bigint, text)                  to authenticated;

-- ───────── REVERTER ─────────
-- (1) ligar a produção (bloco acima); (2) rodar de novo a 002 (recria studio_liberar de 10 parâmetros,
--     studio_status e pedir_ajuste antigos); (3) drop function if exists public.studio_estornar(text, text, text);
--     drop function if exists public.studio_liberar(uuid, text, text, text, int, int, text, text, date, boolean, text);
--     drop index if exists public.creditos_cliente_origem_unico;

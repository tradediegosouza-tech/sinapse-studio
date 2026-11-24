-- Cria 1 cliente de TESTE com 10 créditos (rodar no Editor SQL do Supabase).
-- Antes: Authentication › Users › Add user › Create new user (e-mail do teste, "Auto Confirm User" ligado).
-- Trocar o e-mail abaixo. Pode rodar de novo sem duplicar.
do $$
declare
  v_email text := 'TROCAR@EMAIL.COM';
  v_id uuid;
begin
  select id into v_id from auth.users where lower(email) = lower(v_email);
  if v_id is null then
    raise exception 'Usuário % não existe no Auth. Crie em Authentication › Users primeiro.', v_email;
  end if;

  insert into public.clientes (id, email, nome, status, creditos_por_mes, renova_em)
  values (v_id, v_email, 'Cliente de teste', 'ativa', 10, current_date + 30)
  on conflict (id) do nothing;

  if not exists (select 1 from public.creditos where cliente_id = v_id and origem = 'teste') then
    insert into public.creditos (cliente_id, delta, motivo, origem)
    values (v_id, 10, 'Créditos de teste', 'teste');
  end if;
end $$;

-- Conferir:
-- select c.email, c.status, coalesce(sum(k.delta), 0) as saldo
-- from public.clientes c left join public.creditos k on k.cliente_id = c.id
-- group by 1, 2;

-- Apagar o teste depois (trocar o e-mail):
-- delete from public.reels    where cliente_id = (select id from auth.users where email = 'TROCAR@EMAIL.COM');
-- delete from public.creditos where cliente_id = (select id from auth.users where email = 'TROCAR@EMAIL.COM');
-- delete from public.clientes where id         = (select id from auth.users where email = 'TROCAR@EMAIL.COM');

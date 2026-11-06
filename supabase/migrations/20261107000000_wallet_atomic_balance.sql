-- Atomic FinPal ledger: available is updated in SQL, not read-modify-write
-- in the app. Unique SEND_RELEASE / SEND_CAPTURE prevent a second refund.

create unique index if not exists wallet_ledger_send_release_uidx
  on public.wallet_ledger_entries (send_draft_id)
  where kind = 'SEND_RELEASE' and send_draft_id is not null;

create unique index if not exists wallet_ledger_send_capture_uidx
  on public.wallet_ledger_entries (send_draft_id)
  where kind = 'SEND_CAPTURE' and send_draft_id is not null;

create or replace function public.apply_wallet_op(
  p_op text,
  p_user_id uuid,
  p_amount numeric,
  p_currency text,
  p_entry_id uuid,
  p_paypal_order_id text default null,
  p_send_draft_id uuid default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_available numeric;
  v_applied boolean := false;
begin
  if p_op not in ('credit', 'hold', 'release', 'capture') then
    raise exception 'INVALID_WALLET_OP' using errcode = 'P0001';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'INVALID_AMOUNT' using errcode = 'P0001';
  end if;

  insert into public.user_wallets (user_id, currency, available)
  values (p_user_id, coalesce(p_currency, 'USD'), 0)
  on conflict (user_id) do nothing;

  if p_op = 'credit' then
    begin
      insert into public.wallet_ledger_entries (
        id, user_id, kind, amount, currency, paypal_order_id
      ) values (
        p_entry_id, p_user_id, 'TOP_UP', p_amount, p_currency, p_paypal_order_id
      );
      update public.user_wallets
        set available = available + p_amount
        where user_id = p_user_id
        returning available into v_available;
      v_applied := true;
    exception
      when unique_violation then
        select available into v_available
        from public.user_wallets
        where user_id = p_user_id;
        v_applied := false;
    end;

  elsif p_op = 'hold' then
    if exists (
      select 1
      from public.wallet_ledger_entries
      where kind = 'SEND_HOLD' and send_draft_id = p_send_draft_id
    ) then
      select available into v_available
      from public.user_wallets
      where user_id = p_user_id;
      return jsonb_build_object('applied', false, 'available', v_available);
    end if;

    update public.user_wallets
      set available = available - p_amount
      where user_id = p_user_id and available >= p_amount
      returning available into v_available;
    if not found then
      raise exception 'INSUFFICIENT_BALANCE' using errcode = 'P0001';
    end if;

    begin
      insert into public.wallet_ledger_entries (
        id, user_id, kind, amount, currency, send_draft_id
      ) values (
        p_entry_id, p_user_id, 'SEND_HOLD', p_amount, p_currency, p_send_draft_id
      );
      v_applied := true;
    exception
      when unique_violation then
        update public.user_wallets
          set available = available + p_amount
          where user_id = p_user_id
          returning available into v_available;
        v_applied := false;
    end;

  elsif p_op = 'release' then
    if not exists (
      select 1
      from public.wallet_ledger_entries
      where kind = 'SEND_HOLD' and send_draft_id = p_send_draft_id
    ) then
      select available into v_available
      from public.user_wallets
      where user_id = p_user_id;
      return jsonb_build_object('applied', false, 'available', v_available);
    end if;

    begin
      insert into public.wallet_ledger_entries (
        id, user_id, kind, amount, currency, send_draft_id
      ) values (
        p_entry_id, p_user_id, 'SEND_RELEASE', p_amount, p_currency, p_send_draft_id
      );
      update public.user_wallets
        set available = available + p_amount
        where user_id = p_user_id
        returning available into v_available;
      v_applied := true;
    exception
      when unique_violation then
        select available into v_available
        from public.user_wallets
        where user_id = p_user_id;
        v_applied := false;
    end;

  elsif p_op = 'capture' then
    begin
      insert into public.wallet_ledger_entries (
        id, user_id, kind, amount, currency, send_draft_id
      ) values (
        p_entry_id, p_user_id, 'SEND_CAPTURE', p_amount, p_currency, p_send_draft_id
      );
      v_applied := true;
    exception
      when unique_violation then
        v_applied := false;
    end;
    select available into v_available
    from public.user_wallets
    where user_id = p_user_id;
  end if;

  return jsonb_build_object('applied', v_applied, 'available', v_available);
end;
$$;

revoke execute on function public.apply_wallet_op(
  text, uuid, numeric, text, uuid, text, uuid
) from public, anon, authenticated;

grant execute on function public.apply_wallet_op(
  text, uuid, numeric, text, uuid, text, uuid
) to service_role;

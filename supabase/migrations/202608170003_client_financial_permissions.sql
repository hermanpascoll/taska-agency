-- Edición contractual independiente de la administración general del espacio.
create or replace function public.update_client_financials(
  candidate_client_id uuid,
  candidate_monthly_fee numeric,
  candidate_budgeted_hours numeric,
  candidate_contract_start date,
  candidate_contract_end date,
  candidate_currency text
)
returns void language plpgsql security definer set search_path = '' as $$
declare candidate_team_id uuid;
begin
  select team_id into candidate_team_id from public.clients where id = candidate_client_id;
  if candidate_team_id is null then raise exception 'Client not found'; end if;
  if not public.can_manage_costs(candidate_team_id) and not public.can_manage_billing(candidate_team_id) then
    raise exception 'Financial management permission required';
  end if;
  if coalesce(candidate_monthly_fee, 0) < 0 or coalesce(candidate_budgeted_hours, 0) < 0 then
    raise exception 'Financial values cannot be negative';
  end if;
  update public.clients set
    monthly_fee = coalesce(candidate_monthly_fee, 0),
    budgeted_hours = coalesce(candidate_budgeted_hours, 0),
    contract_start = candidate_contract_start,
    contract_end = candidate_contract_end,
    currency = nullif(upper(trim(candidate_currency)), '')
  where id = candidate_client_id;
end;
$$;
revoke all on function public.update_client_financials(uuid, numeric, numeric, date, date, text) from public;
grant execute on function public.update_client_financials(uuid, numeric, numeric, date, date, text) to authenticated;

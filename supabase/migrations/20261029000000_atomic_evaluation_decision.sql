-- Store an evaluation and the decision made from it in one transaction.
--
-- Previously the backend inserted them as two separate requests, so a
-- failure in between could leave an evaluation with no decision. A function
-- call is a single statement, so both inserts commit or roll back together.

create or replace function public.record_evaluation_with_decision(
  p_user_id uuid,
  p_proposal_id uuid,
  p_quality jsonb,
  p_constraint_check jsonb,
  p_trust_signal text,
  p_trust_evidence jsonb,
  p_outcome public.decision_outcome,
  p_reason text,
  p_reasons jsonb
)
returns jsonb
language plpgsql
-- Runs with the caller's rights. Only service_role may execute it (below),
-- and RLS still forbids users from inserting evaluations or decisions.
security invoker
set search_path = ''
as $$
declare
  v_evaluation public.evaluations;
  v_decision public.decisions;
begin
  -- Defence in depth: the proposal must belong to the user.
  if not exists (
    select 1 from public.proposals
    where id = p_proposal_id and user_id = p_user_id
  ) then
    raise exception 'proposal % not found for user', p_proposal_id
      using errcode = 'no_data_found';
  end if;

  insert into public.evaluations (
    user_id, proposal_id, quality_score, explanation, channel3_refs,
    trust_signal, trust_evidence, offer_count, median_price, lowest_price,
    offer_currency, constraint_check, quality_result
  ) values (
    p_user_id,
    p_proposal_id,
    (p_quality ->> 'score')::public.quality_score,
    p_quality ->> 'explanation',
    coalesce(p_quality -> 'references', '[]'::jsonb),
    p_trust_signal,
    coalesce(p_trust_evidence, '{}'::jsonb),
    (p_quality ->> 'offerCount')::integer,
    (p_quality ->> 'medianPrice')::numeric,
    (p_quality ->> 'lowestPrice')::numeric,
    p_quality ->> 'currency',
    p_constraint_check,
    p_quality
  )
  returning * into v_evaluation;

  insert into public.decisions (user_id, evaluation_id, outcome, reason, reasons)
  values (p_user_id, v_evaluation.id, p_outcome, p_reason, p_reasons)
  returning * into v_decision;

  return jsonb_build_object(
    'evaluation', to_jsonb(v_evaluation),
    'decision', to_jsonb(v_decision)
  );
end;
$$;

revoke execute on function public.record_evaluation_with_decision(
  uuid, uuid, jsonb, jsonb, text, jsonb, public.decision_outcome, text, jsonb
) from public, anon, authenticated;

grant execute on function public.record_evaluation_with_decision(
  uuid, uuid, jsonb, jsonb, text, jsonb, public.decision_outcome, text, jsonb
) to service_role;

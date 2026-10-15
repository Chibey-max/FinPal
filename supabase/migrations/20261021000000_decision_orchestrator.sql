-- Decision orchestrator: store the complete, deterministic evaluation.

-- NOT_CHECKED = no merchant trust check is configured (the decision table's
-- "N/A"). UNAVAILABLE = a check was attempted and failed.
alter table public.evaluations
  drop constraint evaluations_trust_signal_check,
  add constraint evaluations_trust_signal_check
    check (trust_signal in ('PASS', 'FAIL', 'UNAVAILABLE', 'NOT_CHECKED'));

-- Full Quality Score result (thresholds, ratio, lookup status, references),
-- kept alongside the flat columns that dashboards filter and sort on.
alter table public.evaluations
  add column quality_result jsonb not null default '{}'::jsonb
    check (jsonb_typeof(quality_result) = 'object');

-- Null when the user had no spending constraints at evaluation time.
alter table public.evaluations
  alter column constraint_check drop not null,
  alter column constraint_check drop default;

create index decisions_user_outcome_idx
  on public.decisions(user_id, outcome, decided_at desc);

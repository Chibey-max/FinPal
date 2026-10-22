-- Proposals the shopping agent submits are stored as AGENT, so every list,
-- detail and audit trail shows that the agent (not a person) chose the offer.
-- The public proposals API still only accepts MANUAL and CALENDAR.
alter type public.proposal_source add value if not exists 'AGENT';

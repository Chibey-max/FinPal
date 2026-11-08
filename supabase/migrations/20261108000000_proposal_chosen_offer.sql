-- The Agent's chosen Channel3 listing. KERNEL visits this URL, not the
-- cheapest comparable. Manual/calendar proposals leave these null.
alter table public.proposals
  add column offer_url text,
  add column offer_merchant text;

alter table public.proposals
  add constraint proposals_offer_url_http
  check (
    offer_url is null
    or offer_url ~* '^https?://'
  );

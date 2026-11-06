-- When a send was approved. Daily and monthly totals count a send on the day
-- it left, not the day its row was last touched (updated_at moves on every
-- status refresh).
alter table public.send_drafts
  add column if not exists sent_at timestamptz;

-- Existing sends: the best record of when they left.
update public.send_drafts
  set sent_at = updated_at
  where sent_at is null and status in ('PAYING', 'SENT');

-- Per-user limits and caps, and the shared wallet's total across users.
create index if not exists send_drafts_user_sent_at_idx
  on public.send_drafts (user_id, sent_at)
  where sent_at is not null;

create index if not exists send_drafts_sent_at_idx
  on public.send_drafts (sent_at)
  where sent_at is not null;

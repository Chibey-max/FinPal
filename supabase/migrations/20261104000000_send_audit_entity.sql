-- Send funds (Payouts) audit entity type.
alter table public.audit_events
  drop constraint if exists audit_events_entity_type_known;

alter table public.audit_events
  add constraint audit_events_entity_type_known check (
    entity_type in (
      'constraints',
      'proposal',
      'evaluation',
      'decision',
      'payment_attempt',
      'send'
    )
  );

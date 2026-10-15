-- audit_events is append-only for every role, including service_role and the
-- table owner: corrections are new events, never edits. Grants alone are not
-- enough because service_role and owners bypass them, so a trigger enforces it.

create or replace function public.reject_audit_event_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'audit_events is append-only: % is not allowed; record a new event instead', tg_op
    using errcode = 'insufficient_privilege';
end;
$$;

create trigger audit_events_no_update_or_delete
  before update or delete on public.audit_events
  for each row execute function public.reject_audit_event_change();

create trigger audit_events_no_truncate
  before truncate on public.audit_events
  for each statement execute function public.reject_audit_event_change();

-- Belt and braces: no API role may change rows, and only the backend
-- (service_role) may insert. Users read their own rows through RLS.
revoke update, delete, truncate on public.audit_events from anon, authenticated, service_role;
revoke insert on public.audit_events from anon, authenticated;

-- Taxonomy guards. Event names are free to grow (format-checked only);
-- entity types are a closed set matching auditEntityTypeSchema.
alter table public.audit_events
  add constraint audit_events_entity_type_known check (
    entity_type in ('constraints', 'proposal', 'evaluation', 'decision', 'payment_attempt')
  ),
  add constraint audit_events_type_format check (type ~ '^[A-Z][A-Z0-9_]*$'),
  add constraint audit_events_payload_is_object check (jsonb_typeof(payload) = 'object');

-- Rode este arquivo se voce ja executou supabase/schema.sql antes da versao com PIN.
-- Depois, entre em /admin e defina um PIN para cada participante existente.

alter table public.participants
  add column if not exists pin_hash text;

drop policy if exists "Public can create participants" on public.participants;
drop policy if exists "Public can read participants" on public.participants;

create policy "Public cannot read participants directly" on public.participants
  for select using (false);

revoke select, insert on public.participants from anon, authenticated;

alter view if exists public.ranking set (security_invoker = false);

do $$
begin
  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and indexname = 'participants_name_unique_idx'
  ) then
    create unique index participants_name_unique_idx on public.participants (lower(trim(name)));
  end if;
end
$$;

create extension if not exists pgcrypto;

drop view if exists public.ranking;
drop table if exists public.predictions;
drop table if exists public.matches;
drop table if exists public.participants;
drop type if exists public.match_status;

create type public.match_status as enum ('scheduled', 'finished');

create table public.participants (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 80),
  pin_hash text not null,
  created_at timestamptz not null default now()
);

create unique index participants_name_unique_idx on public.participants (lower(trim(name)));

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  match_number integer not null unique,
  stage text not null,
  group_name text,
  kickoff_at timestamptz not null,
  home_team text not null,
  away_team text not null,
  stadium text,
  status public.match_status not null default 'scheduled',
  home_score integer check (home_score is null or home_score >= 0),
  away_score integer check (away_score is null or away_score >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint finished_matches_need_score check (
    status = 'scheduled' or (home_score is not null and away_score is not null)
  )
);

create table public.predictions (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references public.participants(id) on delete cascade,
  match_id uuid not null references public.matches(id) on delete cascade,
  home_score integer not null check (home_score >= 0),
  away_score integer not null check (away_score >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (participant_id, match_id)
);

create index predictions_participant_idx on public.predictions(participant_id);
create index predictions_match_idx on public.predictions(match_id);
create index matches_kickoff_idx on public.matches(kickoff_at);

create or replace view public.ranking
as
select
  p.id as participant_id,
  p.name as participant_name,
  coalesce(sum(
    case
      when m.status <> 'finished' then 0
      when pr.home_score = m.home_score and pr.away_score = m.away_score then 5
      when sign(pr.home_score - pr.away_score) = sign(m.home_score - m.away_score) then 3
      else 0
    end
  ), 0)::integer as total_points,
  coalesce(sum(
    case
      when m.status = 'finished' and pr.home_score = m.home_score and pr.away_score = m.away_score then 1
      else 0
    end
  ), 0)::integer as exact_scores,
  coalesce(sum(
    case
      when m.status = 'finished'
        and not (pr.home_score = m.home_score and pr.away_score = m.away_score)
        and sign(pr.home_score - pr.away_score) = sign(m.home_score - m.away_score)
      then 1
      else 0
    end
  ), 0)::integer as correct_outcomes,
  count(pr.id)::integer as predictions_count
from public.participants p
left join public.predictions pr on pr.participant_id = p.id
left join public.matches m on m.id = pr.match_id
group by p.id, p.name
order by total_points desc, exact_scores desc, p.name asc;

alter table public.participants enable row level security;
alter table public.matches enable row level security;
alter table public.predictions enable row level security;

create policy "Public can read participants" on public.participants
  for select using (false);

create policy "Public can read matches" on public.matches
  for select using (true);

create policy "Public can read predictions" on public.predictions
  for select using (true);

create policy "Public can insert predictions" on public.predictions
  for insert with check (true);

create policy "Public can update predictions" on public.predictions
  for update using (true) with check (true);

grant usage on schema public to anon, authenticated;
grant select on public.matches to anon, authenticated;
grant select, insert, update on public.predictions to anon, authenticated;
grant select on public.ranking to anon, authenticated;

-- Seed MVP baseado na estrutura oficial da FIFA para a Copa do Mundo 2026:
-- 104 jogos, abertura em 2026-06-11 e final em 2026-07-19.
-- Os confrontos de mata-mata usam placeholders porque dependem da classificacao.
with venues as (
  select array[
    'Mexico City Stadium',
    'Estadio Guadalajara',
    'Toronto Stadium',
    'Los Angeles Stadium',
    'Boston Stadium',
    'Vancouver Stadium',
    'New York New Jersey Stadium',
    'San Francisco Bay Area Stadium',
    'Philadelphia Stadium',
    'Houston Stadium',
    'Dallas Stadium',
    'Estadio Monterrey',
    'Miami Stadium',
    'Atlanta Stadium',
    'Seattle Stadium',
    'Kansas City Stadium'
  ] as names
),
numbers as (
  select generate_series(1, 104) as n
),
seed as (
  select
    n as match_number,
    case
      when n <= 72 then 'Fase de grupos'
      when n <= 88 then '16 avos'
      when n <= 96 then 'Oitavas'
      when n <= 100 then 'Quartas'
      when n <= 102 then 'Semifinal'
      when n = 103 then 'Disputa de terceiro lugar'
      else 'Final'
    end as stage,
    case when n <= 72 then chr(65 + ((n - 1) / 6)::integer) else null end as group_name,
    case
      when n <= 72 then ('2026-06-11 21:00+00'::timestamptz + (((n - 1) / 4)::integer || ' days')::interval)
      when n <= 88 then ('2026-06-28 21:00+00'::timestamptz + (((n - 73) / 3)::integer || ' days')::interval)
      when n <= 96 then ('2026-07-04 21:00+00'::timestamptz + (((n - 89) / 2)::integer || ' days')::interval)
      when n <= 100 then ('2026-07-09 21:00+00'::timestamptz + (((n - 97) / 2)::integer || ' days')::interval)
      when n <= 102 then ('2026-07-14 21:00+00'::timestamptz + ((n - 101) || ' days')::interval)
      when n = 103 then '2026-07-18 21:00+00'::timestamptz
      else '2026-07-19 21:00+00'::timestamptz
    end as kickoff_at,
    case
      when n = 1 then 'Mexico'
      when n = 2 then 'Korea Republic'
      when n <= 72 then 'Grupo ' || chr(65 + ((n - 1) / 6)::integer) || ' - Time ' || ((((n - 1) % 6) % 4) + 1)
      when n <= 88 then 'Classificado ' || (n - 72) || 'A'
      when n <= 96 then 'Vencedor 16 avos ' || ((n - 88) * 2 - 1)
      when n <= 100 then 'Vencedor oitavas ' || ((n - 96) * 2 - 1)
      when n <= 102 then 'Vencedor quartas ' || ((n - 100) * 2 - 1)
      when n = 103 then 'Perdedor semifinal 1'
      else 'Vencedor semifinal 1'
    end as home_team,
    case
      when n = 1 then 'South Africa'
      when n = 2 then 'Czechia'
      when n <= 72 then 'Grupo ' || chr(65 + ((n - 1) / 6)::integer) || ' - Time ' || ((((n - 1) % 6 + 1) % 4) + 1)
      when n <= 88 then 'Classificado ' || (n - 72) || 'B'
      when n <= 96 then 'Vencedor 16 avos ' || ((n - 88) * 2)
      when n <= 100 then 'Vencedor oitavas ' || ((n - 96) * 2)
      when n <= 102 then 'Vencedor quartas ' || ((n - 100) * 2)
      when n = 103 then 'Perdedor semifinal 2'
      else 'Vencedor semifinal 2'
    end as away_team,
    (select names[((n - 1) % 16) + 1] from venues) as stadium
  from numbers
)
insert into public.matches (
  match_number,
  stage,
  group_name,
  kickoff_at,
  home_team,
  away_team,
  stadium
)
select
  match_number,
  stage,
  group_name,
  kickoff_at,
  home_team,
  away_team,
  stadium
from seed
order by match_number;

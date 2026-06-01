-- Migration incremental: pontos de 1º/2º por grupo e nova pontuacao do mata-mata.
-- Rode depois de supabase/2026-rules-and-copa-json.sql.

create table if not exists public.group_position_predictions (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references public.participants(id) on delete cascade,
  group_name text not null,
  position integer not null check (position in (1, 2)),
  team_name text not null references public.teams(name) on delete cascade,
  created_at timestamptz not null default now(),
  unique (participant_id, group_name, position),
  unique (participant_id, group_name, team_name)
);

create table if not exists public.group_position_actuals (
  id uuid primary key default gen_random_uuid(),
  group_name text not null,
  position integer not null check (position in (1, 2)),
  team_name text not null references public.teams(name) on delete cascade,
  created_at timestamptz not null default now(),
  unique (group_name, position),
  unique (group_name, team_name)
);

alter table public.group_position_predictions enable row level security;
alter table public.group_position_actuals enable row level security;

drop policy if exists "Public can read group position predictions" on public.group_position_predictions;
drop policy if exists "Public can insert group position predictions before lock" on public.group_position_predictions;
drop policy if exists "Public can update group position predictions before lock" on public.group_position_predictions;
drop policy if exists "Public can delete group position predictions before lock" on public.group_position_predictions;
drop policy if exists "Public can read group position actuals" on public.group_position_actuals;

create policy "Public can read group position predictions" on public.group_position_predictions
  for select using (true);

create policy "Public can insert group position predictions before lock" on public.group_position_predictions
  for insert with check (public.predictions_are_open());

create policy "Public can update group position predictions before lock" on public.group_position_predictions
  for update using (public.predictions_are_open()) with check (public.predictions_are_open());

create policy "Public can delete group position predictions before lock" on public.group_position_predictions
  for delete using (public.predictions_are_open());

create policy "Public can read group position actuals" on public.group_position_actuals
  for select using (true);

grant select, insert, update, delete on public.group_position_predictions to anon, authenticated;
grant select on public.group_position_actuals to anon, authenticated;

drop view if exists public.ranking;

create or replace view public.ranking
as
with match_scores as (
  select
    pr.participant_id,
    sum(
      case
        when m.status <> 'finished' or m.stage <> 'Fase de grupos' then 0
        when pr.home_score = m.home_score and pr.away_score = m.away_score then 5
        when sign(pr.home_score - pr.away_score) = sign(m.home_score - m.away_score)
          and (
            (pr.home_score - pr.away_score) = (m.home_score - m.away_score)
            or (m.home_score > m.away_score and pr.home_score = m.home_score)
            or (m.away_score > m.home_score and pr.away_score = m.away_score)
          )
        then 3
        when sign(pr.home_score - pr.away_score) = sign(m.home_score - m.away_score) then 2
        else 0
      end
    )::integer as match_points,
    sum(case when m.status = 'finished' and pr.home_score = m.home_score and pr.away_score = m.away_score then 1 else 0 end)::integer as exact_scores,
    sum(case
      when m.status = 'finished'
        and not (pr.home_score = m.home_score and pr.away_score = m.away_score)
        and sign(pr.home_score - pr.away_score) = sign(m.home_score - m.away_score)
        and (
          (pr.home_score - pr.away_score) = (m.home_score - m.away_score)
          or (m.home_score > m.away_score and pr.home_score = m.home_score)
          or (m.away_score > m.home_score and pr.away_score = m.away_score)
        )
      then 1 else 0 end)::integer as detail_scores,
    sum(case
      when m.status = 'finished'
        and sign(pr.home_score - pr.away_score) = sign(m.home_score - m.away_score)
        and not (pr.home_score = m.home_score and pr.away_score = m.away_score)
        and not (
          (pr.home_score - pr.away_score) = (m.home_score - m.away_score)
          or (m.home_score > m.away_score and pr.home_score = m.home_score)
          or (m.away_score > m.home_score and pr.away_score = m.away_score)
        )
      then 1 else 0 end)::integer as outcome_scores,
    count(pr.id)::integer as predictions_count
  from public.predictions pr
  join public.matches m on m.id = pr.match_id
  group by pr.participant_id
),
group_position_scores as (
  select
    gp.participant_id,
    sum(
      case
        when ga_same.id is not null then 5
        when ga_other.id is not null then 2
        else 0
      end
    )::integer as group_position_points,
    sum(case when ga_same.id is not null or ga_other.id is not null then 1 else 0 end)::integer as group_position_hits
  from public.group_position_predictions gp
  left join public.group_position_actuals ga_same
    on ga_same.group_name = gp.group_name
    and ga_same.position = gp.position
    and ga_same.team_name = gp.team_name
  left join public.group_position_actuals ga_other
    on ga_other.group_name = gp.group_name
    and ga_other.position <> gp.position
    and ga_other.team_name = gp.team_name
  group by gp.participant_id
),
knockout_scores as (
  select
    kp.participant_id,
    sum(case kp.stage
      when 'round_of_16' then 6
      when 'quarter_finals' then 10
      when 'semi_finals' then 15
      when 'finalists' then 20
      when 'champion' then 35
      else 0
    end)::integer as knockout_points,
    count(*) filter (where kp.stage <> 'round_of_32')::integer as knockout_hits
  from public.knockout_predictions kp
  join public.knockout_actuals ka on ka.stage = kp.stage and ka.team_name = kp.team_name
  group by kp.participant_id
)
select
  p.id as participant_id,
  p.name as participant_name,
  (
    coalesce(ms.match_points, 0)
    + coalesce(gps.group_position_points, 0)
    + coalesce(ks.knockout_points, 0)
  )::integer as total_points,
  (coalesce(ms.match_points, 0) + coalesce(gps.group_position_points, 0))::integer as group_points,
  coalesce(gps.group_position_points, 0)::integer as group_position_points,
  coalesce(ks.knockout_points, 0)::integer as knockout_points,
  coalesce(ms.exact_scores, 0)::integer as exact_scores,
  coalesce(ms.detail_scores, 0)::integer as detail_scores,
  coalesce(ms.outcome_scores, 0)::integer as outcome_scores,
  coalesce(gps.group_position_hits, 0)::integer as group_position_hits,
  coalesce(ks.knockout_hits, 0)::integer as knockout_hits,
  coalesce(ms.predictions_count, 0)::integer as predictions_count
from public.participants p
left join match_scores ms on ms.participant_id = p.id
left join group_position_scores gps on gps.participant_id = p.id
left join knockout_scores ks on ks.participant_id = p.id
order by total_points desc, knockout_points desc, group_points desc, exact_scores desc, p.name asc;

grant select on public.ranking to anon, authenticated;

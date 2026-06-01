-- Migration incremental: regras novas, lock antes da Copa e dados do copa.json.
-- Rode depois das migrations anteriores. Participantes e PINs sao preservados.

create extension if not exists pgcrypto;

alter table public.matches add column if not exists source_round text;

create table if not exists public.settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.teams (
  name text primary key
);

create table if not exists public.knockout_predictions (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references public.participants(id) on delete cascade,
  stage text not null check (stage in ('round_of_32', 'round_of_16', 'quarter_finals', 'semi_finals', 'finalists', 'champion')),
  team_name text not null references public.teams(name) on delete cascade,
  created_at timestamptz not null default now(),
  unique (participant_id, stage, team_name)
);

create table if not exists public.knockout_actuals (
  id uuid primary key default gen_random_uuid(),
  stage text not null check (stage in ('round_of_32', 'round_of_16', 'quarter_finals', 'semi_finals', 'finalists', 'champion')),
  team_name text not null references public.teams(name) on delete cascade,
  created_at timestamptz not null default now(),
  unique (stage, team_name)
);

insert into public.settings (key, value, updated_at)
values ('predictions_lock_at', '2026-06-11T19:00:00.000Z', now())
on conflict (key) do update set value = excluded.value, updated_at = now();

insert into public.teams (name)
select name
from (values
('Algeria'),('Argentina'),('Australia'),('Austria'),('Belgium'),('Bosnia & Herzegovina'),
('Brazil'),('Canada'),('Cape Verde'),('Colombia'),('Croatia'),('Curaçao'),
('Czech Republic'),('DR Congo'),('Ecuador'),('Egypt'),('England'),('France'),
('Germany'),('Ghana'),('Haiti'),('Iran'),('Iraq'),('Ivory Coast'),('Japan'),
('Jordan'),('Mexico'),('Morocco'),('Netherlands'),('New Zealand'),('Norway'),
('Panama'),('Paraguay'),('Portugal'),('Qatar'),('Saudi Arabia'),('Scotland'),
('Senegal'),('South Africa'),('South Korea'),('Spain'),('Sweden'),('Switzerland'),
('Tunisia'),('Turkey'),('USA'),('Uruguay'),('Uzbekistan')
) as seed(name)
on conflict (name) do nothing;

insert into public.matches (
  match_number, stage, group_name, kickoff_at, home_team, away_team, stadium, source_round
)
select *
from (values
(1,'Fase de grupos','A','2026-06-11T19:00:00.000Z'::timestamptz,'Mexico','South Africa','Mexico City','Matchday 1'),
(2,'Fase de grupos','A','2026-06-12T02:00:00.000Z'::timestamptz,'South Korea','Czech Republic','Guadalajara (Zapopan)','Matchday 1'),
(3,'Fase de grupos','A','2026-06-18T16:00:00.000Z'::timestamptz,'Czech Republic','South Africa','Atlanta','Matchday 8'),
(4,'Fase de grupos','A','2026-06-19T01:00:00.000Z'::timestamptz,'Mexico','South Korea','Guadalajara (Zapopan)','Matchday 8'),
(5,'Fase de grupos','A','2026-06-25T01:00:00.000Z'::timestamptz,'Czech Republic','Mexico','Mexico City','Matchday 14'),
(6,'Fase de grupos','A','2026-06-25T01:00:00.000Z'::timestamptz,'South Africa','South Korea','Monterrey (Guadalupe)','Matchday 14'),
(7,'Fase de grupos','B','2026-06-12T19:00:00.000Z'::timestamptz,'Canada','Bosnia & Herzegovina','Toronto','Matchday 2'),
(8,'Fase de grupos','B','2026-06-13T19:00:00.000Z'::timestamptz,'Qatar','Switzerland','San Francisco Bay Area (Santa Clara)','Matchday 3'),
(9,'Fase de grupos','B','2026-06-18T19:00:00.000Z'::timestamptz,'Switzerland','Bosnia & Herzegovina','Los Angeles (Inglewood)','Matchday 8'),
(10,'Fase de grupos','B','2026-06-18T22:00:00.000Z'::timestamptz,'Canada','Qatar','Vancouver','Matchday 8'),
(11,'Fase de grupos','B','2026-06-24T19:00:00.000Z'::timestamptz,'Switzerland','Canada','Vancouver','Matchday 14'),
(12,'Fase de grupos','B','2026-06-24T19:00:00.000Z'::timestamptz,'Bosnia & Herzegovina','Qatar','Seattle','Matchday 14'),
(13,'Fase de grupos','C','2026-06-13T22:00:00.000Z'::timestamptz,'Brazil','Morocco','New York/New Jersey (East Rutherford)','Matchday 3'),
(14,'Fase de grupos','C','2026-06-14T01:00:00.000Z'::timestamptz,'Haiti','Scotland','Boston (Foxborough)','Matchday 3'),
(15,'Fase de grupos','C','2026-06-19T22:00:00.000Z'::timestamptz,'Scotland','Morocco','Boston (Foxborough)','Matchday 9'),
(16,'Fase de grupos','C','2026-06-20T00:30:00.000Z'::timestamptz,'Brazil','Haiti','Philadelphia','Matchday 9'),
(17,'Fase de grupos','C','2026-06-24T22:00:00.000Z'::timestamptz,'Scotland','Brazil','Miami (Miami Gardens)','Matchday 14'),
(18,'Fase de grupos','C','2026-06-24T22:00:00.000Z'::timestamptz,'Morocco','Haiti','Atlanta','Matchday 14'),
(19,'Fase de grupos','D','2026-06-13T01:00:00.000Z'::timestamptz,'USA','Paraguay','Los Angeles (Inglewood)','Matchday 2'),
(20,'Fase de grupos','D','2026-06-14T04:00:00.000Z'::timestamptz,'Australia','Turkey','Vancouver','Matchday 3'),
(21,'Fase de grupos','D','2026-06-19T19:00:00.000Z'::timestamptz,'USA','Australia','Seattle','Matchday 9'),
(22,'Fase de grupos','D','2026-06-20T03:00:00.000Z'::timestamptz,'Turkey','Paraguay','San Francisco Bay Area (Santa Clara)','Matchday 9'),
(23,'Fase de grupos','D','2026-06-26T02:00:00.000Z'::timestamptz,'Turkey','USA','Los Angeles (Inglewood)','Matchday 15'),
(24,'Fase de grupos','D','2026-06-26T02:00:00.000Z'::timestamptz,'Paraguay','Australia','San Francisco Bay Area (Santa Clara)','Matchday 15'),
(25,'Fase de grupos','E','2026-06-14T17:00:00.000Z'::timestamptz,'Germany','Curaçao','Houston','Matchday 4'),
(26,'Fase de grupos','E','2026-06-14T23:00:00.000Z'::timestamptz,'Ivory Coast','Ecuador','Philadelphia','Matchday 4'),
(27,'Fase de grupos','E','2026-06-20T20:00:00.000Z'::timestamptz,'Germany','Ivory Coast','Toronto','Matchday 10'),
(28,'Fase de grupos','E','2026-06-21T00:00:00.000Z'::timestamptz,'Ecuador','Curaçao','Kansas City','Matchday 10'),
(29,'Fase de grupos','E','2026-06-25T20:00:00.000Z'::timestamptz,'Curaçao','Ivory Coast','Philadelphia','Matchday 15'),
(30,'Fase de grupos','E','2026-06-25T20:00:00.000Z'::timestamptz,'Ecuador','Germany','New York/New Jersey (East Rutherford)','Matchday 15'),
(31,'Fase de grupos','F','2026-06-14T20:00:00.000Z'::timestamptz,'Netherlands','Japan','Dallas (Arlington)','Matchday 4'),
(32,'Fase de grupos','F','2026-06-15T02:00:00.000Z'::timestamptz,'Sweden','Tunisia','Monterrey (Guadalupe)','Matchday 4'),
(33,'Fase de grupos','F','2026-06-20T17:00:00.000Z'::timestamptz,'Netherlands','Sweden','Houston','Matchday 10'),
(34,'Fase de grupos','F','2026-06-21T04:00:00.000Z'::timestamptz,'Tunisia','Japan','Monterrey (Guadalupe)','Matchday 10'),
(35,'Fase de grupos','F','2026-06-25T23:00:00.000Z'::timestamptz,'Japan','Sweden','Dallas (Arlington)','Matchday 15'),
(36,'Fase de grupos','F','2026-06-25T23:00:00.000Z'::timestamptz,'Tunisia','Netherlands','Kansas City','Matchday 15'),
(37,'Fase de grupos','G','2026-06-15T19:00:00.000Z'::timestamptz,'Belgium','Egypt','Seattle','Matchday 5'),
(38,'Fase de grupos','G','2026-06-16T01:00:00.000Z'::timestamptz,'Iran','New Zealand','Los Angeles (Inglewood)','Matchday 5'),
(39,'Fase de grupos','G','2026-06-21T19:00:00.000Z'::timestamptz,'Belgium','Iran','Los Angeles (Inglewood)','Matchday 11'),
(40,'Fase de grupos','G','2026-06-22T01:00:00.000Z'::timestamptz,'New Zealand','Egypt','Vancouver','Matchday 11'),
(41,'Fase de grupos','G','2026-06-27T03:00:00.000Z'::timestamptz,'Egypt','Iran','Seattle','Matchday 16'),
(42,'Fase de grupos','G','2026-06-27T03:00:00.000Z'::timestamptz,'New Zealand','Belgium','Vancouver','Matchday 16'),
(43,'Fase de grupos','H','2026-06-15T16:00:00.000Z'::timestamptz,'Spain','Cape Verde','Atlanta','Matchday 5'),
(44,'Fase de grupos','H','2026-06-15T22:00:00.000Z'::timestamptz,'Saudi Arabia','Uruguay','Miami (Miami Gardens)','Matchday 5'),
(45,'Fase de grupos','H','2026-06-21T16:00:00.000Z'::timestamptz,'Spain','Saudi Arabia','Atlanta','Matchday 11'),
(46,'Fase de grupos','H','2026-06-21T22:00:00.000Z'::timestamptz,'Uruguay','Cape Verde','Miami (Miami Gardens)','Matchday 11'),
(47,'Fase de grupos','H','2026-06-27T00:00:00.000Z'::timestamptz,'Cape Verde','Saudi Arabia','Houston','Matchday 16'),
(48,'Fase de grupos','H','2026-06-27T00:00:00.000Z'::timestamptz,'Uruguay','Spain','Guadalajara (Zapopan)','Matchday 16'),
(49,'Fase de grupos','I','2026-06-16T19:00:00.000Z'::timestamptz,'France','Senegal','New York/New Jersey (East Rutherford)','Matchday 6'),
(50,'Fase de grupos','I','2026-06-16T22:00:00.000Z'::timestamptz,'Iraq','Norway','Boston (Foxborough)','Matchday 6'),
(51,'Fase de grupos','I','2026-06-22T21:00:00.000Z'::timestamptz,'France','Iraq','Philadelphia','Matchday 12'),
(52,'Fase de grupos','I','2026-06-23T00:00:00.000Z'::timestamptz,'Norway','Senegal','New York/New Jersey (East Rutherford)','Matchday 12'),
(53,'Fase de grupos','I','2026-06-26T19:00:00.000Z'::timestamptz,'Norway','France','Boston (Foxborough)','Matchday 16'),
(54,'Fase de grupos','I','2026-06-26T19:00:00.000Z'::timestamptz,'Senegal','Iraq','Toronto','Matchday 16'),
(55,'Fase de grupos','J','2026-06-17T01:00:00.000Z'::timestamptz,'Argentina','Algeria','Kansas City','Matchday 6'),
(56,'Fase de grupos','J','2026-06-17T04:00:00.000Z'::timestamptz,'Austria','Jordan','San Francisco Bay Area (Santa Clara)','Matchday 6'),
(57,'Fase de grupos','J','2026-06-22T17:00:00.000Z'::timestamptz,'Argentina','Austria','Dallas (Arlington)','Matchday 12'),
(58,'Fase de grupos','J','2026-06-23T03:00:00.000Z'::timestamptz,'Jordan','Algeria','San Francisco Bay Area (Santa Clara)','Matchday 12'),
(59,'Fase de grupos','J','2026-06-28T02:00:00.000Z'::timestamptz,'Algeria','Austria','Kansas City','Matchday 17'),
(60,'Fase de grupos','J','2026-06-28T02:00:00.000Z'::timestamptz,'Jordan','Argentina','Dallas (Arlington)','Matchday 17'),
(61,'Fase de grupos','K','2026-06-17T17:00:00.000Z'::timestamptz,'Portugal','DR Congo','Houston','Matchday 7'),
(62,'Fase de grupos','K','2026-06-18T02:00:00.000Z'::timestamptz,'Uzbekistan','Colombia','Mexico City','Matchday 7'),
(63,'Fase de grupos','K','2026-06-23T17:00:00.000Z'::timestamptz,'Portugal','Uzbekistan','Houston','Matchday 13'),
(64,'Fase de grupos','K','2026-06-24T02:00:00.000Z'::timestamptz,'Colombia','DR Congo','Guadalajara (Zapopan)','Matchday 13'),
(65,'Fase de grupos','K','2026-06-27T23:30:00.000Z'::timestamptz,'Colombia','Portugal','Miami (Miami Gardens)','Matchday 17'),
(66,'Fase de grupos','K','2026-06-27T23:30:00.000Z'::timestamptz,'DR Congo','Uzbekistan','Atlanta','Matchday 17'),
(67,'Fase de grupos','L','2026-06-17T20:00:00.000Z'::timestamptz,'England','Croatia','Dallas (Arlington)','Matchday 7'),
(68,'Fase de grupos','L','2026-06-17T23:00:00.000Z'::timestamptz,'Ghana','Panama','Toronto','Matchday 7'),
(69,'Fase de grupos','L','2026-06-23T20:00:00.000Z'::timestamptz,'England','Ghana','Boston (Foxborough)','Matchday 13'),
(70,'Fase de grupos','L','2026-06-23T23:00:00.000Z'::timestamptz,'Panama','Croatia','Toronto','Matchday 13'),
(71,'Fase de grupos','L','2026-06-27T21:00:00.000Z'::timestamptz,'Panama','England','New York/New Jersey (East Rutherford)','Matchday 17'),
(72,'Fase de grupos','L','2026-06-27T21:00:00.000Z'::timestamptz,'Croatia','Ghana','Philadelphia','Matchday 17'),
(73,'16 avos',null,'2026-06-28T19:00:00.000Z'::timestamptz,'2A','2B','Los Angeles (Inglewood)','Round of 32'),
(74,'16 avos',null,'2026-06-29T20:30:00.000Z'::timestamptz,'1E','3A/B/C/D/F','Boston (Foxborough)','Round of 32'),
(75,'16 avos',null,'2026-06-30T01:00:00.000Z'::timestamptz,'1F','2C','Monterrey (Guadalupe)','Round of 32'),
(76,'16 avos',null,'2026-06-29T17:00:00.000Z'::timestamptz,'1C','2F','Houston','Round of 32'),
(77,'16 avos',null,'2026-06-30T21:00:00.000Z'::timestamptz,'1I','3C/D/F/G/H','New York/New Jersey (East Rutherford)','Round of 32'),
(78,'16 avos',null,'2026-06-30T17:00:00.000Z'::timestamptz,'2E','2I','Dallas (Arlington)','Round of 32'),
(79,'16 avos',null,'2026-07-01T01:00:00.000Z'::timestamptz,'1A','3C/E/F/H/I','Mexico City','Round of 32'),
(80,'16 avos',null,'2026-07-01T16:00:00.000Z'::timestamptz,'1L','3E/H/I/J/K','Atlanta','Round of 32'),
(81,'16 avos',null,'2026-07-02T00:00:00.000Z'::timestamptz,'1D','3B/E/F/I/J','San Francisco Bay Area (Santa Clara)','Round of 32'),
(82,'16 avos',null,'2026-07-01T20:00:00.000Z'::timestamptz,'1G','3A/E/H/I/J','Seattle','Round of 32'),
(83,'16 avos',null,'2026-07-02T23:00:00.000Z'::timestamptz,'2K','2L','Toronto','Round of 32'),
(84,'16 avos',null,'2026-07-02T19:00:00.000Z'::timestamptz,'1H','2J','Los Angeles (Inglewood)','Round of 32'),
(85,'16 avos',null,'2026-07-03T03:00:00.000Z'::timestamptz,'1B','3E/F/G/I/J','Vancouver','Round of 32'),
(86,'16 avos',null,'2026-07-03T22:00:00.000Z'::timestamptz,'1J','2H','Miami (Miami Gardens)','Round of 32'),
(87,'16 avos',null,'2026-07-04T01:30:00.000Z'::timestamptz,'1K','3D/E/I/J/L','Kansas City','Round of 32'),
(88,'16 avos',null,'2026-07-03T18:00:00.000Z'::timestamptz,'2D','2G','Dallas (Arlington)','Round of 32'),
(89,'Oitavas',null,'2026-07-04T21:00:00.000Z'::timestamptz,'W74','W77','Philadelphia','Round of 16'),
(90,'Oitavas',null,'2026-07-04T17:00:00.000Z'::timestamptz,'W73','W75','Houston','Round of 16'),
(91,'Oitavas',null,'2026-07-05T20:00:00.000Z'::timestamptz,'W76','W78','New York/New Jersey (East Rutherford)','Round of 16'),
(92,'Oitavas',null,'2026-07-06T00:00:00.000Z'::timestamptz,'W79','W80','Mexico City','Round of 16'),
(93,'Oitavas',null,'2026-07-06T19:00:00.000Z'::timestamptz,'W83','W84','Dallas (Arlington)','Round of 16'),
(94,'Oitavas',null,'2026-07-07T00:00:00.000Z'::timestamptz,'W81','W82','Seattle','Round of 16'),
(95,'Oitavas',null,'2026-07-07T16:00:00.000Z'::timestamptz,'W86','W88','Atlanta','Round of 16'),
(96,'Oitavas',null,'2026-07-07T20:00:00.000Z'::timestamptz,'W85','W87','Vancouver','Round of 16'),
(97,'Quartas',null,'2026-07-09T20:00:00.000Z'::timestamptz,'W89','W90','Boston (Foxborough)','Quarter-final'),
(98,'Quartas',null,'2026-07-10T19:00:00.000Z'::timestamptz,'W93','W94','Los Angeles (Inglewood)','Quarter-final'),
(99,'Quartas',null,'2026-07-11T21:00:00.000Z'::timestamptz,'W91','W92','Miami (Miami Gardens)','Quarter-final'),
(100,'Quartas',null,'2026-07-12T01:00:00.000Z'::timestamptz,'W95','W96','Kansas City','Quarter-final'),
(101,'Semifinal',null,'2026-07-14T19:00:00.000Z'::timestamptz,'W97','W98','Dallas (Arlington)','Semi-final'),
(102,'Semifinal',null,'2026-07-15T19:00:00.000Z'::timestamptz,'W99','W100','Atlanta','Semi-final'),
(103,'Terceiro lugar',null,'2026-07-18T21:00:00.000Z'::timestamptz,'L101','L102','Miami (Miami Gardens)','Match for third place'),
(104,'Final',null,'2026-07-19T19:00:00.000Z'::timestamptz,'W101','W102','New York/New Jersey (East Rutherford)','Final')
) as seed(match_number, stage, group_name, kickoff_at, home_team, away_team, stadium, source_round)
on conflict (match_number) do update set
  stage = excluded.stage,
  group_name = excluded.group_name,
  kickoff_at = excluded.kickoff_at,
  home_team = excluded.home_team,
  away_team = excluded.away_team,
  stadium = excluded.stadium,
  source_round = excluded.source_round,
  updated_at = now();

create or replace function public.predictions_are_open()
returns boolean
language sql
stable
as $$
  select now() < coalesce(
    (select value::timestamptz from public.settings where key = 'predictions_lock_at'),
    '2026-06-11T19:00:00.000Z'::timestamptz
  );
$$;

drop view if exists public.ranking;

create or replace view public.ranking
as
with group_scores as (
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
    )::integer as group_points,
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
        and not (
          pr.home_score = m.home_score and pr.away_score = m.away_score
        )
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
knockout_scores as (
  select
    kp.participant_id,
    sum(case kp.stage
      when 'round_of_32' then 5
      when 'round_of_16' then 7
      when 'quarter_finals' then 9
      when 'semi_finals' then 12
      when 'finalists' then 16
      when 'champion' then 25
      else 0
    end)::integer as knockout_points,
    count(*)::integer as knockout_hits
  from public.knockout_predictions kp
  join public.knockout_actuals ka on ka.stage = kp.stage and ka.team_name = kp.team_name
  group by kp.participant_id
)
select
  p.id as participant_id,
  p.name as participant_name,
  (coalesce(gs.group_points, 0) + coalesce(ks.knockout_points, 0))::integer as total_points,
  coalesce(gs.group_points, 0)::integer as group_points,
  coalesce(ks.knockout_points, 0)::integer as knockout_points,
  coalesce(gs.exact_scores, 0)::integer as exact_scores,
  coalesce(gs.detail_scores, 0)::integer as detail_scores,
  coalesce(gs.outcome_scores, 0)::integer as outcome_scores,
  coalesce(ks.knockout_hits, 0)::integer as knockout_hits,
  coalesce(gs.predictions_count, 0)::integer as predictions_count
from public.participants p
left join group_scores gs on gs.participant_id = p.id
left join knockout_scores ks on ks.participant_id = p.id
order by total_points desc, knockout_points desc, group_points desc, exact_scores desc, p.name asc;

alter table public.settings enable row level security;
alter table public.teams enable row level security;
alter table public.knockout_predictions enable row level security;
alter table public.knockout_actuals enable row level security;

drop policy if exists "Public can read settings" on public.settings;
drop policy if exists "Public can read teams" on public.teams;
drop policy if exists "Public can read knockout predictions" on public.knockout_predictions;
drop policy if exists "Public can insert knockout predictions before lock" on public.knockout_predictions;
drop policy if exists "Public can update knockout predictions before lock" on public.knockout_predictions;
drop policy if exists "Public can delete knockout predictions before lock" on public.knockout_predictions;
drop policy if exists "Public can read knockout actuals" on public.knockout_actuals;
drop policy if exists "Public can insert predictions" on public.predictions;
drop policy if exists "Public can update predictions" on public.predictions;

create policy "Public can read settings" on public.settings for select using (true);
create policy "Public can read teams" on public.teams for select using (true);
create policy "Public can read knockout predictions" on public.knockout_predictions for select using (true);
create policy "Public can insert knockout predictions before lock" on public.knockout_predictions
  for insert with check (public.predictions_are_open());
create policy "Public can update knockout predictions before lock" on public.knockout_predictions
  for update using (public.predictions_are_open()) with check (public.predictions_are_open());
create policy "Public can delete knockout predictions before lock" on public.knockout_predictions
  for delete using (public.predictions_are_open());
create policy "Public can read knockout actuals" on public.knockout_actuals for select using (true);
create policy "Public can insert predictions before lock" on public.predictions
  for insert with check (public.predictions_are_open());
create policy "Public can update predictions before lock" on public.predictions
  for update using (public.predictions_are_open()) with check (public.predictions_are_open());

grant select on public.settings to anon, authenticated;
grant select on public.teams to anon, authenticated;
grant select, insert, update, delete on public.knockout_predictions to anon, authenticated;
grant select on public.knockout_actuals to anon, authenticated;
grant select on public.ranking to anon, authenticated;

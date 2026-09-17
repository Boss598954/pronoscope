-- ============================================================================
-- PRONOSCOPE — Schéma de base de données (PostgreSQL / Supabase)
-- ============================================================================
-- Ce script est à copier-coller ENTIÈREMENT dans l'éditeur SQL de Supabase
-- (Tableau de bord > SQL Editor > New query > coller > Run).
-- Il est idempotent : on peut l'exécuter plusieurs fois sans casser rien.
--
-- Tables créées :
--   matches          : tous les matchs (football, basket, tennis) + résultats
--   team_stats       : statistiques agrégées par équipe (forme, buts/points…)
--   player_stats     : statistiques agrégées par joueur de tennis
--   analyses_cache   : cache des analyses calculées (jamais recalculées)
--   device_analyses  : lien anonyme appareil <-> analyse (purge 48 h)
--   reliability      : suivi honnête pronostic vs résultat réel
--   app_stats        : compteurs et classements globaux (tableau de bord)
-- ============================================================================

-- Extension de chiffrement pour générer des identifiants uniques (UUID)
create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- TABLE : matches — le calendrier et les résultats
-- ----------------------------------------------------------------------------
create table if not exists public.matches (
  id               text primary key,          -- identifiant stable et déterministe (ex: fb:en.1:2026-08-16:arsenal-chelsea)
  sport            text not null,             -- 'football' | 'basketball' | 'tennis'
  competition      text not null,             -- code compétition (ex: en.1, nba, atp, wta)
  competition_name text,                      -- nom lisible (ex: Premier League, NBA, ATP Tour)
  season           text,                      -- saison (ex: 2026-27) ou année
  match_date       timestamptz not null,      -- date et heure du match (UTC)
  home_team        text not null,             -- équipe / joueuse à domicile (ou joueur 1 au tennis)
  away_team        text not null,             -- équipe / joueuse à l'extérieur (ou joueur 2)
  home_score       integer,                   -- score final domicile (null si pas joué)
  away_score       integer,                   -- score final extérieur
  status           text not null default 'scheduled', -- scheduled | live | finished | cancelled
  label            text,                      -- étiquette auto : Derby, Choc du haut de tableau, Lutte pour le maintien, Enjeu européen, Sans enjeu apparent…
  meta             jsonb default '{}'::jsonb, -- métadonnées sources (round, trigrammes, tournoi, source…)
  updated_at       timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- TABLE : team_stats — agrégats par équipe (football et basketball)
-- ----------------------------------------------------------------------------
create table if not exists public.team_stats (
  sport       text not null,
  competition text not null,
  team        text not null,
  meta        jsonb default '{}'::jsonb,   -- forme récente, buts/points marqués-encaissés, domicile/extérieur, écarts-type…
  updated_at  timestamptz not null default now(),
  primary key (sport, competition, team)
);

-- ----------------------------------------------------------------------------
-- TABLE : player_stats — agrégats par joueuse de tennis
-- ----------------------------------------------------------------------------
create table if not exists public.player_stats (
  tour          text not null,             -- 'atp' | 'wta'
  player        text not null,             -- nom complet (ex: Carlos Alcaraz)
  matches_count integer not null default 0,
  meta          jsonb default '{}'::jsonb, -- % service, % retour, forme, face-à-face, classement, surfaces…
  updated_at    timestamptz not null default now(),
  primary key (tour, player)
);

-- ----------------------------------------------------------------------------
-- TABLE : analyses_cache — le cache des analyses (cœur de l'application)
-- Une analyse déjà calculée est réaffichée À L'IDENTIQUE, jamais recalculée.
-- ----------------------------------------------------------------------------
create table if not exists public.analyses_cache (
  cache_key      text primary key,         -- clé déterministe (modèle + match ou paire d'équipes)
  sport          text not null,
  subject        text not null,            -- sujet lisible (ex: "Arsenal — Chelsea")
  match_id       text,                     -- null pour une analyse en « saisie libre »
  payload        jsonb not null,           -- l'analyse complète (verdict, marchés, texte, sources…)
  model_version  integer not null default 1,
  computed_at    timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- TABLE : device_analyses — « Mes analyses », scopées par appareil anonyme
-- L'identifiant d'appareil est généré et stocké CÔTÉ NAVIGATEUR (localStorage),
-- aucune donnée personnelle n'est collectée. Purge automatique après 48 h.
-- ----------------------------------------------------------------------------
create table if not exists public.device_analyses (
  id         uuid primary key default gen_random_uuid(),
  device_id  text not null,
  cache_key  text not null,
  match_id   text,
  sport      text,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- TABLE : reliability — historique de fiabilité (pronostic vs réalité)
-- Une ligne est créée au moment de l'analyse (hit = null, « en attente »),
-- puis évaluée (hit = true/false) quand le match se termine.
-- Les échecs sont conservés et affichés aussi honnêtement que les réussites.
-- ----------------------------------------------------------------------------
create table if not exists public.reliability (
  id           uuid primary key default gen_random_uuid(),
  device_id    text not null,
  cache_key    text not null,
  match_id     text,
  sport        text,
  market       text not null,              -- marché conseillé (ex: 1X, BTTS, O2.5…)
  pick         text not null,              -- pronostic lisible (ex: "Victoire Arsenal")
  probability  numeric not null,           -- probabilité du modèle au moment du pronostic
  hit          boolean,                    -- null = en attente, true = réussite, false = échec
  actual       text,                       -- résultat réel lisible
  evaluated_at timestamptz,
  created_at   timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- TABLE : app_stats — compteurs du tableau de bord + classements en cache
-- ----------------------------------------------------------------------------
create table if not exists public.app_stats (
  key        text primary key,             -- ex: 'counters', 'standings:en.1', 'league:en.1'
  value      jsonb default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- INDEX — pour des requêtes rapides même avec beaucoup de lignes
-- ----------------------------------------------------------------------------
create index if not exists idx_matches_sport_date   on public.matches (sport, match_date);
create index if not exists idx_matches_comp_date    on public.matches (competition, match_date);
create index if not exists idx_matches_status       on public.matches (status);
create index if not exists idx_device_analyses_dev  on public.device_analyses (device_id, created_at);
create index if not exists idx_reliability_dev      on public.reliability (device_id, evaluated_at);
create index if not exists idx_reliability_match    on public.reliability (match_id);
create index if not exists idx_cache_subject        on public.analyses_cache (subject);
create index if not exists idx_player_stats_name    on public.player_stats (player);

-- Unicité appareil + analyse : empêche tout doublon dans « Mes analyses » et
-- dans le suivi de fiabilité, même en cas d'appels concurrents.
-- (Si vous ré-exécutez ce script sur une base déjà peuplée avec des doublons,
--  dédoublonnez d'abord :  delete from public.device_analyses a using
--  public.device_analyses b where a.ctid > b.ctid and a.device_id = b.device_id
--  and a.cache_key = b.cache_key;  — idem pour reliability.)
create unique index if not exists uq_device_analyses on public.device_analyses (device_id, cache_key);
create unique index if not exists uq_reliability     on public.reliability (device_id, cache_key);

-- ----------------------------------------------------------------------------
-- TRIGGER — mise à jour automatique de « updated_at »
-- ----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_matches_updated on public.matches;
create trigger trg_matches_updated before update on public.matches
  for each row execute function public.set_updated_at();

drop trigger if exists trg_team_stats_updated on public.team_stats;
create trigger trg_team_stats_updated before update on public.team_stats
  for each row execute function public.set_updated_at();

drop trigger if exists trg_player_stats_updated on public.player_stats;
create trigger trg_player_stats_updated before update on public.player_stats
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- SÉCURITÉ (RLS — Row Level Security)
-- Lecture publique (sans compte) pour les données affichables.
-- Aucun accès public en écriture : toutes les écritures passent par les
-- Edge Functions, qui utilisent la clé « service_role » côté serveur.
-- Les tables device_analyses et reliability restent totalement fermées au
-- public : elles ne sont lisibles que via les Edge Functions, filtrées par
-- identifiant d'appareil.
-- ----------------------------------------------------------------------------
alter table public.matches         enable row level security;
alter table public.team_stats      enable row level security;
alter table public.player_stats    enable row level security;
alter table public.analyses_cache  enable row level security;
alter table public.device_analyses enable row level security;
alter table public.reliability     enable row level security;
alter table public.app_stats       enable row level security;

drop policy if exists "lecture publique des matchs" on public.matches;
create policy "lecture publique des matchs" on public.matches
  for select to anon, authenticated using (true);

drop policy if exists "lecture publique des stats équipes" on public.team_stats;
create policy "lecture publique des stats équipes" on public.team_stats
  for select to anon, authenticated using (true);

drop policy if exists "lecture publique des stats joueuses" on public.player_stats;
create policy "lecture publique des stats joueuses" on public.player_stats
  for select to anon, authenticated using (true);

drop policy if exists "lecture publique des analyses" on public.analyses_cache;
create policy "lecture publique des analyses" on public.analyses_cache
  for select to anon, authenticated using (true);

drop policy if exists "lecture publique des compteurs" on public.app_stats;
create policy "lecture publique des compteurs" on public.app_stats
  for select to anon, authenticated using (true);

-- (Pas de politique sur device_analyses et reliability : accès via Edge
--  Functions uniquement — confidentialité par appareil.)

-- ----------------------------------------------------------------------------
-- DONNÉES INITIALES — compteurs du tableau de bord
-- ----------------------------------------------------------------------------
insert into public.app_stats (key, value) values
  ('counters', jsonb_build_object(
    'matches', 0,
    'competitions', 0,
    'analyses', 0,
    'by_sport', jsonb_build_object('football', 0, 'basketball', 0, 'tennis', 0),
    'last_refresh', null,
    'sources', '[]'::jsonb
  ))
on conflict (key) do nothing;

-- ============================================================================
-- (OPTIONNEL) PLANIFICATION DU RAFRAÎCHISSEMENT QUOTIDIEN VIA SQL
-- ============================================================================
-- Si l'interface Supabase ne propose pas de bouton « Schedule », décommentez
-- le bloc ci-dessous APRÈS avoir activé les extensions « pg_cron » et « pg_net »
-- (Database > Extensions), et remplacez les deux valeurs entre < > :
--
-- select cron.schedule('pronoscope-quotidien', '0 23 * * *', $$
--   select net.http_post(
--     url := 'https://<VOTRE-REF-PROJET>.supabase.co/functions/v1/daily-refresh',
--     headers := '{"Content-Type": "application/json",
--                 "Authorization": "Bearer <VOTRE-CLE-SERVICE-ROLE>"}'::jsonb,
--     body := '{}'::jsonb
--   );
-- $$);
--
-- Explication : « 0 23 * * * » signifie 23 h 00 UTC, soit minuit en heure
-- d'hiver française (UTC+1) — le créneau demandé de 00:00 UTC+1.
-- ============================================================================

-- Fin du schéma PronoScope. Message de confirmation attendu : « Success. No rows returned »

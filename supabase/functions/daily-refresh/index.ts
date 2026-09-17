// ============================================================================
// PRONOSCOPE — Edge Function « daily-refresh » (Deno / TypeScript)
// ============================================================================
// RÔLE
//   Fonction planifiée (cron quotidien, 23 h 00 UTC = 00 h 00 UTC+1) qui :
//   1. Récupère calendriers + résultats depuis des sources publiques GRATUITES
//      et SANS CLÉ API, côté serveur (aucun souci de CORS navigateur) :
//        • Football   : dépôt GitHub openfootball/football.json (JSON par
//                       championnat et par saison) — licence ouverte.
//        • Basketball : CDN public officiel de la NBA (JSON complet de la
//                       saison : calendrier + scores finaux).
//        • Tennis     : dépôts GitHub JeffSackmann/tennis_atp et
//                       JeffSackmann/tennis_wta (CSV : historique des matchs,
//                       points de service/retour, classements) + scoreboard
//                       public ESPN pour les matchs du jour.
//   2. Stocke les matchs dans la table `matches` (upsert idempotent).
//   3. Calcule les classements, les étiquettes automatiques (« Derby »,
//      « Choc du haut de tableau », « Lutte pour le maintien »,
//      « Enjeu européen », « Sans enjeu apparent ») — uniquement à partir de
//      données réelles ; si la donnée manque, AUCUNE étiquette n'est inventée.
//   4. Calcule les statistiques par équipe (buts/points, forme, domicile,
//      extérieur) et par joueur de tennis (service, retour, face-à-face).
//   5. Évalue la fiabilité des pronostics dont le match est terminé.
//   6. Purge : historique appareil > 48 h, matchs > 21 jours.
//   7. Met à jour les compteurs du tableau de bord (app_stats).
//
// DÉPLOIEMENT (SANS LIGNE DE COMMANDE)
//   Tableau de bord Supabase > Edge Functions > « Create a function » >
//   nom : daily-refresh > désactiver « Verify JWT » si proposé > coller CE
//   FICHIER ENTIÈREMENT dans l'éditeur > Deploy. Puis planifier (onglet
//   « Schedules »/planification, ou bloc pg_cron du fichier 001_schema.sql).
//
//   Les variables d'environnement SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY
//   sont injectées automatiquement par la plateforme Supabase : rien à
//   configurer. Ne partagez jamais la clé service_role.
// ============================================================================

import { createClient } from "npm:@supabase/supabase-js@2.45.4";

// ----------------------------------------------------------------------------
// Utilitaires HTTP / CORS
// ----------------------------------------------------------------------------
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-device-id",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json; charset=utf-8" },
  });
}

const log = (...args: unknown[]) => console.log("[daily-refresh]", ...args);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Récupère du texte distant avec délai d'attente et une tentative de replay. */
async function fetchText(url: string, timeoutMs = 25000): Promise<string> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(timeoutMs),
        headers: { "User-Agent": "PronoScope/1.0 (open-data aggregator; contact: none)" },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (err) {
      if (attempt === 1) throw err;
      await sleep(1500);
    }
  }
  throw new Error("inaccessible");
}

async function fetchJson<T = any>(url: string, timeoutMs = 25000): Promise<T> {
  const text = await fetchText(url, timeoutMs);
  return JSON.parse(text) as T;
}

// ----------------------------------------------------------------------------
// Configuration des sources et des championnats
// ----------------------------------------------------------------------------

/** Championnats de football suivis (dépôt openfootball/football.json). */
const FOOTBALL_LEAGUES: { code: string; name: string; country: string }[] = [
  { code: "en.1", name: "Premier League", country: "Angleterre" },
  { code: "en.2", name: "Championship", country: "Angleterre" },
  { code: "es.1", name: "LaLiga", country: "Espagne" },
  { code: "it.1", name: "Serie A", country: "Italie" },
  { code: "de.1", name: "Bundesliga", country: "Allemagne" },
  { code: "fr.1", name: "Ligue 1", country: "France" },
  { code: "pt.1", name: "Primeira Liga", country: "Portugal" },
  { code: "nl.1", name: "Eredivisie", country: "Pays-Bas" },
];

/** Liste des sources publiques, affichée dans l'application (bloc sources). */
const SOURCES_PUBLIC = [
  { name: "openfootball/football.json", url: "https://github.com/openfootball/football.json", usage: "Calendriers et résultats de football (JSON ouverts)" },
  { name: "ESPN — API publique NBA", url: "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard", usage: "Calendrier et scores NBA (21 jours glissants)" },
  { name: "NBA.com — CDN public", url: "https://cdn.nba.com/static/json/staticData/scheduleLeagueV2.json", usage: "Calendrier NBA complet de la saison (si accessible)" },
  { name: "ESPN — API publique tennis", url: "https://site.api.espn.com/apis/site/v2/sports/tennis/atp/scoreboard", usage: "Calendrier, résultats et scores des matchs ATP/WTA" },
  { name: "ESPN — classements ATP/WTA", url: "https://site.web.api.espn.com/apis/site/v2/sports/tennis/atp/rankings", usage: "Classements officiels ATP et WTA (top 150)" },
];

// NOTE HONNÊTETÉ (2026) : les dépôts GitHub JeffSackmann/tennis_atp et
// tennis_wta ont été SUPPRIMÉS de GitHub (404 vérifié). Le modèle tennis a
// été repensé : classements ESPN + forme et face-à-face accumulés dans la
// base à partir des résultats ESPN ingérés chaque jour. Aucune donnée
// n'est inventée pour compenser.

const NBA_SCHEDULE_URL = "https://cdn.nba.com/static/json/staticData/scheduleLeagueV2.json";
const ESPN_NBA_SCOREBOARD = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard";
const ESPN_TENNIS_BASE = "https://site.api.espn.com/apis/site/v2/sports/tennis";
const ESPN_TENNIS_RANKINGS = "https://site.web.api.espn.com/apis/site/v2/sports/tennis";

/** Date « AAAAMMJJ » à J+n. */
function ymdOffset(days: number): string {
  return ymd(new Date(Date.now() + days * 86400000));
}

/**
 * Groupes de derbies (équipes d'une même ville ou agglomération) — données
 * factuelles et publiques. La correspondance se fait sur des noms normalisés
 * (minuscules, sans accents) avec alias pour absorber les variantes de
 * graphie des sources. Un match entre deux équipes d'un même groupe est un
 * derby ; AUCUN derby n'est « inventé » en dehors de ces groupes factuels.
 */
const DERBY_CLUSTERS: Record<string, string[][]> = {
  en: [
    ["arsenal", "tottenham hotspur", "tottenham", "chelsea", "fulham", "brentford", "west ham united", "west ham", "crystal palace", "queens park rangers", "qpr", "charlton athletic", "millwall"],
    ["manchester city", "manchester united"],
    ["liverpool", "everton"],
    ["sheffield united", "sheffield wednesday"],
    ["aston villa", "birmingham city", "west bromwich albion", "wolverhampton wanderers"],
    ["newcastle united", "sunderland"],
    ["nottingham forest", "derby county"],
    ["leeds united", "bradford city"],
  ],
  es: [
    ["real madrid", "atletico madrid", "atlético madrid", "rayo vallecano", "getafe", "leganes", "léganes"],
    ["barcelona", "fc barcelona", "espanyol", "r cd espanyol"],
    ["sevilla", "real betis"],
    ["athletic club", "athletic bilbao", "real sociedad"],
    ["valencia", "levante"],
    ["celta vigo", "real club deportivo de la coruna"],
  ],
  it: [
    ["ac milan", "milan", "inter", "internazionale", "fc internazionale milano"],
    ["as roma", "roma", "lazio"],
    ["juventus", "torino"],
    ["genoa", "genoa cfc", "sampdoria"],
    ["napoli", "avellino"],
    ["atalanta", "brescia"],
  ],
  fr: [
    ["lens", "lille", "valenciennes"],
    ["lyon", "olympique lyonnais", "saint-etienne", "saint étienne", "as saint-etienne", "asse"],
    ["nice", "ogc nice", "monaco", "as monaco"],
    ["marseille", "olympique de marseille", "om", "toulon"],
    ["bastia", "sc bastia", "ajaccio", "ac ajaccio"],
    ["rennes", "stade rennais", "lorient", "fc lorient"],
  ],
  de: [
    ["fc koln", "1 fc koln", "koeln", "bayer leverkusen", "fortuna dusseldorf"],
    ["hertha bsc", "union berlin"],
    ["hamburger sv", "hsv", "fc st pauli"],
    ["eintracht frankfurt", "darmstadt 98"],
    ["borussia monchengladbach", "fortuna koln"],
  ],
  pt: [
    ["benfica", "sl benfica", "sporting cp", "sporting clube de portugal", "sporting", "belenenses"],
    ["fc porto", "porto", "boavista", "boavista fc"],
  ],
  nl: [
    ["feyenoord", "sparta rotterdam", "excelsior"],
    ["ajax", "afc ajax"],
    ["psv eindhoven", "psv", "fc eindhoven"],
    ["fc groningen", "sc heerenveen"],
  ],
};

/** Conférences NBA par trigramme (donnée factuelle publique, stable). */
const NBA_CONFERENCE: Record<string, "Est" | "Ouest"> = {
  ATL: "Est", BOS: "Est", BKN: "Est", CHA: "Est", CHI: "Est", CLE: "Est",
  DET: "Est", IND: "Est", MIA: "Est", MIL: "Est", NYK: "Est", ORL: "Est",
  PHI: "Est", TOR: "Est", WAS: "Est",
  DEN: "Ouest", GSW: "Ouest", HOU: "Ouest", LAC: "Ouest", LAL: "Ouest",
  MEM: "Ouest", MIN: "Ouest", NOP: "Ouest", OKC: "Ouest", PHX: "Ouest",
  POR: "Ouest", SAC: "Ouest", SAS: "Ouest", UTA: "Ouest",
};

// ----------------------------------------------------------------------------
// Utilitaires de normalisation
// ----------------------------------------------------------------------------

/** Normalise un nom d'équipe : minuscules, sans accents, sans préfixes de club. */
function norm(name: string): string {
  return (name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(fc|cf|ac|as|sc|afc|cfc|ssc|cd|rcd|ud|sd|ca|sl|vfl|vfb|tsv|sv|fk|bk|if|sk|nk|fk)\b/g, " ")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Identifiant lisible : minuscules, tirets. */
function slugify(name: string): string {
  return norm(name).replace(/ /g, "-").slice(0, 40) || "equipe";
}

/** « true » si les deux équipes appartiennent à un même groupe de derbies. */
function isDerby(competition: string, teamA: string, teamB: string): boolean {
  const prefix = (competition || "").split(".")[0];
  const clusters = DERBY_CLUSTERS[prefix];
  if (!clusters) return false;
  const a = norm(teamA);
  const b = norm(teamB);
  return clusters.some((cluster) => cluster.includes(a) && cluster.includes(b));
}

/** Coupe un tableau en morceaux (pour les upsert par lots). */
function chunks<T>(arr: T[], size = 400): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** Date en secondes/années pratiques. */
function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86400000).toISOString();
}
function ymd(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

// ----------------------------------------------------------------------------
// Client Supabase (clé service_role injectée automatiquement — côté serveur)
// ----------------------------------------------------------------------------
const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  { auth: { persistSession: false } },
);

async function getStat(key: string): Promise<any> {
  const { data } = await supabase.from("app_stats").select("value").eq("key", key).maybeSingle();
  return data?.value ?? null;
}

async function setStat(key: string, value: unknown): Promise<void> {
  await supabase.from("app_stats").upsert({ key, value: value as any, updated_at: new Date().toISOString() }, { onConflict: "key" });
}


/** Lecture conditionnelle avec gestion d'erreur (jamais de null silencieux). */
async function selectAll(table: string, cols: string, build: (q: any) => any): Promise<any[]> {
  const q = supabase.from(table).select(cols);
  const { data, error } = await build(q);
  if (error) { log(`selectAll ${table} : ${error.message}`); return []; }
  return data ?? [];
}

async function upsertRows(table: string, rows: any[]): Promise<number> {
  let n = 0;
  for (const batch of chunks(rows)) {
    const { error } = await supabase.from(table).upsert(batch, { onConflict: "id" });
    if (error) log(`upsert ${table} (${batch.length} lignes) : ${error.message}`);
    else n += batch.length;
  }
  return n;
}

// ----------------------------------------------------------------------------
// FOOTBALL — openfootball/football.json
// ----------------------------------------------------------------------------

/** Saison de football en cours (les saisons européennes basculent en août). */
function footballSeasons(): string[] {
  const now = new Date();
  const y = now.getUTCFullYear();
  const start = now.getUTCMonth() >= 6 ? y : y - 1; // à partir de juillet, nouvelle saison
  const s = (startYear: number) => `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
  return [s(start), s(start - 1), s(start - 2)];
}

interface FootMatch {
  date: string; round: string | null; time: string | null;
  home: string; away: string; homeCode: string | null; awayCode: string | null;
  hs: number | null; as: number | null; played: boolean;
}

/** Télécharge et convertit un fichier de saison openfootball. */
async function fetchFootballFile(league: string, season: string): Promise<FootMatch[] | null> {
  const url = `https://raw.githubusercontent.com/openfootball/football.json/master/${season}/${league}.json`;
  try {
    const json = await fetchJson<any>(url);
    const raw = Array.isArray(json?.matches) ? json.matches : [];
    const out: FootMatch[] = [];
    for (const m of raw) {
      const t1 = typeof m?.team1 === "string" ? { name: m.team1 } : (m?.team1 ?? {});
      const t2 = typeof m?.team2 === "string" ? { name: m.team2 } : (m?.team2 ?? {});
      const home = t1?.name, away = t2?.name;
      const date = String(m?.date ?? "").slice(0, 10);
      if (!home || !away || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
      const ft = m?.score?.ft;
      const played = Array.isArray(ft) && ft.length === 2 && typeof ft[0] === "number" && typeof ft[1] === "number";
      out.push({
        date,
        round: m?.round ? String(m.round) : null,
        time: m?.time ? String(m.time) : null,
        home, away,
        homeCode: t1?.code ?? null, awayCode: t2?.code ?? null,
        hs: played ? Number(ft[0]) : null,
        as: played ? Number(ft[1]) : null,
        played,
      });
    }
    return out;
  } catch {
    return null; // saison inexistante ou indisponible — géré par le repli
  }
}

/** Classement (points, différence de buts) à partir des matchs joués. */
function computeFootballStandings(matches: FootMatch[]) {
  const table: Record<string, { team: string; p: number; w: number; d: number; l: number; gf: number; ga: number; pts: number }> = {};
  for (const m of matches) {
    if (!m.played) continue;
    for (const side of ["home", "away"] as const) {
      const team = side === "home" ? m.home : m.away;
      const gf = side === "home" ? m.hs! : m.as!;
      const ga = side === "home" ? m.as! : m.hs!;
      table[team] ??= { team, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 };
      const r = table[team];
      r.p++; r.gf += gf; r.ga += ga;
      if (gf > ga) { r.w++; r.pts += 3; }
      else if (gf === ga) { r.d++; r.pts += 1; }
      else r.l++;
    }
  }
  return Object.values(table)
    .map((r) => ({ ...r, gd: r.gf - r.ga }))
    .sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || a.team.localeCompare(b.team))
    .map((r, i) => ({ ...r, pos: i + 1 }));
}

/**
 * Étiquette automatique d'un match de football, à partir du classement RÉEL.
 * Retourne null si le classement n'est pas assez avancé (donnée manquante =
 * aucune invention).
 */
function footballLabel(competition: string, home: string, away: string, standings: any[], playedRounds: number): string | null {
  if (standings.length < 6) return null;
  // Fiable seulement à partir de 5 journées jouées (sinon trop tôt pour juger)
  if (playedRounds < 5) return null;
  const posOf = (t: string) => standings.find((r) => norm(r.team) === norm(t))?.pos ?? null;
  const ph = posOf(home), pa = posOf(away);
  if (ph == null || pa == null) return null;
  const n = standings.length;
  const europeZone = 4;                                  // Ligue des champions
  const europaZone = Math.min(7, Math.round(n * 0.35));   // places européennes suivantes
  const relegationZone = Math.max(2, Math.round(n * 0.15)); // ~3 dernières places selon la taille
  if (isDerby(competition, home, away)) return "Derby";
  if (ph <= europeZone && pa <= europeZone) return "Choc du haut de tableau";
  if (ph > n - relegationZone || pa > n - relegationZone) return "Lutte pour le maintien";
  if ((ph <= europaZone && pa <= europaZone + 3) || (pa <= europaZone && ph <= europaZone + 3)) return "Enjeu européen";
  return "Sans enjeu apparent";
}

/** Statistiques par équipe + agrégats de championnat (pour le modèle Poisson). */
function computeFootballTeamStats(matches: FootMatch[]) {
  type Agg = { n: number; gf: number; ga: number; pts: number; hn: number; hgf: number; hga: number; hpts: number; an: number; agf: number; aga: number; apts: number; form: any[] };
  const teams: Record<string, Agg> = {};
  const sorted = [...matches].sort((a, b) => a.date.localeCompare(b.date));
  for (const m of sorted) {
    if (!m.played) continue;
    const sides = [
      { team: m.home, gf: m.hs!, ga: m.as!, home: true, opp: m.away },
      { team: m.away, gf: m.as!, ga: m.hs!, home: false, opp: m.home },
    ];
    for (const s of sides) {
      teams[s.team] ??= { n: 0, gf: 0, ga: 0, pts: 0, hn: 0, hgf: 0, hga: 0, hpts: 0, an: 0, agf: 0, aga: 0, apts: 0, form: [] };
      const t = teams[s.team];
      const pts = s.gf > s.ga ? 3 : s.gf === s.ga ? 1 : 0;
      t.n++; t.gf += s.gf; t.ga += s.ga; t.pts += pts;
      if (s.home) { t.hn++; t.hgf += s.gf; t.hga += s.ga; t.hpts += pts; }
      else { t.an++; t.agf += s.gf; t.aga += s.ga; t.apts += pts; }
      t.form.push({ d: m.date, o: s.opp, gs: s.gf, gc: s.ga, v: s.gf > s.ga ? "V" : s.gf === s.ga ? "N" : "D", h: s.home });
    }
  }
  const meta: Record<string, any> = {};
  for (const [team, t] of Object.entries(teams)) {
    meta[team] = {
      n: t.n, gf: t.gf, ga: t.ga, ppg: +(t.pts / Math.max(1, t.n)).toFixed(3),
      home: { n: t.hn, gf: t.hgf, ga: t.hga, ppg: t.hn ? +(t.hpts / t.hn).toFixed(3) : null },
      away: { n: t.an, gf: t.agf, ga: t.aga, ppg: t.an ? +(t.apts / t.an).toFixed(3) : null },
      form: t.form.slice(-16).reverse(), // les 16 plus récents d'abord
    };
  }
  let totHome = 0, totAway = 0, nPlayed = 0;
  for (const m of matches) {
    if (!m.played) continue;
    totHome += m.hs!; totAway += m.as!; nPlayed++;
  }
  return {
    teams: meta,
    league: {
      nMatches: nPlayed,
      avgHomeGoals: nPlayed ? +(totHome / nPlayed).toFixed(4) : null,
      avgAwayGoals: nPlayed ? +(totAway / nPlayed).toFixed(4) : null,
      teams: Object.keys(meta).length,
    },
  };
}

/** Rafraîchit un championnat de football complet. */
async function refreshFootballLeague(league: { code: string; name: string; country: string }) {
  const seasons = footballSeasons();
  let current: { season: string; matches: FootMatch[] } | null = null;
  let previous: { season: string; matches: FootMatch[] } | null = null;
  for (const s of seasons) {
    const matches = await fetchFootballFile(league.code, s);
    if (matches && matches.length > 0) {
      current = { season: s, matches };
      const idx = seasons.indexOf(s);
      for (const s2 of seasons.slice(idx + 1)) {
        const m2 = await fetchFootballFile(league.code, s2);
        if (m2 && m2.length > 0) { previous = { season: s2, matches: m2 }; break; }
      }
      break;
    }
  }
  if (!current) {
    log(`football ${league.code} : aucune saison disponible pour le moment`);
    return { league: league.code, ok: false, matches: 0, teams: 0, season: null };
  }

  // 0) Classement calculé AVANT l'upsert : les étiquettes sont intégrées aux
  // lignes (aucun update unitaire ultérieur — Performance et cohérence).
  const standings = computeFootballStandings(current.matches);
  const playedRounds = standings.length ? Math.max(...standings.map((r) => r.p)) : 0;
  const horizon = new Date(Date.now() + 14 * 86400000).toISOString();
  const todayStr = new Date().toISOString().slice(0, 10);
  const labelOf = (m: FootMatch, dateIso: string) => {
    if (m.played || m.date < todayStr || dateIso > horizon) return null;
    return footballLabel(league.code, m.home, m.away, standings, playedRounds);
  };

  // 1) Matchs -> table `matches` (avec heure réelle si fournie par la source)
  const rows = current.matches.map((m) => {
    const id = `fb:${league.code}:${m.date}:${slugify(m.home)}-${slugify(m.away)}`;
    const timeOk = /^\d{2}:\d{2}/.test(String(m.time ?? ""));
    const timeStr = timeOk ? String(m.time).slice(0, 5) : "12:00"; // midi UTC par défaut si inconnue
    return {
      id,
      sport: "football",
      competition: league.code,
      competition_name: league.name,
      season: current!.season,
      match_date: new Date(`${m.date}T${timeStr}:00Z`).toISOString(),
      home_team: m.home,
      away_team: m.away,
      home_score: m.hs,
      away_score: m.as,
      status: m.played ? "finished" : "scheduled",
      label: labelOf(m, `${m.date}T${timeStr}:00Z`),
      meta: { round: m.round, homeCode: m.homeCode, awayCode: m.awayCode, source: "openfootball", seasonFile: current!.season, timeUnknown: !timeOk },
    };
  });
  const upserted = await upsertRows("matches", rows);
  const labeled = rows.filter((r) => r.label).length;
  const nowIso = new Date().toISOString();
  await setStat(`standings:${league.code}`, { season: current.season, rows: standings, updated_at: nowIso });

  // 3) Statistiques par équipe (saison en cours + saison précédente pour la forme)
  const merged = [...current.matches, ...(previous?.matches ?? [])];
  const { teams, league: leagueAgg } = computeFootballTeamStats(merged);
  const statRows = Object.entries(teams).map(([team, meta]) => ({
    sport: "football", competition: league.code, team, meta: { ...meta, seasons: [current!.season, previous?.season].filter(Boolean) },
  }));
  for (const batch of chunks(statRows, 300)) {
    const { error } = await supabase.from("team_stats").upsert(batch, { onConflict: "sport,competition,team" });
    if (error) log(`team_stats ${league.code} : ${error.message}`);
  }
  await setStat(`league:${league.code}`, { ...leagueAgg, season: current.season, previousSeason: previous?.season ?? null, updated_at: nowIso });

  log(`football ${league.code} : ${rows.length} matchs, ${standings.length} équipes, ${labeled} étiquettes`);
  return { league: league.code, ok: true, matches: rows.length, upserted, teams: standings.length, season: current.season, labeled };
}

// ----------------------------------------------------------------------------
// BASKETBALL — ESPN (API publique, sans clé) + CDN NBA en enrichissement
// Stratégie : scoreboard ESPN jour par jour sur 21 jours passés (résultats et
// statistiques d'équipes) + 7 jours à venir (calendrier). En bonus, le CDN
// officiel NBA peut fournir la saison complète quand il est accessible
// (certaines plages IP sont bloquées : 403 — d'où le repli ESPN).
// ----------------------------------------------------------------------------

/** Récupère le scoreboard ESPN NBA d'une date (AAAAMMJJ). */
async function espnNbaDay(ymdStr: string): Promise<any[]> {
  const url = `${ESPN_NBA_SCOREBOARD}?dates=${ymdStr}`;
  const json = await fetchJson<any>(url, 15000);
  const events = Array.isArray(json?.events) ? json.events : [];
  const out: any[] = [];
  for (const ev of events) {
    const comp = Array.isArray(ev?.competitions) ? ev.competitions[0] : null;
    if (!comp) continue;
    const competitors = Array.isArray(comp?.competitors) ? comp.competitors : [];
    if (competitors.length < 2) continue;
    const home = competitors.find((c: any) => c?.homeAway === "home") ?? competitors[0];
    const away = competitors.find((c: any) => c?.homeAway === "away") ?? competitors[1];
    const homeName = home?.team?.displayName ?? home?.team?.name;
    const awayName = away?.team?.displayName ?? away?.team?.name;
    const id = String(comp?.id ?? ev?.id ?? "");
    const date = ev?.date ?? comp?.date;
    if (!id || !date || !homeName || !awayName) continue;
    const state = String(comp?.status?.type?.state ?? "pre");
    const status = state === "post" ? "finished" : state === "in" ? "live" : "scheduled";
    const hs = status !== "scheduled" && home?.score != null ? Number(home.score) : null;
    const as = status !== "scheduled" && away?.score != null ? Number(away.score) : null;
    out.push({
      id: `nba:${id}`,
      sport: "basketball",
      competition: "nba",
      competition_name: "NBA",
      season: String(ev?.season?.year ?? ""),
      match_date: new Date(date).toISOString(),
      home_team: homeName,
      away_team: awayName,
      home_score: hs,
      away_score: as,
      status,
      label: null, // rempli plus bas à partir du classement par conférence
      meta: {
        tricodeH: home?.team?.abbreviation ?? null,
        tricodeA: away?.team?.abbreviation ?? null,
        source: "espn",
        statusText: comp?.status?.type?.shortDetail ?? null,
      },
    });
  }
  return out;
}

async function refreshBasketball(): Promise<any> {
  // --- 1) ESPN : 21 jours passés + 7 jours à venir --------------------------
  const days: string[] = [];
  for (let d = -21; d <= 7; d++) days.push(ymdOffset(d));
  const dayResults = await Promise.allSettled(days.map((d) => espnNbaDay(d)));
  const rows: any[] = [];
  const seen = new Set<string>();
  let espnOk = 0;
  for (const r of dayResults) {
    if (r.status !== "fulfilled" || !Array.isArray(r.value)) continue;
    espnOk++;
    for (const row of r.value) {
      if (!seen.has(row.id)) {
        seen.add(row.id);
        rows.push(row);
      }
    }
  }
  log(`basketball ESPN : ${espnOk}/${days.length} jours récupérés, ${rows.length} matchs`);

  // --- 2) Enrichissement opportuniste : CDN NBA (saison complète) -----------
  let cdnRows = 0;
  try {
    const json = await fetchJson<any>(NBA_SCHEDULE_URL, 40000);
    const gameDates = json?.leagueSchedule?.gameDates;
    if (Array.isArray(gameDates)) {
      for (const gd of gameDates) {
        for (const g of gd?.games ?? []) {
          const id = String(g?.gameId ?? "");
          const gameTime = g?.gameTimeUTC;
          if (!id || !gameTime || seen.has(`nba:${id}`)) continue;
          const home = g?.homeTeam ?? {}, away = g?.awayTeam ?? {};
          const homeName = `${home?.teamCity ?? ""} ${home?.teamName ?? ""}`.trim();
          const awayName = `${away?.teamCity ?? ""} ${away?.teamName ?? ""}`.trim();
          if (!homeName || !awayName) continue;
          const statusNum = Number(g?.gameStatus ?? 1);
          seen.add(`nba:${id}`);
          cdnRows++;
          rows.push({
            id: `nba:${id}`,
            sport: "basketball",
            competition: "nba",
            competition_name: "NBA",
            season: String(g?.season ?? ""),
            match_date: new Date(gameTime).toISOString(),
            home_team: homeName,
            away_team: awayName,
            home_score: home?.score != null ? Number(home.score) : null,
            away_score: away?.score != null ? Number(away.score) : null,
            status: statusNum === 3 ? "finished" : statusNum === 2 ? "live" : "scheduled",
            label: null,
            meta: { tricodeH: home?.teamTricode ?? null, tricodeA: away?.teamTricode ?? null, source: "nba-cdn" },
          });
        }
      }
      log(`basketball CDN NBA : +${cdnRows} matchs supplémentaires (saison complète)`);
    }
  } catch (err) {
    log(`basketball CDN NBA indisponible (souvent un blocage IP) : ${(err as Error).message} — repli ESPN suffisant`);
  }

  if (!rows.length) throw new Error("aucun match NBA récupéré (ESPN et CDN inaccessibles)");
  const upserted = await upsertRows("matches", rows);

  // --- 3) Statistiques par équipe (points, écarts-type, forme) ---------------
  const played = rows.filter((r) => r.status === "finished" && r.home_score != null && r.away_score != null);
  type Bagg = { n: number; pts: number[]; opp: number[]; hn: number; hpp: number; hop: number; an: number; app: number; aop: number; wins: number; form: any[] };
  const teams: Record<string, Bagg> = {};
  for (const g of played) {
    const sides = [
      { team: g.home_team, pts: g.home_score!, opp: g.away_score!, home: true, oppName: g.away_team },
      { team: g.away_team, pts: g.away_score!, opp: g.home_score!, home: false, oppName: g.home_team },
    ];
    for (const s of sides) {
      teams[s.team] ??= { n: 0, pts: [], opp: [], hn: 0, hpp: 0, hop: 0, an: 0, app: 0, aop: 0, wins: 0, form: [] };
      const t = teams[s.team];
      t.n++; t.pts.push(s.pts); t.opp.push(s.opp);
      if (s.pts > s.opp) t.wins++;
      if (s.home) { t.hn++; t.hpp += s.pts; t.hop += s.opp; }
      else { t.an++; t.app += s.pts; t.aop += s.opp; }
      t.form.push({ d: g.match_date.slice(0, 10), o: s.oppName, p: s.pts, op: s.opp, v: s.pts > s.opp ? "V" : "D", h: s.home });
    }
  }
  const leaguePts = played.flatMap((g) => [g.home_score!, g.away_score!]);
  const leagueAvg = leaguePts.length ? leaguePts.reduce((a, b) => a + b, 0) / leaguePts.length : null;
  const variance = leaguePts.length ? leaguePts.reduce((a, b) => a + (b - (leagueAvg ?? 0)) ** 2, 0) / leaguePts.length : null;
  const homeEdge = played.length ? +(played.reduce((a, g) => a + (g.home_score! - g.away_score!), 0) / played.length).toFixed(2) : null;

  const statRows = Object.entries(teams).map(([team, t]) => {
    const ppg = t.n ? t.pts.reduce((a, b) => a + b, 0) / t.n : 0;
    const oppg = t.n ? t.opp.reduce((a, b) => a + b, 0) / t.n : 0;
    const sigma = t.n > 4 ? Math.sqrt(t.pts.reduce((a, b) => a + (b - ppg) ** 2, 0) / t.n) : null;
    return {
      sport: "basketball", competition: "nba", team,
      meta: {
        n: t.n,
        ppg: +ppg.toFixed(2), oppg: +oppg.toFixed(2), sigma: sigma ? +sigma.toFixed(2) : null,
        wr: t.n ? +(t.wins / t.n).toFixed(3) : 0,
        home: { n: t.hn, ppg: t.hn ? +(t.hpp / t.hn).toFixed(2) : null, oppg: t.hn ? +(t.hop / t.hn).toFixed(2) : null },
        away: { n: t.an, ppg: t.an ? +(t.app / t.an).toFixed(2) : null, oppg: t.an ? +(t.aop / t.an).toFixed(2) : null },
        form: t.form.slice(-14).reverse(),
      },
    };
  });
  for (const batch of chunks(statRows, 100)) {
    const { error } = await supabase.from("team_stats").upsert(batch, { onConflict: "sport,competition,team" });
    if (error) log(`team_stats nba : ${error.message}`);
  }

  // --- 4) Classement par conférence -> étiquettes ----------------------------
  const conf: Record<string, any[]> = { Est: [], Ouest: [] };
  const tricodeOf: Record<string, string> = {};
  for (const r of rows) {
    if (r.meta?.tricodeH) tricodeOf[r.home_team] = r.meta.tricodeH;
    if (r.meta?.tricodeA) tricodeOf[r.away_team] = r.meta.tricodeA;
  }
  for (const [team, t] of Object.entries(teams)) {
    const c = NBA_CONFERENCE[tricodeOf[team] ?? ""] ?? null;
    if (!c) continue;
    conf[c].push({ team, n: t.n, wins: t.wins, ppg: t.pts.reduce((a, b) => a + b, 0) / Math.max(1, t.n), oppg: t.opp.reduce((a, b) => a + b, 0) / Math.max(1, t.n) });
  }
  for (const c of ["Est", "Ouest"] as const) conf[c].sort((a, b) => b.wins / Math.max(1, b.n) - a.wins / Math.max(1, a.n));
  const enoughGames = Math.min(conf.Est.length, conf.Ouest.length) >= 10 && played.length > 60;
  const posOf = (team: string): { pos: number; conf: string } | null => {
    for (const c of ["Est", "Ouest"] as const) {
      const idx = conf[c].findIndex((r) => r.team === team);
      if (idx >= 0) return { pos: idx + 1, conf: c };
    }
    return null;
  };
  const todayStr = new Date().toISOString().slice(0, 10);
  const horizon = new Date(Date.now() + 14 * 86400000).toISOString();
  let labeled = 0;
  const labeledRows: any[] = [];
  for (const r of rows) {
    if (r.status !== "scheduled" || r.match_date.slice(0, 10) < todayStr || r.match_date > horizon) continue;
    if (!enoughGames) continue;
    const ph = posOf(r.home_team), pa = posOf(r.away_team);
    if (!ph || !pa || ph.conf !== pa.conf) continue;
    if (ph.pos <= 4 && pa.pos <= 4) r.label = "Choc du haut de tableau";
    else if (ph.pos >= 13 || pa.pos >= 13) r.label = "Lutte pour le maintien";
    else if ((ph.pos >= 5 && ph.pos <= 10) || (pa.pos >= 5 && pa.pos <= 10)) r.label = "Enjeu play-in";
    else r.label = "Sans enjeu apparent";
    if (r.label) { labeled++; labeledRows.push({ id: r.id, label: r.label }); }
  }
  if (labeledRows.length) {
    for (const batch of chunks(labeledRows, 200)) {
      await supabase.from("matches").upsert(batch, { onConflict: "id" });
    }
  }

  await setStat("standings:nba", { Est: conf.Est.map((r, i) => ({ ...r, pos: i + 1 })), Ouest: conf.Ouest.map((r, i) => ({ ...r, pos: i + 1 })), updated_at: new Date().toISOString() });
  await setStat("league:nba", { avgPpg: leagueAvg ? +leagueAvg.toFixed(2) : null, sigma: variance ? +Math.sqrt(variance).toFixed(2) : null, homeEdge, nGames: played.length, teams: Object.keys(teams).length, espnDays: espnOk, cdnRows, updated_at: new Date().toISOString() });

  log(`basketball nba : ${rows.length} matchs, ${played.length} joués, ${labeled} étiquettes`);
  return { ok: true, matches: rows.length, upserted, played: played.length, teams: Object.keys(teams).length, labeled, espnDays: espnOk, cdnRows };
}

// ----------------------------------------------------------------------------
// TENNIS — ESPN (API publique) : calendrier, résultats, classements.
// NOTE : les dépôts JeffSackmann ont été supprimés de GitHub ; les statistiques
// de joueurs (forme, face-à-face, sets, jeux) sont accumulées dans NOTRE base
// à partir des résultats ESPN ingérés quotidiennement (10 jours au départ,
// puis l'historique s'enrichit de jour en jour). Aucune invention.
// ----------------------------------------------------------------------------

/** Extrait les scores de sets depuis le texte ESPN « X (CTR) bt Y (CTR) 6-4 6-2 ». */
function parseTennisScore(note: string | null | undefined): { setsA: number; setsB: number; games: number } | null {
  if (!note) return null;
  const tokens = String(note).split(/\s+/);
  const setTokens = tokens.filter((t) => /^\d{1,2}-\d{1,2}$/.test(t) || /^\(\d{1,2}-\d{1,2}\)$/.test(t));
  if (!setTokens.length) return null;
  let setsA = 0, setsB = 0, games = 0;
  for (const t of setTokens) {
    const [a, b] = t.replace(/[()]/g, "").split("-").map(Number);
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    if (a > b) setsA++; else if (b > a) setsB++;
    games += a + b;
  }
  return { setsA, setsB, games };
}

/** Récupère le scoreboard tennis ESPN d'une date pour un tour (atp/wta). */
async function espnTennisDay(tour: string, ymdStr: string): Promise<any[]> {
  const url = `${ESPN_TENNIS_BASE}/${tour}/scoreboard?dates=${ymdStr}`;
  const json = await fetchJson<any>(url, 15000);
  const events = Array.isArray(json?.events) ? json.events : [];
  const out: any[] = [];
  for (const ev of events) {
    const tournament = ev?.name ?? null;
    const groupings = Array.isArray(ev?.groupings) ? ev.groupings : [];
    const competitions = groupings.flatMap((g: any) => (Array.isArray(g?.competitions) ? g.competitions : []));
    for (const comp of competitions) {
      const competitors = Array.isArray(comp?.competitors) ? comp.competitors : [];
      if (competitors.length < 2) continue;
      const p1 = competitors[0]?.athlete?.displayName ?? null;
      const p2 = competitors[1]?.athlete?.displayName ?? null;
      if (!p1 || !p2 || p1 === "TBD" || p2 === "TBD") continue; // matchs à qualifier exclus
      const id = String(comp?.id ?? "");
      const date = comp?.date ?? ev?.date;
      if (!id || !date) continue;
      const state = String(comp?.status?.type?.state ?? "pre");
      const status = state === "post" ? "finished" : state === "in" ? "live" : "scheduled";

      // Scores : notes[0].text contient « Vainqueur (CTR) bt Perdant (CTR) 6-4 6-2 »
      const note: string | null = comp?.notes?.[0]?.text ?? null;
      const parsed = status === "finished" ? parseTennisScore(note) : null;
      let hs: number | null = null, as: number | null = null;
      if (parsed && note) {
        // Le premier nom cité dans la note est le vainqueur : aligner les sets.
        const idxP1 = note.indexOf(p1);
        const idxP2 = note.indexOf(p2);
        const firstIsP1 = idxP1 >= 0 && (idxP2 < 0 || idxP1 < idxP2);
        if (firstIsP1) { hs = parsed.setsA; as = parsed.setsB; }
        else { hs = parsed.setsB; as = parsed.setsA; }
      } else if (status === "finished") {
        const w0 = competitors[0]?.winner === true, w1 = competitors[1]?.winner === true;
        if (w0 && !w1) { hs = 2; as = 0; }
        else if (w1 && !w0) { hs = 0; as = 2; }
      }
      out.push({
        id: `tn:${tour}:${id}`,
        sport: "tennis",
        competition: tour,
        competition_name: tour === "atp" ? "ATP Tour" : "WTA Tour",
        season: ymdStr.slice(0, 4),
        match_date: new Date(date).toISOString(),
        home_team: p1,
        away_team: p2,
        home_score: hs,
        away_score: as,
        status,
        label: null,
        meta: {
          tour,
          tournament,
          source: "espn",
          round: comp?.round?.displayName ?? null,
          games: parsed?.games ?? null, // total de jeux (réel), utile au modèle
        },
      });
    }
  }
  return out;
}

/** Classements officiels ATP/WTA (ESPN, top 150). */
async function fetchTennisRankings(tour: string): Promise<Record<string, { rank: number; points: number }>> {
  const json = await fetchJson<any>(`${ESPN_TENNIS_RANKINGS}/${tour}/rankings`, 15000);
  const ranks = json?.rankings?.[0]?.ranks ?? [];
  const out: Record<string, { rank: number; points: number }> = {};
  for (const r of ranks) {
    const name = r?.athlete?.displayName;
    const rank = Number(r?.current);
    if (name && Number.isFinite(rank) && rank > 0) {
      out[name] = { rank, points: Number(r?.points) || 0 };
    }
  }
  return out;
}

/** Agrège les stats de joueuses à partir des matchs tennis stockés en base. */
async function accumulateTennisStats(rankings: Record<string, { rank: number; points: number }>, tour: string) {
  const since = isoDaysAgo(75); // fenêtre d'accumulation en base
  const rows = await selectAll(
    "matches",
    "id, home_team, away_team, home_score, away_score, match_date, status, meta",
    (q) => q.eq("sport", "tennis").eq("status", "finished").gte("match_date", since).order("match_date", { ascending: true }).limit(6000),
  );

  type Pagg = { n: number; wins: number; setsW: number; setsL: number; gamesN: number; gamesSq: number; gamesMatches: number; form: any[]; h2h: Record<string, { w: number; l: number }>; last: string };
  const players: Record<string, Pagg> = {};
  for (const m of rows as any[]) {
    const games = Number(m.meta?.games);
    const hasGames = Number.isFinite(games) && games > 0;
    for (const side of [0, 1]) {
      const me = side === 0 ? m.home_team : m.away_team;
      const opp = side === 0 ? m.away_team : m.home_team;
      const mySets = side === 0 ? m.home_score : m.away_score;
      const oppSets = side === 0 ? m.away_score : m.home_score;
      if (!me || !opp || mySets == null || oppSets == null) continue;
      players[me] ??= { n: 0, wins: 0, setsW: 0, setsL: 0, gamesN: 0, gamesSq: 0, gamesMatches: 0, form: [], h2h: {}, last: "" };
      const p = players[me];
      p.n++;
      const won = mySets > oppSets;
      if (won) p.wins++;
      p.setsW += mySets; p.setsL += oppSets;
      if (hasGames) { p.gamesN += games; p.gamesSq += games * games; p.gamesMatches++; }
      p.form.push({ d: String(m.match_date).slice(0, 10), o: opp, v: won ? "V" : "D", s: `${mySets}-${oppSets}` });
      p.h2h[opp] ??= { w: 0, l: 0 };
      if (won) p.h2h[opp].w++; else p.h2h[opp].l++;
      p.last = String(m.match_date).slice(0, 10);
    }
  }

  const statRows = Object.entries(players).map(([player, p]) => {
    const rk = rankings[player];
    const avgGames = p.gamesMatches >= 3 ? +(p.gamesN / p.gamesMatches).toFixed(1) : null;
    const gamesStd = p.gamesMatches >= 3
      ? +Math.sqrt(Math.max(0.01, p.gamesSq / p.gamesMatches - Math.pow(p.gamesN / p.gamesMatches, 2))).toFixed(2)
      : null;
    return {
      tour, player, matches_count: p.n,
      meta: {
        n: p.n,
        wr: p.n ? +(p.wins / p.n).toFixed(3) : 0,
        setsRatio: p.setsW + p.setsL > 0 ? +(p.setsW / (p.setsW + p.setsL)).toFixed(3) : null,
        avgGames,
        gamesStd,
        gamesMatches: p.gamesMatches,
        rank: rk?.rank ?? null,
        points: rk?.points ?? null,
        form: p.form.slice(-12).reverse(),
        h2h: Object.fromEntries(Object.entries(p.h2h).filter(([, v]) => v.w + v.l >= 2)),
        lastMatch: p.last || null,
      },
    };
  });

  // Joueuses classées sans match récent en base : créées avec le classement seul
  for (const [name, rk] of Object.entries(rankings)) {
    if (!players[name] && rk.rank <= 100) {
      statRows.push({
        tour, player: name, matches_count: 0,
        meta: { n: 0, wr: null, setsRatio: null, avgGames: null, gamesStd: null, gamesMatches: 0, rank: rk.rank, points: rk.points, form: [], h2h: {}, lastMatch: null },
      });
    }
  }

  for (const batch of chunks(statRows, 250)) {
    const { error: upErr } = await supabase.from("player_stats").upsert(batch, { onConflict: "tour,player" });
    if (upErr) log(`player_stats ${tour} : ${upErr.message}`);
  }
  return { players: statRows.length, withMatches: statRows.filter((r) => r.matches_count >= 1).length };
}

async function refreshTennis(): Promise<any> {
  const result: any = { ok: true, matches: 0, atp: 0, wta: 0, labeled: 0, players: 0, ranked: 0 };

  // 1) Classements ESPN (alimentent les rangs, le modèle et les étiquettes)
  const [rkAtp, rkWta] = await Promise.allSettled([fetchTennisRankings("atp"), fetchTennisRankings("wta")]);
  const rankingsAtp = rkAtp.status === "fulfilled" ? rkAtp.value : {};
  const rankingsWta = rkWta.status === "fulfilled" ? rkWta.value : {};
  result.ranked = Object.keys(rankingsAtp).length + Object.keys(rankingsWta).length;
  if (!Object.keys(rankingsAtp).length && !Object.keys(rankingsWta).length) log("tennis : classements ESPN indisponibles");

  // 2) Calendrier et résultats : 10 jours passés + 3 jours à venir, 2 tours
  const days: string[] = [];
  for (let d = -10; d <= 3; d++) days.push(ymdOffset(d));
  const fetches: Promise<any[]>[] = [];
  for (const tour of ["atp", "wta"]) for (const d of days) fetches.push(espnTennisDay(tour, d).catch(() => []));
  const all = await Promise.all(fetches);
  const rows: any[] = [];
  const seen = new Set<string>();
  for (const dayRows of all) {
    for (const r of dayRows) {
      if (!seen.has(r.id)) {
        seen.add(r.id);
        rows.push(r);
        if (r.competition === "atp") result.atp++; else result.wta++;
      }
    }
  }
  if (rows.length) {
    // Étiquette « Affiche du tournoi » : les deux joueuses classées top 10
    const rankOf = (name: string, tour: string) => (tour === "atp" ? rankingsAtp[name]?.rank : rankingsWta[name]?.rank) ?? null;
    for (const r of rows) {
      if (r.status !== "scheduled") continue;
      const rh = rankOf(r.home_team, r.competition), ra = rankOf(r.away_team, r.competition);
      if (rh && ra && rh <= 10 && ra <= 10) { r.label = "Affiche du tournoi"; result.labeled++; }
    }
    await upsertRows("matches", rows);
    result.matches = rows.length;
  }

  // 3) Agrégats de joueuses (forme, H2H, sets, jeux) + classements
  const statsAtp = await accumulateTennisStats(rankingsAtp, "atp");
  const statsWta = await accumulateTennisStats(rankingsWta, "wta");
  result.players = statsAtp.players + statsWta.players;

  log(`tennis : ${result.matches} matchs, ${result.ranked} joueuses classées, ${statsAtp.withMatches + statsWta.withMatches} avec forme`);
  return result;
}

// ----------------------------------------------------------------------------
// FIABILITÉ — comparaison pronostic / résultat réel (quand le match est fini)
// ----------------------------------------------------------------------------

/** Évalue un marché « 1X2 / double chance / BTTS / totaux / score exact ». */
function resolveMarket(sport: string, market: string, pick: string, hs: number, as: number): { hit: boolean; actual: string } | null {
  const total = hs + as;
  if (sport === "football" || sport === "basketball") {
    let hit: boolean | null = null;
    if (market === "1" || market === "H") hit = hs > as;
    else if (market === "X") hit = hs === as;
    else if (market === "2" || market === "A") hit = as > hs;
    else if (market === "1X") hit = hs >= as;
    else if (market === "X2") hit = as >= hs;
    else if (market === "12") hit = hs !== as;
    else if (market === "BTTS") hit = hs > 0 && as > 0;
    else {
      const mLine = /^(O|U)(\d+(?:\.\d+)?)$/.exec(market);
      if (mLine) {
        const line = Number(mLine[2]);
        hit = mLine[1] === "O" ? total > line : total < line;
      } else if (market === "CS") {
        hit = `${hs}-${as}` === pick.trim();
      }
    }
    if (hit === null) return null;
    const winner = hs > as ? "domicile" : as > hs ? "extérieur" : "match nul";
    return { hit, actual: `${hs}-${as} (victoire ${winner}, total ${total})` };
  }
  if (sport === "tennis") {
    // home_score / away_score = sets gagnés
    let hit: boolean | null = null;
    if (market === "P1") hit = hs > as;
    else if (market === "P2") hit = as > hs;
    else if (market === "CS" || market === "SETS") hit = `${hs}-${as}` === pick.trim();
    if (hit === null) return null;
    return { hit, actual: `${hs}-${as} en sets` };
  }
  return null;
}

/** Lecture par lots sur une colonne .in() : évite les URLs > 8 Ko (limite
 *  PostgREST) et vérifie les erreurs — aucun échec silencieux. */
async function selectIn(table: string, cols: string, column: string, keys: string[], chunkSize = 40): Promise<any[]> {
  const out: any[] = [];
  const uniq = [...new Set(keys)];
  for (let i = 0; i < uniq.length; i += chunkSize) {
    const { data, error } = await supabase.from(table).select(cols).in(column, uniq.slice(i, i + chunkSize));
    if (error) log(`selectIn ${table}.${column} : ${error.message}`);
    else out.push(...(data ?? []));
  }
  return out;
}

async function evaluateReliability(): Promise<{ evaluated: number; errors: number }> {
  const pending = await selectAll(
    "reliability",
    "id, match_id, sport, market, pick",
    (q) => q.is("hit", null).not("match_id", "is", null).limit(800),
  );
  if (!pending.length) return { evaluated: 0, errors: 0 };

  const matches = await selectIn("matches", "id, sport, home_score, away_score, status", "id", pending.map((p) => p.match_id!));
  const finished = new Map(matches.filter((m) => m.status === "finished" && m.home_score != null && m.away_score != null).map((m) => [m.id, m]));

  const updates: any[] = [];
  let errors = 0;
  for (const p of pending) {
    const m = finished.get(p.match_id!);
    if (!m) continue;
    const res = resolveMarket(m.sport, p.market, p.pick, m.home_score, m.away_score);
    if (!res) { errors++; continue; }
    updates.push({ id: p.id, hit: res.hit, actual: res.actual, evaluated_at: new Date().toISOString() });
  }

  // Mises à jour groupées (lots parallèles — plus de centaines d'allers-retours)
  let evaluated = 0;
  for (const batch of chunks(updates, 25)) {
    const results = await Promise.allSettled(
      batch.map((u) => supabase.from("reliability").update({ hit: u.hit, actual: u.actual, evaluated_at: u.evaluated_at }).eq("id", u.id)),
    );
    for (const r of results) if (r.status === "fulfilled" && !r.value.error) evaluated++;
  }
  log(`fiabilité : ${evaluated} pronostics évalués`);
  return { evaluated, errors };
}

// ----------------------------------------------------------------------------
// PURGE — historique appareil 48 h, matchs 21 jours, cache 60 jours
// ----------------------------------------------------------------------------
async function purgeOldData(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const jobs: [string, string, () => Promise<any>][] = [
    ["device_analyses_48h", "created_at", () => supabase.from("device_analyses").delete().lt("created_at", isoDaysAgo(2))],
    ["matches_21j", "match_date", () => supabase.from("matches").delete().lt("match_date", isoDaysAgo(21))],
    ["reliability_pending_21j", "created_at", () => supabase.from("reliability").delete().is("hit", null).lt("created_at", isoDaysAgo(21))],
    ["analyses_cache_60j", "computed_at", () => supabase.from("analyses_cache").delete().lt("computed_at", isoDaysAgo(60))],
  ];
  for (const [name, _col, run] of jobs) {
    const { error } = await run();
    out[name] = error ? `erreur: ${error.message.slice(0, 80)}` : "ok";
  }
  log(`purge : ${JSON.stringify(out)}`);
  return out;
}

// ----------------------------------------------------------------------------
// COMPTEURS — tableau de bord
// ----------------------------------------------------------------------------
async function updateCounters(extra: Record<string, unknown>): Promise<unknown> {
  const count = async (opts: Record<string, string>): Promise<number> => {
    let q = supabase.from("matches").select("id", { count: "exact", head: true });
    for (const [k, v] of Object.entries(opts)) q = q.eq(k, v);
    const { count: c } = await q;
    return c ?? 0;
  };
  const [football, basketball, tennis] = await Promise.all([
    count({ sport: "football" }),
    count({ sport: "basketball" }),
    count({ sport: "tennis" }),
  ]);
  const { data: comps } = await supabase.from("matches").select("competition").limit(6000);
  const competitions = new Set((comps ?? []).map((r) => r.competition)).size;
  const { count: analyses } = await supabase.from("analyses_cache").select("cache_key", { count: "exact", head: true });

  const value = {
    matches: football + basketball + tennis,
    by_sport: { football, basketball, tennis },
    competitions,
    analyses: analyses ?? 0,
    last_refresh: new Date().toISOString(),
    sources: SOURCES_PUBLIC,
    ...extra,
  };
  await setStat("counters", value);
  return value;
}

// ----------------------------------------------------------------------------
// GESTIONNAIRE PRINCIPAL
// ----------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  const startedAt = Date.now();

  try {
    let body: any = {};
    try { body = await req.json(); } catch { /* corps vide autorisé (cron) */ }
    const force = body?.force === true || new URL(req.url).searchParams.get("force") === "1";

    // Anti-abus : « force » ne peut contourner la limite de 2 h que si
    // l'appel vient de la plateforme (clé service_role) ou si la base est
    // encore vide (première synchronisation depuis l'interface).
    const trusted = (req.headers.get("Authorization") ?? "") === `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`;
    const { count: matchesCount } = await supabase.from("matches").select("id", { count: "exact", head: true });
    const emptyDb = (matchesCount ?? 0) === 0;
    if (force && !trusted && !emptyDb) {
      return jsonResponse({
        ok: false,
        error: { code: "FORBIDDEN", message: "Le paramètre force est réservé au planificateur ou à la première synchronisation." },
      }, 403);
    }

    const state = await getStat("refresh_state");
    const last = state?.lastRun ? Date.parse(state.lastRun) : 0;
    if (Date.now() - last < 2 * 3600 * 1000 && !(force && (trusted || emptyDb))) {
      return jsonResponse({
        ok: false,
        error: {
          code: "RATE_LIMITED",
          message: "Un rafraîchissement a déjà été effectué il y a moins de 2 heures. Réessayez plus tard.",
        },
      }, 429);
    }
    await setStat("refresh_state", { startedAt: new Date().toISOString(), triggered: body?.trigger ?? "cron" });

    // --- FOOTBALL : championnats traités en parallèle, chacun résilient ---
    const footballResults = await Promise.allSettled(FOOTBALL_LEAGUES.map((l) => refreshFootballLeague(l)));
    const football = footballResults.map((r, i) =>
      r.status === "fulfilled"
        ? r.value
        : { league: FOOTBALL_LEAGUES[i].code, ok: false, error: String(r.reason).slice(0, 200), matches: 0, teams: 0, season: null },
    );
    const footballMatches = football.reduce((a: number, r: any) => a + (r.matches ?? 0), 0);
    const footballOk = football.some((r: any) => r.ok);

    // --- BASKETBALL (ESPN + CDN opportuniste) ---
    let basketball: any = { ok: false, matches: 0, error: "non exécuté" };
    try { basketball = await refreshBasketball(); } catch (err) { basketball = { ok: false, matches: 0, error: String(err).slice(0, 200) }; log(`basketball échec : ${err}`); }

    // --- TENNIS (ESPN : calendrier, résultats, classements) ---
    let tennis: any = { ok: false, matches: 0, players: 0, error: "non exécuté" };
    try { tennis = await refreshTennis(); } catch (err) { tennis = { ok: false, matches: 0, players: 0, error: String(err).slice(0, 200) }; log(`tennis échec : ${err}`); }

    // --- FIABILITÉ + PURGE + COMPTEURS ---
    const reliability = await evaluateReliability();
    const purge = await purgeOldData();
    const anyOk = footballOk || basketball.ok || tennis.ok;
    const counters = await updateCounters({
      football_leagues_ok: football.filter((r: any) => r.ok).length,
      basketball_ok: basketball.ok,
      tennis_ok: tennis.ok,
    });

    // lastRun écrit À LA FIN : un run qui échoue peut être relancé immédiatement.
    await setStat("refresh_state", { lastRun: new Date().toISOString(), startedAt: state?.startedAt ?? new Date().toISOString(), triggered: body?.trigger ?? "cron" });

    const durationMs = Date.now() - startedAt;
    log(`terminé en ${durationMs} ms (ok=${anyOk})`);
    return jsonResponse({
      ok: anyOk,
      durationMs,
      football: { matches: footballMatches, leagues: football },
      basketball,
      tennis,
      reliability,
      purge,
      counters,
    });
  } catch (err) {
    log(`ERREUR GLOBALE : ${err}`);
    return jsonResponse({
      ok: false,
      error: { code: "INTERNAL", message: "Échec du rafraîchissement : " + String(err).slice(0, 300) },
    }, 500);
  }
});

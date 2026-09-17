// ============================================================================
// PRONOSCOPE — Edge Function « analyze-match » (Deno / TypeScript)
// ============================================================================
// RÔLE
//   Moteur d'analyse statistique, appelé À LA DEMANDE depuis l'application.
//   Les données historiques ont déjà été agrégées dans la base par la fonction
//   planifiée « daily-refresh » (openfootball, NBA, JeffSackmann, ESPN) :
//   cette fonction est donc RAPIDE (lecture base uniquement) et ne dépend
//   d'aucune source externe au moment de l'analyse.
//
// MODÈLES STATISTIQUES (100 % factuels, aucun chiffre inventé)
//   • Football   : Poisson bivarié avec correction Dixon-Coles (rho = -0,08)
//                  et rétrécissement bayésien vers la moyenne du championnat
//                  quand l'échantillon est faible. Intensités construites à
//                  partir des buts marqués/encaissés à domicile et à
//                  l'extérieur, pondérés par récence (0,88^k).
//   • Basketball : distribution normale des points (moyennes pondérées par
//                  la récence, écarts-types mesurés, avantage du terrain
//                  mesuré sur la saison).
//   • Tennis     : modèle service/retour (probabilité de gain de point par
//                  serveur issue des % de service et de retour des deux
//                  joueuses) + Monte-Carlo de 15 000 matchs simulés (jeux,
//                  sets, tie-breaks, face-à-face historique).
//
// MARCHÉS
//   1, 2, X, 1X, X2, 12, BTTS, total plus/moins (1,5 / 2,5 / 3,5 buts,
//   ligne NBA, total de jeux au tennis), score exact COHÉRENT avec le total.
//   Cartons, corners, fautes, tirs cadrés : affichés « donnée non
//   disponible » car les sources ouvertes ne les couvrent pas — jamais inventés.
//
// CACHE
//   Le résultat est mis en cache dans la table `analyses_cache` : une analyse
//   déjà faite est réaffichée À L'IDENTIQUE, jamais recalculée.
//
// DÉPLOIEMENT
//   Supabase > Edge Functions > Create a function > nom : analyze-match >
//   coller CE FICHIER ENTIÈREMENT > Deploy (laisser « Verify JWT » désactivé :
//   l'application ne gère pas de comptes utilisateur, la limitation se fait
//   par appareil anonyme).
// ============================================================================

import { createClient } from "npm:@supabase/supabase-js@2.45.4";

// ----------------------------------------------------------------------------
// Utilitaires HTTP / CORS / journalisation
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

const log = (...args: unknown[]) => console.log("[analyze-match]", ...args);

function errorResponse(code: string, message: string, status = 400, extra: Record<string, unknown> = {}): Response {
  return jsonResponse({ ok: false, error: { code, message, ...extra } }, status);
}

/** Hachage SHA-256 hexadécimal (clé de cache déterministe). */
async function sha256(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const pct = (v: number) => Math.round(v * 1000) / 10; // 0..100 avec 1 décimale
const odds = (p: number) => (p > 0.004 ? Math.round((1 / p) * 100) / 100 : null);

// ----------------------------------------------------------------------------
// Client Supabase (service_role — injecté automatiquement, côté serveur)
// ----------------------------------------------------------------------------
const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  { auth: { persistSession: false } },
);

const MODEL_VERSION = 1;

const SOURCES_BY_SPORT: Record<string, { name: string; url: string; usage: string }[]> = {
  football: [
    { name: "openfootball/football.json", url: "https://github.com/openfootball/football.json", usage: "Calendriers, résultats et buts par championnat (saisons en cours et précédentes)" },
  ],
  basketball: [
    { name: "ESPN — API publique NBA", url: "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard", usage: "Résultats NBA des 21 derniers jours (scores, formes, écarts-types)" },
    { name: "NBA.com — CDN public", url: "https://cdn.nba.com/static/json/staticData/scheduleLeagueV2.json", usage: "Calendrier complet NBA de la saison (si accessible)" },
  ],
  tennis: [
    { name: "ESPN — API publique tennis", url: "https://site.api.espn.com/apis/site/v2/sports/tennis/atp/scoreboard", usage: "Calendrier, résultats et scores des matchs ATP/WTA" },
    { name: "ESPN — classements ATP/WTA", url: "https://site.web.api.espn.com/apis/site/v2/sports/tennis/atp/rankings", usage: "Classements officiels (top 150), base du modèle Elo" },
  ],
};

// ----------------------------------------------------------------------------
// MATHS — lois de probabilité
// ----------------------------------------------------------------------------

/** Densité de Poisson : P(X = k). */
function poissonPmf(lambda: number, k: number): number {
  let p = Math.exp(-lambda);
  for (let i = 1; i <= k; i++) p = (p * lambda) / i;
  return p;
}

/** Fonction de répartition de la loi normale (approx. Zelen & Severo). */
function normCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804014327 * Math.exp((-z * z) / 2);
  const p = d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return z >= 0 ? 1 - p : p;
}

// ----------------------------------------------------------------------------
// OUTILS — statistiques pondérées par la récence
// ----------------------------------------------------------------------------

/**
 * Moyenne pondérée par la récence d'une série de matchs (forme la plus
 * récente en premier). `k0` = poids du rétrécissement vers `fallback`
 * (rétrécissement bayésien : stabilise les petits échantillons).
 */
function weightedMean(values: number[], decay = 0.88): number {
  if (!values.length) return 0;
  let sum = 0, wsum = 0;
  values.forEach((v, k) => {
    const w = Math.pow(decay, k);
    sum += w * v;
    wsum += w;
  });
  return sum / wsum;
}

function shrink(mean: number, n: number, fallback: number, k0 = 5): number {
  return (mean * Math.min(n, 30) + fallback * k0) / (Math.min(n, 30) + k0);
}

// ----------------------------------------------------------------------------
// MODÈLE FOOTBALL — Poisson bivarié + correction Dixon-Coles
// ----------------------------------------------------------------------------

interface TeamFootStats {
  team: string;
  meta: any; // { n, gf, ga, ppg, home:{n,gf,ga}, away:{n,gf,ga}, form:[{d,o,gs,gc,v,h}] }
}

/**
 * Calcule le modèle football complet.
 * Retourne la matrice des scores exacts (10x10, normalisée) et les paramètres.
 */
function footballModel(home: TeamFootStats, away: TeamFootStats, league: any) {
  const avgH = league?.avgHomeGoals ?? 1.5;
  const avgA = league?.avgAwayGoals ?? 1.2;

  // Buts marqués/encaissés, domicile pour l'équipe à domicile, extérieur pour l'autre
  const homeMatches = (home.meta?.form ?? []).filter((f: any) => f.h === true);
  const awayMatches = (away.meta?.form ?? []).filter((f: any) => f.h === false);
  const allHome = home.meta?.form ?? [];
  const allAway = away.meta?.form ?? [];

  // attaque domicile = buts marqués à la maison ; repli sur tous les matchs si échantillon minuscule
  const gsH = homeMatches.length >= 3 ? homeMatches.map((f: any) => f.gs) : allHome.map((f: any) => f.gs);
  const gcH = homeMatches.length >= 3 ? homeMatches.map((f: any) => f.gc) : allHome.map((f: any) => f.gc);
  const gsA = awayMatches.length >= 3 ? awayMatches.map((f: any) => f.gs) : allAway.map((f: any) => f.gs);
  const gcA = awayMatches.length >= 3 ? awayMatches.map((f: any) => f.gc) : allAway.map((f: any) => f.gc);

  const attH = shrink(weightedMean(gsH), gsH.length, avgH);
  const defH = shrink(weightedMean(gcH), gcH.length, avgA);
  const attA = shrink(weightedMean(gsA), gsA.length, avgA);
  const defA = shrink(weightedMean(gcA), gcA.length, avgH);

  const lambdaH = clamp((attH * defA) / avgH, 0.25, 4.2);
  const lambdaA = clamp((attA * defH) / avgA, 0.2, 4.0);

  // Matrice des scores avec correction Dixon-Coles (faibles scores corrélés)
  const rho = -0.08;
  const N = 10;
  const matrix: number[][] = [];
  let total = 0;
  for (let i = 0; i < N; i++) {
    matrix[i] = [];
    for (let j = 0; j < N; j++) {
      let p = poissonPmf(lambdaH, i) * poissonPmf(lambdaA, j);
      if (i === 0 && j === 0) p *= 1 - lambdaH * lambdaA * rho;
      else if (i === 0 && j === 1) p *= 1 + lambdaH * rho;
      else if (i === 1 && j === 0) p *= 1 + lambdaA * rho;
      else if (i === 1 && j === 1) p *= 1 - rho;
      matrix[i][j] = Math.max(0, p);
      total += matrix[i][j];
    }
  }
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) matrix[i][j] /= total;

  return {
    lambdaH, lambdaA, matrix,
    attH, defH, attA, defA,
    nHome: home.meta?.n ?? 0,
    nAway: away.meta?.n ?? 0,
  };
}

/** Somme des probabilités d'une condition sur la matrice des scores. */
function sumMatrix(matrix: number[][], cond: (i: number, j: number) => boolean): number {
  let s = 0;
  for (let i = 0; i < matrix.length; i++) for (let j = 0; j < matrix[i].length; j++) if (cond(i, j)) s += matrix[i][j];
  return s;
}

/** Marchés football dérivés de la matrice. */
function footballMarkets(matrix: number[][], homeName: string, awayName: string) {
  const p1 = sumMatrix(matrix, (i, j) => i > j);
  const px = sumMatrix(matrix, (i, j) => i === j);
  const p2 = sumMatrix(matrix, (i, j) => i < j);
  const btts = sumMatrix(matrix, (i, j) => i > 0 && j > 0);
  const over = (line: number) => sumMatrix(matrix, (i, j) => i + j > line);
  const scores: { score: string; p: number }[] = [];
  for (let i = 0; i < matrix.length; i++) for (let j = 0; j < matrix[i].length; j++) scores.push({ score: `${i}-${j}`, p: matrix[i][j] });
  scores.sort((a, b) => b.p - a.p);
  const topScores = scores.slice(0, 6).map((s) => ({ score: s.score, p: +s.p.toFixed(4) }));

  return {
    p1, px, p2, btts,
    o15: over(1.5), o25: over(2.5), o35: over(3.5),
    topScores,
    asMarkets: [
      { key: "1", label: `Victoire ${homeName} (1)`, probability: p1, baseline: 1 / 3 },
      { key: "X", label: "Match nul (X)", probability: px, baseline: 1 / 3 },
      { key: "2", label: `Victoire ${awayName} (2)`, probability: p2, baseline: 1 / 3 },
      { key: "1X", label: `${homeName} ou nul (1X)`, probability: p1 + px, baseline: 2 / 3 },
      { key: "X2", label: `${awayName} ou nul (X2)`, probability: p2 + px, baseline: 2 / 3 },
      { key: "12", label: `Pas de match nul (12)`, probability: p1 + p2, baseline: 2 / 3 },
      { key: "BTTS", label: "Les deux équipes marquent (BTTS)", probability: btts, baseline: 0.5 },
      { key: "O2.5", label: "Plus de 2,5 buts", probability: over(2.5), baseline: 0.5 },
      { key: "U2.5", label: "Moins de 2,5 buts", probability: 1 - over(2.5), baseline: 0.5 },
      { key: "O1.5", label: "Plus de 1,5 but", probability: over(1.5), baseline: 0.5 },
      { key: "O3.5", label: "Plus de 3,5 buts", probability: over(3.5), baseline: 0.5 },
      { key: "U3.5", label: "Moins de 3,5 buts", probability: 1 - over(3.5), baseline: 0.5 },
    ],
  };
}

// ----------------------------------------------------------------------------
// MODÈLE BASKETBALL — distribution normale des points
// ----------------------------------------------------------------------------

function basketballModel(homeMeta: any, awayMeta: any, league: any, neutral: boolean) {
  const leagueAvg = league?.avgPpg ?? 110;
  const leagueSigma = league?.sigma ?? 11;
  const homeEdge = neutral ? 0 : (league?.homeEdge ?? 2.2);

  // Moyennes pondérées par la récence (14 derniers matchs, décroissance 0.9)
  const ppgOf = (m: any) => {
    const pts = (m?.form ?? []).map((f: any) => f.p);
    const base = pts.length ? weightedMean(pts, 0.9) : m?.ppg ?? leagueAvg;
    return shrink(base, m?.n ?? 0, leagueAvg, 4);
  };
  const oppgOf = (m: any) => {
    const pts = (m?.form ?? []).map((f: any) => f.op);
    const base = pts.length ? weightedMean(pts, 0.9) : m?.oppg ?? leagueAvg;
    return shrink(base, m?.n ?? 0, leagueAvg, 4);
  };

  const ppgH = ppgOf(homeMeta), oppgH = oppgOf(homeMeta);
  const ppgA = ppgOf(awayMeta), oppgA = oppgOf(awayMeta);
  const sigmaH = homeMeta?.sigma ?? leagueSigma;
  const sigmaA = awayMeta?.sigma ?? leagueSigma;

  // Score attendu : moyenne entre ce que l'équipe marque et ce que l'autre encaisse
  const muH = (ppgH + oppgA) / 2 + homeEdge / 2;
  const muA = (ppgA + oppgH) / 2 - homeEdge / 2;

  const pH = normCdf((muH - muA) / Math.sqrt(sigmaH ** 2 + sigmaA ** 2));
  const muT = muH + muA;
  const sigmaT = Math.sqrt(sigmaH ** 2 + sigmaA ** 2);

  // Ligne du total TOUJOURS en X,5 (aucune correction de continuité nécessaire :
  // pour un total entier T, « plus que X,5 » équivaut à P(N > X,5))
  const line = Math.floor(muT) + 0.5;
  const pOver = 1 - normCdf((line - muT) / sigmaT);

  // Scores exacts les plus probables (discrétisation des deux normales)
  const mass = (s: number, mu: number, sigma: number) => normCdf((s + 0.5 - mu) / sigma) - normCdf((s - 0.5 - mu) / sigma);
  const cand: { score: string; p: number; hs: number; as: number }[] = [];
  const hMode = Math.round(muH), aMode = Math.round(muA);
  for (let hs = hMode - 8; hs <= hMode + 8; hs++) {
    for (let as = aMode - 8; as <= aMode + 8; as++) {
      if (hs < 60 || as < 60) continue;
      cand.push({ score: `${hs}-${as}`, p: mass(hs, muH, sigmaH) * mass(as, muA, sigmaA), hs, as });
    }
  }
  cand.sort((a, b) => b.p - a.p);
  const topScores = cand.slice(0, 5).map((c) => ({ score: c.score, p: +c.p.toFixed(4) }));

  return {
    muH, muA, sigmaH, sigmaA, muT, sigmaT, line, pOver, pH,
    ppgH, oppgH, ppgA, oppgA, homeEdge,
    topScores,
    nHome: homeMeta?.n ?? 0,
    nAway: awayMeta?.n ?? 0,
    asMarkets: [
      { key: "H", label: `Victoire ${homeMeta?.name ?? "domicile"}`, probability: pH, baseline: 0.5 },
      { key: "A", label: `Victoire ${awayMeta?.name ?? "extérieur"}`, probability: 1 - pH, baseline: 0.5 },
      { key: `O${line.toFixed(1)}`, label: `Plus de ${line.toFixed(1).replace(".", ",")} points (total)`, probability: pOver, baseline: 0.5 },
      { key: `U${line.toFixed(1)}`, label: `Moins de ${line.toFixed(1).replace(".", ",")} points (total)`, probability: 1 - pOver, baseline: 0.5 },
    ],
  };
}

// MODÈLE TENNIS — Elo (classements ESPN) + forme accumulée + face-à-face
// ----------------------------------------------------------------------------

/** Elo initial dérivé du classement officiel (relation logarithmique :
 *  n°1 ≈ 2200, n°10 ≈ 1880, n°50 ≈ 1650, n°100 ≈ 1555). */
function eloFromRank(rank: number | null | undefined): number {
  if (rank != null && Number.isFinite(rank) && rank > 0) {
    return 2200 - 140 * Math.log(rank);
  }
  return 1500; // inconnue au classement : neutre
}

/** Coefficient binomial C(n, k). */
function binom(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1);
  return r;
}

/** P(score final w-l) au meilleur des (w+l+1) sets, sets supposés indépendants. */
function setScoreProb(w: number, l: number, pw: number): number {
  return binom(w - 1 + l, l) * Math.pow(pw, w) * Math.pow(1 - pw, l);
}

function tennisModel(p1Meta: any, p2Meta: any, bestOf: number) {
  // --- 1) Elo : classement + forme accumulée (pondérée par le volume) -------
  let elo1 = eloFromRank(p1Meta?.rank);
  let elo2 = eloFromRank(p2Meta?.rank);
  const formAdj = (m: any): number => {
    const n = m?.n ?? 0, wr = m?.wr;
    if (!n || wr == null) return 0;
    return (wr - 0.5) * Math.min(1, n / 15) * 160; // ajustement max ±160 pts
  };
  elo1 += formAdj(p1Meta);
  elo2 += formAdj(p2Meta);

  // --- 2) Probabilité de victoire (logistique Elo) --------------------------
  let p1 = 1 / (1 + Math.pow(10, (elo2 - elo1) / 400));

  // --- 3) Face-à-face accumulé (au moins 3 confrontations) ------------------
  const h2h = p1Meta?.h2h?.[p2Meta?.name ?? ""] ?? null;
  let h2hInfo: { w: number; l: number; applied: boolean } | null = null;
  if (h2h && h2h.w + h2h.l >= 3) {
    const wr = h2h.w / (h2h.w + h2h.l);
    const shift = clamp((wr - 0.5) * 0.08, -0.04, 0.04);
    p1 = clamp(p1 + shift, 0.03, 0.97);
    h2hInfo = { w: h2h.w, l: h2h.l, applied: true };
  } else if (h2h) {
    h2hInfo = { w: h2h.w, l: h2h.l, applied: false };
  }

  // --- 4) Scores en sets (formule exacte, sets indépendants) ----------------
  const setsToWin = Math.ceil(bestOf / 2);
  const sets: { score: string; p: number }[] = [];
  for (let l = 0; l < setsToWin; l++) {
    sets.push({ score: `${setsToWin}-${l}`, p: +setScoreProb(setsToWin, l, p1).toFixed(4) });
    sets.push({ score: `${l}-${setsToWin}`, p: +setScoreProb(setsToWin, l, 1 - p1).toFixed(4) });
  }
  sets.sort((a, b) => b.p - a.p);
  const expSets = sets.reduce((acc, s) => {
    const [a, b] = s.score.split("-").map(Number);
    return acc + (a + b) * s.p;
  }, 0);
  // Sets attendus au meilleur des 3 (référence des données de jeux accumulées)
  let expSetsBo3 = 0;
  for (let l = 0; l < 2; l++) {
    expSetsBo3 += (2 + l) * (setScoreProb(2, l, p1) + setScoreProb(2, l, 1 - p1));
  }

  // --- 5) Total de jeux (uniquement si les données accumulées le permettent) -
  const gStats = [p1Meta, p2Meta]
    .map((m) => ({ avg: m?.avgGames, std: m?.gamesStd }))
    .filter((g) => Number.isFinite(g.avg) && g.avg > 0);
  let meanGames: number | null = null;
  let stdGames: number | null = null;
  let gamesLine: number | null = null;
  let pOverGames: number | null = null;
  if (gStats.length) {
    const ratio = expSets / Math.max(0.01, expSetsBo3);
    meanGames = (gStats.reduce((a, g) => a + g.avg, 0) / gStats.length) * ratio;
    const stds = gStats.map((g) => g.std).filter((s) => Number.isFinite(s) && s > 0);
    if (stds.length) {
      stdGames = Math.max(2.5, (stds.reduce((a, s) => a + s, 0) / stds.length) * ratio);
      gamesLine = Math.floor(meanGames) + 0.5;
      pOverGames = 1 - normCdf((gamesLine - meanGames) / stdGames);
    }
  }

  const asMarkets: { key: string; label: string; probability: number; baseline: number }[] = [
    { key: "P1", label: `Victoire ${p1Meta?.name ?? "joueuse 1"}`, probability: p1, baseline: 0.5 },
    { key: "P2", label: `Victoire ${p2Meta?.name ?? "joueuse 2"}`, probability: 1 - p1, baseline: 0.5 },
  ];
  if (gamesLine != null && pOverGames != null) {
    asMarkets.push({ key: `O${gamesLine.toFixed(1)}`, label: `Plus de ${gamesLine.toFixed(1).replace(".", ",")} jeux`, probability: pOverGames, baseline: 0.5 });
    asMarkets.push({ key: `U${gamesLine.toFixed(1)}`, label: `Moins de ${gamesLine.toFixed(1).replace(".", ",")} jeux`, probability: 1 - pOverGames, baseline: 0.5 });
  }

  return {
    elo1, elo2, p1, h2hInfo, bestOf, setsToWin,
    sets, expSets, meanGames, stdGames, gamesLine, pOverGames,
    rank1: p1Meta?.rank ?? null, rank2: p2Meta?.rank ?? null,
    n1: p1Meta?.n ?? 0, n2: p2Meta?.n ?? 0,
    gamesData: gStats.length > 0,
    asMarkets,
  };
}

// ----------------------------------------------------------------------------
// VERDICT, CONFIANCE ET MARCHÉS INDISPONIBLES
// ----------------------------------------------------------------------------

/** Marchés exigés par le cahier des charges mais NON couverts par les
 *  sources ouvertes : affichés honnêtement comme indisponibles. */
function unavailableMarkets(sport: string): { key: string; label: string; note: string }[] {
  if (sport === "football") {
    return [
      { key: "CORNERS", label: "Corners (plus/moins)", note: "Les dépôts ouverts openfootball ne fournissent pas les corners." },
      { key: "CARDS", label: "Cartons (plus/moins)", note: "Aucune donnée de cartons dans les sources ouvertes utilisées." },
      { key: "FOULS", label: "Fautes", note: "Aucune donnée de fautes dans les sources ouvertes utilisées." },
      { key: "SHOTS", label: "Tirs cadrés", note: "Aucune donnée de tirs cadrés dans les sources ouvertes utilisées." },
    ];
  }
  if (sport === "basketball") {
    return [
      { key: "REB", label: "Rebonds (plus/moins)", note: "Le calendrier NBA public fournit les scores, pas les rebonds." },
      { key: "AST", label: "Passes décisives", note: "Donnée non couverte par la source publique utilisée." },
      { key: "FOULS", label: "Fautes", note: "Donnée non couverte par la source publique utilisée." },
    ];
  }
  return [
    { key: "ACES", label: "Aces (plus/moins)", note: "Le scoreboard public ne fournit pas les aces par match à venir." },
    { key: "DBLFAULTS", label: "Double fautes", note: "Donnée non couverte par la source publique utilisée." },
  ];
}

/** Choisit le marché conseillé : meilleure combinaison probabilité/marge. */
function pickVerdict(markets: { key: string; label: string; probability: number; baseline: number }[]) {
  const eligible = markets.filter((m) => m.probability >= 0.5 && m.key !== "12"); // 12 rarement un « conseil » pertinent
  const pool = eligible.length ? eligible : markets;
  let best = pool[0];
  let bestScore = -1;
  for (const m of pool) {
    const edge = (m.probability - m.baseline) / (1 - m.baseline); // marge au-dessus du hasard
    const score = m.probability * 0.6 + edge * 0.4;
    if (score > bestScore) { bestScore = score; best = m; }
  }
  return best;
}

/** Niveau de confiance (0-100) : volume de données + marge + probabilité. */
function computeConfidence(sport: string, histMatches: number, verdict: { probability: number; baseline: number }, extraMargin: number) {
  const dataScore = clamp(histMatches / 60, 0, 1);            // volume de données
  const edgeScore = clamp((verdict.probability - verdict.baseline) / (1 - verdict.baseline), 0, 1);
  const marginScore = clamp(extraMargin, 0, 1);                // écart du modèle
  const score = Math.round(100 * (0.4 * dataScore + 0.35 * edgeScore + 0.25 * marginScore));
  const level = score >= 68 ? "élevé" : score >= 45 ? "moyen" : "faible";
  const reasons: string[] = [];
  reasons.push(`${histMatches} matchs historiques exploités (seuil de saturation : 60)`);
  reasons.push(`probabilité du pronostic : ${pct(verdict.probability).toString().replace(".", ",")} % (référence neutre : ${pct(verdict.baseline).toString().replace(".", ",")} %)`);
  if (histMatches < 20) reasons.push("échantillon historique réduit : le rétrécissement bayésien vers la moyenne du championnat a été renforcé");
  return { score, level, reasons };
}

// ----------------------------------------------------------------------------
// COMPARAISONS — jauges horizontales et radar
// ----------------------------------------------------------------------------

function buildComparison(sport: string, homeMeta: any, awayMeta: any, model: any) {
  const cmp: { label: string; home: number; away: number; unit: string }[] = [];
  if (sport === "football") {
    const f5 = (m: any) => (m?.form ?? []).slice(0, 5);
    const pts = (m: any) => f5(m).reduce((a: number, f: any) => a + (f.v === "V" ? 3 : f.v === "N" ? 1 : 0), 0);
    cmp.push({ label: "Attaque (buts/match)", home: +(model.attH).toFixed(2), away: +(model.attA).toFixed(2), unit: "buts" });
    cmp.push({ label: "Défense (buts encaissés/match)", home: +(model.defH).toFixed(2), away: +(model.defA).toFixed(2), unit: "buts" });
    cmp.push({ label: "Forme (points/5 matchs)", home: pts(homeMeta), away: pts(awayMeta), unit: "pts" });
    cmp.push({ label: "Efficacité à domicile (pts/match)", home: homeMeta?.home?.ppg ?? 0, away: awayMeta?.home?.ppg ?? 0, unit: "pts" });
    cmp.push({ label: "Efficacité à l'extérieur (pts/match)", home: homeMeta?.away?.ppg ?? 0, away: awayMeta?.away?.ppg ?? 0, unit: "pts" });
  } else if (sport === "basketball") {
    const f10wr = (m: any) => (m?.form ?? []).slice(0, 10).filter((f: any) => f.v === "V").length;
    cmp.push({ label: "Attaque (points/match)", home: model.ppgH, away: model.ppgA, unit: "pts" });
    cmp.push({ label: "Défense (points encaissés/match)", home: model.oppgH, away: model.oppgA, unit: "pts" });
    cmp.push({ label: "Forme (victoires/10 matchs)", home: f10wr(homeMeta), away: f10wr(awayMeta), unit: "V" });
    cmp.push({ label: "Régularité (écart-type)", home: model.sigmaH, away: model.sigmaA, unit: "pts" });
  } else {
    // Tennis : axes issus du classement ESPN et de l'historique accumulé
    const rankVal = (r: number | null | undefined) => (Number.isFinite(r) && r ? Math.round(1200 / Math.max(1, r)) : 0);
    cmp.push({ label: "Classement officiel", home: model.rank1 ?? 0, away: model.rank2 ?? 0, unit: "rang" });
    cmp.push({ label: "Forme (victoires accumulées, %)", home: pct(homeMeta?.wr ?? 0), away: pct(awayMeta?.wr ?? 0), unit: "%" });
    cmp.push({ label: "Ratio de sets gagnés (%)", home: pct(homeMeta?.setsRatio ?? 0), away: pct(awayMeta?.setsRatio ?? 0), unit: "%" });
    cmp.push({ label: "Elo du modèle", home: Math.round(model.elo1), away: Math.round(model.elo2), unit: "pts" });
  }
  return cmp;
}

function buildRadar(sport: string, homeMeta: any, awayMeta: any, model: any) {
  const scale = (v: number, lo: number, hi: number) => clamp(Math.round((100 * (v - lo)) / (hi - lo)), 2, 100);
  if (sport === "football") {
    return [
      { axis: "Attaque", home: scale(model.attH, 0.4, 2.6), away: scale(model.attA, 0.3, 2.4) },
      { axis: "Défense", home: scale(2.2 - model.defH, 0, 1.8), away: scale(2.2 - model.defA, 0, 1.8) },
      { axis: "Forme", home: scale(homeMeta?.ppg ?? 1, 0, 3), away: scale(awayMeta?.ppg ?? 1, 0, 3) },
      { axis: "Domicile", home: scale(homeMeta?.home?.ppg ?? 1, 0, 3), away: scale(awayMeta?.home?.ppg ?? 1, 0, 3) },
      { axis: "Extérieur", home: scale(homeMeta?.away?.ppg ?? 1, 0, 3), away: scale(awayMeta?.away?.ppg ?? 1, 0, 3) },
    ];
  }
  if (sport === "basketball") {
    return [
      { axis: "Attaque", home: scale(model.ppgH, 95, 130), away: scale(model.ppgA, 95, 130) },
      { axis: "Défense", home: scale(135 - model.oppgH, 0, 40), away: scale(135 - model.oppgA, 0, 40) },
      { axis: "Forme", home: scale((homeMeta?.wr ?? 0.5) * 100, 0, 100), away: scale((awayMeta?.wr ?? 0.5) * 100, 0, 100) },
      { axis: "Régularité", home: scale(16 - model.sigmaH, 0, 12), away: scale(16 - model.sigmaA, 0, 12) },
      { axis: "Volume", home: scale(homeMeta?.n ?? 0, 0, 82), away: scale(awayMeta?.n ?? 0, 0, 82) },
    ];
  }
  return [
    { axis: "Classement", home: scale(1200 / Math.max(1, model.rank1 ?? 300), 0, 1200), away: scale(1200 / Math.max(1, model.rank2 ?? 300), 0, 1200) },
    { axis: "Forme", home: scale((homeMeta?.wr ?? 0.5) * 100, 0, 100), away: scale((awayMeta?.wr ?? 0.5) * 100, 0, 100) },
    { axis: "Sets", home: scale((homeMeta?.setsRatio ?? 0.5) * 100, 0, 100), away: scale((awayMeta?.setsRatio ?? 0.5) * 100, 0, 100) },
    { axis: "Elo", home: scale(model.elo1, 1300, 2300), away: scale(model.elo2, 1300, 2300) },
    { axis: "Expérience", home: scale(homeMeta?.n ?? 0, 0, 25), away: scale(awayMeta?.n ?? 0, 0, 25) },
  ];
}

// ----------------------------------------------------------------------------
// GÉNÉRATION DU TEXTE D'ANALYSE (français, 100 % adossé aux chiffres calculés)
// ----------------------------------------------------------------------------

const frNum = (v: number, d = 2) => v.toFixed(d).replace(".", ",");
const frPct = (v: number) => `${frNum(pct(v), 1)} %`;

function generateText(sport: string, fixture: any, homeName: string, awayName: string, model: any, markets: any, verdict: any, histMatches: number, sourcesLabel: string) {
  const intro = fixture
    ? `Analyse statistique de ${homeName} — ${awayName} (${fixture.competitionName ?? fixture.competition}, ${fixture.dateLabel ?? "date à confirmer"}${fixture.label ? `, étiquette : ${fixture.label}` : ""}). Tous les chiffres de cette analyse proviennent exclusivement de ${sourcesLabel} : rien n'est inventé, et toute donnée manquante est signalée comme telle.`
    : `Analyse statistique théorique de ${homeName} — ${awayName} (saisie libre, sans match officiel rattaché). Les probabilités ci-dessous sont calculées à partir des historiques agrégés dans la base (${histMatches} matchs historiques au total) via ${sourcesLabel}.`;

  const paragraphs: string[] = [];

  if (sport === "football") {
    paragraphs.push(
      `Le modèle Dixon-Coles (Poisson bivarié avec correction des petits scores) aboutit aux intensités offensives suivantes : ${frNum(model.lambdaH)} but attendu pour ${homeName} et ${frNum(model.lambdaA)} pour ${awayName}. Concrètement, ${homeName} marque en moyenne ${frNum(model.attH)} but par match sur la période pondérée (les matchs récents pèsent davantage), tandis que ${awayName} en concède ${frNum(model.defA)}. Dans l'autre sens, ${awayName} inscrit ${frNum(model.attA)} but par match et ${homeName} en encaisse ${frNum(model.defH)}. Les moyennes du championnat (${frNum(model.league?.avgHomeGoals ?? 1.5)} but à domicile, ${frNum(model.league?.avgAwayGoals ?? 1.2)} à l'extérieur) servent d'ancrage : lorsque l'échantillon est faible, le modèle se rapproche de ces valeurs plutôt que d'extrapoler.`,
    );
    paragraphs.push(
      `Côté probabilités issues de la matrice des scores exacts : victoire ${homeName} ${frPct(markets.p1)}, match nul ${frPct(markets.px)}, victoire ${awayName} ${frPct(markets.p2)}. Les deux équipes ont ${frPct(markets.btts)} de chances de marquer toutes les deux, et le match dépasse 2,5 buts dans ${frPct(markets.o25)} des simulations. Le score le plus probable est ${markets.topScores[0]?.score ?? "n/a"} (${frPct(markets.topScores[0]?.p ?? 0)}), devant ${markets.topScores[1]?.score ?? "n/a"} (${frPct(markets.topScores[1]?.p ?? 0)}) et ${markets.topScores[2]?.score ?? "n/a"} (${frPct(markets.topScores[2]?.p ?? 0)}) — ces scores exacts sont cohérents par construction avec les probabilités de total affichées.`,
    );
  } else if (sport === "basketball") {
    paragraphs.push(
      `Le modèle de distribution normale des points projette un score attendu de ${Math.round(model.muH)} - ${Math.round(model.muA)} en faveur de ${homeName}. Cette projection combine l'attaque pondérée de ${homeName} (${frNum(model.ppgH, 1)} points/match) avec la défense de ${awayName} (${frNum(model.oppgA, 1)} points encaissés/match), et symétriquement pour l'autre camp. L'avantage du terrain appliqué (${frNum(model.homeEdge, 1)} point, mesuré sur l'ensemble des matchs joués de la saison) est inclus. La dispersion est matérialisée par des écarts-types de ${frNum(model.sigmaH, 1)} et ${frNum(model.sigmaA, 1)} points : plus ils sont grands, plus le résultat individuel du match est incertain.`,
    );
    paragraphs.push(
      `La probabilité de victoire de ${homeName} s'établit à ${frPct(model.pH)}, celle de ${awayName} à ${frPct(1 - model.pH)}. Le total attendu est de ${frNum(model.muT, 1)} points avec un écart-type de ${frNum(model.sigmaT, 1)} ; la ligne la plus équilibrée est donc fixée à ${frNum(model.line, 1)} points, avec ${frPct(model.pOver)} de chances de la dépasser. Les scores exacts les plus probables (par discrétisation des deux lois normales) sont ${model.topScores.slice(0, 3).map((s: any) => `${s.score} (${frPct(s.p)})`).join(", ")} — le total de ces scores reste cohérent avec la ligne calculée.`,
    );
  } else {
    const h2hTxt = model.h2hInfo
      ? ` Le face-à-face accumulé en base est de ${model.h2hInfo.w} victoire(s) pour ${homeName} contre ${model.h2hInfo.l} pour ${awayName}${model.h2hInfo.applied ? " ; cet historique ajuste légèrement les probabilités du modèle" : " ; il est trop réduit pour ajuster le modèle"}.`
      : " Aucun face-à-face récent n'est disponible en base : le modèle s'appuie sur les classements et la forme.";
    const rank1Txt = model.rank1 ? `n°${model.rank1}` : "non classée";
    const rank2Txt = model.rank2 ? `n°${model.rank2}` : "non classée";
    paragraphs.push(
      `Le modèle tennis est un modèle Elo alimenté par les classements officiels ESPN : ${homeName} (${rank1Txt}) part avec un Elo de ${Math.round(model.elo1)} et ${awayName} (${rank2Txt}) avec ${Math.round(model.elo2)}. L'Elo initial découle du classement par une relation logarithmique, puis est corrigé par la forme accumulée en base (${model.n1} et ${model.n2} matchs récents enregistrés respectivement). La probabilité de victoire s'obtient par la courbe logistique classique de l'Elo.${h2hTxt}`,
    );
    paragraphs.push(
      `Résultat : ${frPct(model.p1)} de chances de victoire pour ${homeName}, soit ${frPct(1 - model.p1)} pour ${awayName} (format au meilleur des ${model.bestOf} sets). Les scores en sets les plus probables sont ${model.sets.slice(0, 3).map((s: any) => `${s.score} (${frPct(s.p)})`).join(", ")}, calculés par la formule exacte des sets indépendants.${model.gamesLine != null ? ` Le total de jeux attendu est de ${frNum(model.meanGames, 1)} (écart-type ${frNum(model.stdGames, 1)}, mesurés sur l'historique accumulé), d'où une ligne à ${frNum(model.gamesLine, 1)} jeux, dépassée avec ${frPct(model.pOverGames)}.` : " L'historique de jeux accumulé est encore insuffisant pour proposer une ligne fiable sur le total de jeux : ce marché est marqué « donnée non disponible » plutôt qu'estimé."}`,
    );
  }

  paragraphs.push(
    `Marché conseillé par le modèle : ${verdict.label}, évalué à ${frPct(verdict.probability)} (cote « juste » correspondante : ${frNum(1 / Math.max(verdict.probability, 0.01))}). Ce conseil est le marché dont la probabilité estimée offre la meilleure combinaison fiabilité/marge parmi ceux couverts par les données. Les cotes affichées dans l'application sont des cotes « justes » (1/probabilité) : elles indiquent en dessous de quelle cote un pari ne présente aucune valeur mathématique selon le modèle.`,
  );
  paragraphs.push(
    `Limites et transparence : les cartons, corners, fautes et tirs cadrés ne sont pas couverts par les sources ouvertes utilisées et sont donc marqués « donnée non disponible » plutôt qu'estimés. Une probabilité n'est jamais une certitude : même un pronostic fiable à ${frPct(verdict.probability)} échoue statistiquement ${frNum((1 - verdict.probability) * 100, 1)} fois sur 100. Consultez l'onglet Fiabilité pour mesurer, sur vos propres analyses passées, la performance réelle de ces modèles.`,
  );

  const conclusion = `Verdict PronoScope : ${verdict.label} — ${frPct(verdict.probability)} de probabilité, confiance ${verdict.confidence.level} (${verdict.confidence.score}/100). Analyse ${fixture ? "adossée au match du calendrier" : "en saisie libre"}, calculée une seule fois puis mise en cache : elle sera réaffichée à l'identique.`;

  return { intro, paragraphs, conclusion };
}

// ----------------------------------------------------------------------------
// RÉSOLUTION DES ÉQUIPES / JOUEUSES
// ----------------------------------------------------------------------------

const cleanName = (raw: unknown) => String(raw ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
const sanitizeLike = (s: string) => s.replace(/[%_\\]/g, "");

async function resolveTeam(sport: string, name: string, preferredComp: string | null) {
  // 1) Correspondance exacte (insensible à la casse)
  const { data: exact } = await supabase
    .from("team_stats")
    .select("competition, team, meta, updated_at")
    .eq("sport", sport)
    .ilike("team", sanitizeLike(name))
    .limit(50);
  const pick = (rows: any[]) => {
    if (!rows?.length) return null;
    if (preferredComp) {
      const pref = rows.find((r) => r.competition === preferredComp);
      if (pref) return pref;
    }
    return [...rows].sort((a, b) => (b.meta?.n ?? 0) - (a.meta?.n ?? 0))[0];
  };
  const direct = pick(exact);
  if (direct) return direct;
  // 2) Repli : recherche partielle (« Arsenal » -> « Arsenal FC »)
  if (name.length >= 4) {
    const { data: partial } = await supabase
      .from("team_stats")
      .select("competition, team, meta, updated_at")
      .eq("sport", sport)
      .ilike("team", `%${sanitizeLike(name)}%`)
      .limit(50);
    return pick(partial);
  }
  return null;
}

async function suggestTeams(sport: string, name: string): Promise<string[]> {
  if (name.length < 3) return [];
  const { data } = await supabase
    .from("team_stats")
    .select("team")
    .eq("sport", sport)
    .ilike("team", `%${sanitizeLike(name)}%`)
    .limit(6);
  return [...new Set((data ?? []).map((r) => r.team))];
}

async function resolvePlayer(name: string, tour: string | null) {
  let q = supabase.from("player_stats").select("tour, player, matches_count, meta, updated_at").ilike("player", sanitizeLike(name));
  if (tour) q = q.eq("tour", tour);
  const { data } = await q;
  if (!data?.length) return null;
  return [...data].sort((a, b) => (b.matches_count ?? 0) - (a.matches_count ?? 0))[0];
}

async function suggestPlayers(name: string): Promise<string[]> {
  if (name.length < 3) return [];
  const { data } = await supabase.from("player_stats").select("player").ilike("player", `%${sanitizeLike(name)}%`).limit(6);
  return [...new Set((data ?? []).map((r) => r.player))];
}

function frDate(iso: string | null | undefined): string {
  if (!iso) return "date à confirmer";
  try {
    return new Intl.DateTimeFormat("fr-FR", { dateStyle: "full", timeZone: "Europe/Paris" }).format(new Date(iso));
  } catch {
    return String(iso).slice(0, 10);
  }
}

// ----------------------------------------------------------------------------
// ENREGISTREMENT DES VUES APPAREIL + FIABILITÉ
// ----------------------------------------------------------------------------

async function recordDeviceView(deviceId: string, cacheKey: string, matchId: string | null, sport: string) {
  // Upsert idempotent (index unique device_id + cache_key — voir migration SQL)
  const { error } = await supabase
    .from("device_analyses")
    .upsert({ device_id: deviceId, cache_key: cacheKey, match_id: matchId, sport }, { onConflict: "device_id,cache_key", ignoreDuplicates: true });
  if (error) log(`recordDeviceView : ${error.message}`);
}

/** Crée la ligne de suivi de fiabilité (pronostic en attente de résultat). */
async function seedReliability(deviceId: string, cacheKey: string, matchId: string | null, sport: string, verdict: any) {
  if (!matchId) return; // analyse en saisie libre : non évaluable
  // Upsert idempotent (index unique device_id + cache_key)
  const { error } = await supabase
    .from("reliability")
    .upsert({
      device_id: deviceId,
      cache_key: cacheKey,
      match_id: matchId,
      sport,
      market: verdict.marketKey,
      pick: verdict.pick,
      probability: verdict.probability,
    }, { onConflict: "device_id,cache_key", ignoreDuplicates: true });
  if (error) log(`seedReliability : ${error.message}`);
}

/** Purge paresseuse : l'historique « Mes analyses » est limité à 48 h. */
async function lazyPurge() {
  await supabase.from("device_analyses").delete().lt("created_at", new Date(Date.now() - 48 * 3600 * 1000).toISOString());
}

// ----------------------------------------------------------------------------
// ACTION « analyze »
// ----------------------------------------------------------------------------

async function doAnalyze(body: any): Promise<Response> {
  const deviceId = String(body?.deviceId ?? "");
  if (!/^[a-zA-Z0-9-]{8,64}$/.test(deviceId)) {
    return errorResponse("INVALID_DEVICE", "Identifiant d'appareil invalide ou manquant.");
  }

  let matchId = body?.matchId ? String(body.matchId).slice(0, 140) : null;
  let sport = String(body?.sport ?? "");
  let fixture: any = null;
  let homeName = "", awayName = "", comp: string | null = null, tour: string | null = null;

  if (matchId) {
    const { data: m } = await supabase.from("matches").select("*").eq("id", matchId).maybeSingle();
    if (!m) return errorResponse("MATCH_NOT_FOUND", "Match introuvable dans la base. Lancez une synchronisation puis réessayez.");
    sport = m.sport;
    homeName = m.home_team;
    awayName = m.away_team;
    comp = m.competition;
    tour = m.sport === "tennis" ? m.competition : null;
    fixture = {
      matchId: m.id, date: m.match_date, dateLabel: frDate(m.match_date),
      competition: m.competition, competitionName: m.competition_name,
      label: m.label, status: m.status, meta: m.meta ?? {},
    };
  } else {
    homeName = cleanName(body?.home);
    awayName = cleanName(body?.away);
    comp = body?.competition ? String(body.competition).slice(0, 24) : null;
    tour = body?.tour ? String(body.tour).slice(0, 8) : null;
    if (!homeName || !awayName) return errorResponse("INVALID_INPUT", "Indiquez les deux équipes (ou joueuses) à confronter.");
    if (homeName.toLowerCase() === awayName.toLowerCase()) return errorResponse("INVALID_INPUT", "Les deux adversaires doivent être différents.");
  }

  if (!["football", "basketball", "tennis"].includes(sport)) {
    return errorResponse("INVALID_SPORT", "Sport non pris en charge : football, basketball ou tennis.");
  }

  // ---- Phase 1 : résolution CANONIQUE des adversaires (avant le cache) ----
  // La clé de cache est calculée sur les noms canoniques : « Arsenal » et
  // « Arsenal FC » pointent vers la même analyse mise en cache.
  const notes: string[] = [];
  let resolved: any = null;
  if (sport === "tennis") {
    const p1 = await resolvePlayer(homeName, tour);
    const p2 = await resolvePlayer(awayName, tour);
    if (!p1 || !p2) {
      const missing = !p1 ? homeName : awayName;
      const suggestions = await suggestPlayers(missing);
      return errorResponse("PLAYERS_NOT_FOUND", `Joueuse/joueur « ${missing} » introuvable dans la base statistique (classements ATP/WTA agrégés). Essayez l'autocomplétion.`, 404, { suggestions });
    }
    homeName = p1.player; awayName = p2.player;
    resolved = { kind: "tennis", p1, p2 };
  } else {
    const homeTeam = await resolveTeam(sport, homeName, comp);
    const awayTeam = await resolveTeam(sport, awayName, comp);
    if (!homeTeam || !awayTeam) {
      const missing = !homeTeam ? homeName : awayName;
      const suggestions = await suggestTeams(sport, missing);
      return errorResponse("TEAMS_NOT_FOUND", `Équipe « ${missing} » introuvable dans la base statistique. Lancez une synchronisation des données ou utilisez l'autocomplétion.`, 404, { suggestions });
    }
    homeName = homeTeam.team; awayName = awayTeam.team;
    resolved = { kind: "team", homeTeam, awayTeam };
  }

  // ---- Cache : une analyse déjà faite est réaffichée à l'identique ----
  const cacheKey = await sha256(`v${MODEL_VERSION}|${sport}|${homeName.toLowerCase()}|${awayName.toLowerCase()}|${matchId ?? "libre"}`);
  const { data: cached } = await supabase.from("analyses_cache").select("payload").eq("cache_key", cacheKey).maybeSingle();
  if (cached?.payload) {
    await recordDeviceView(deviceId, cacheKey, matchId, sport);
    const payload = cached.payload;
    // Garde d'honnêteté : jamais de suivi de fiabilité pour un match déjà
    // terminé (l'analyse serait formulée après le résultat).
    if (payload?.verdict && fixture?.status !== "finished") {
      await seedReliability(deviceId, cacheKey, matchId, sport, payload.verdict);
    }
    return jsonResponse({ ok: true, cached: true, cacheKey, analysis: payload });
  }

  // ---- Phase 2 : calcul du modèle (données déjà résolues en phase 1) ----
  let model: any, markets: any, histMatches = 0, leagueStats: any = null;
  let homeInfo: any, awayInfo: any;
  const sourcesLabels = SOURCES_BY_SPORT[sport]?.map((s) => s.name).join(", ");

  if (resolved.kind === "tennis") {
    const p1 = resolved.p1, p2 = resolved.p2;
    const t = tour ?? p1.tour ?? "atp";
    const slamNames = ["australian open", "roland garros", "french open", "wimbledon", "us open"];
    const tournamentName = String(fixture?.meta?.tournament ?? "").toLowerCase();
    const isSlam = slamNames.some((s) => tournamentName.includes(s));
    const bestOf = t === "atp" && isSlam ? 5 : 3;
    if (isSlam) notes.push("Tournoi du Grand Chelem détecté : format au meilleur des 5 sets (ATP).");

    model = tennisModel({ ...p1.meta, name: p1.player }, { ...p2.meta, name: p2.player }, bestOf);
    markets = { asMarkets: model.asMarkets, topScores: model.sets };
    histMatches = (p1.meta?.n ?? 0) + (p2.meta?.n ?? 0);
    homeInfo = { name: p1.player, tour: p1.tour, stats: p1.meta, updated_at: p1.updated_at };
    awayInfo = { name: p2.player, tour: p2.tour, stats: p2.meta, updated_at: p2.updated_at };
    leagueStats = null;
  } else {
    const homeTeam = resolved.homeTeam, awayTeam = resolved.awayTeam;
    const neutral = homeTeam.competition !== awayTeam.competition;
    if (neutral) notes.push(`Confrontation inter-championnats (${homeTeam.competition} vs ${awayTeam.competition}) : avantage du terrain neutralisé dans le modèle.`);
    const { data: leagueRow } = await supabase.from("app_stats").select("value").eq("key", `league:${homeTeam.competition}`).maybeSingle();
    leagueStats = leagueRow?.value ?? null;

    if (sport === "football") {
      model = footballModel({ team: homeTeam.team, meta: homeTeam.meta }, { team: awayTeam.team, meta: awayTeam.meta }, leagueStats);
      model.league = leagueStats;
      markets = footballMarkets(model.matrix, homeName, awayName);
      histMatches = model.nHome + model.nAway;
    } else {
      model = basketballModel({ ...homeTeam.meta, name: homeTeam.team }, { ...awayTeam.meta, name: awayTeam.team }, leagueStats, neutral);
      markets = { asMarkets: model.asMarkets, topScores: model.topScores };
      histMatches = model.nHome + model.nAway;
    }
    homeInfo = { name: homeTeam.team, competition: homeTeam.competition, stats: homeTeam.meta, updated_at: homeTeam.updated_at };
    awayInfo = { name: awayTeam.team, competition: awayTeam.competition, stats: awayTeam.meta, updated_at: awayTeam.updated_at };
  }

  if (histMatches < 6) {
    return errorResponse("INSUFFICIENT_DATA", `Données historiques insuffisantes (${histMatches} matchs au total) : le modèle refuse de calculer plutôt que d'inventer. Attendez la prochaine synchronisation quotidienne.`, 422);
  }
  if (fixture?.status === "finished") notes.push("Ce match est déjà terminé : il s'agit d'une analyse rétrospective, exclue du suivi de fiabilité.");

  // ---- Verdict, confiance, comparaisons ----
  // Marchés éligibles au verdict : les scores exacts (CS) restent affichés mais
  // ne sont jamais « conseillés » ; au tennis, les totaux de jeux ne sont pas
  // évaluables en fiabilité (seuls les sets sont stockés) : exclus du verdict.
  const verdictPool = markets.asMarkets.filter((m: any) => {
    if (m.key === "CS" || m.key === "12") return false;
    if (sport === "tennis" && /^[OU]\d/.test(m.key)) return false;
    return true;
  });
  const verdictMarket = pickVerdict(verdictPool.length ? verdictPool : markets.asMarkets);
  const extraMargin = sport === "football"
    ? Math.max(markets.p1, markets.p2, markets.px) - 1 / 3
    : sport === "basketball" ? Math.abs(model.pH - 0.5) * 2 : Math.abs(model.p1 - 0.5) * 2;
  const confidence = computeConfidence(sport, histMatches, verdictMarket, extraMargin);
  const topScore = markets.topScores?.[0] ?? null;
  const verdict = {
    marketKey: verdictMarket.key,
    label: verdictMarket.label,
    pick: verdictMarket.label,
    probability: +verdictMarket.probability.toFixed(4),
    baseline: verdictMarket.baseline,
    odds: odds(verdictMarket.probability),
    exactScore: topScore?.score ?? null,
    exactScoreP: topScore?.p ?? null,
    confidence,
  };

  const marketCards = [
    ...markets.asMarkets.map((m: any) => ({ key: m.key, label: m.label, probability: +m.probability.toFixed(4), odds: odds(m.probability), available: true, note: null })),
    ...unavailableMarkets(sport).map((u) => ({ key: u.key, label: u.label, probability: null, odds: null, available: false, note: u.note })),
  ];

  const text = generateText(sport, fixture, homeName, awayName, model, markets, verdict, histMatches, sourcesLabels);

  const payload = {
    version: MODEL_VERSION,
    sport,
    mode: matchId ? "match" : "libre",
    generatedAt: new Date().toISOString(),
    fixture,
    teams: { home: homeInfo, away: awayInfo },
    model: {
      kind: sport === "football" ? "poisson-dixon-coles" : sport === "basketball" ? "normale-points" : "tennis-service-monte-carlo",
      params: sport === "football"
        ? { lambdaH: +model.lambdaH.toFixed(3), lambdaA: +model.lambdaA.toFixed(3), rho: -0.08 }
        : sport === "basketball"
          ? { muH: +model.muH.toFixed(2), muA: +model.muA.toFixed(2), sigmaH: +model.sigmaH.toFixed(2), sigmaA: +model.sigmaA.toFixed(2), muT: +model.muT.toFixed(2), sigmaT: +model.sigmaT.toFixed(2), line: model.line, homeEdge: model.homeEdge }
          : { elo1: Math.round(model.elo1), elo2: Math.round(model.elo2), p1: +model.p1.toFixed(4), rank1: model.rank1, rank2: model.rank2, bestOf: model.bestOf, h2h: model.h2hInfo },
      matrix: sport === "football" ? model.matrix.map((row: number[]) => row.map((v) => +v.toFixed(5))) : undefined,
      topScores: markets.topScores,
      distribution: sport === "basketball"
        ? { muTotal: +model.muT.toFixed(2), sigmaTotal: +model.sigmaT.toFixed(2), line: model.line, pOver: +model.pOver.toFixed(4) }
        : sport === "tennis"
          ? { meanGames: +model.meanGames.toFixed(2), stdGames: +model.stdGames.toFixed(2), line: model.gamesLine, pOver: +model.pOverGames.toFixed(4) }
          : undefined,
      sets: sport === "tennis" ? model.sets : undefined,
    },
    markets: marketCards,
    verdict,
    comparison: buildComparison(sport, homeInfo?.stats, awayInfo?.stats, model),
    radar: buildRadar(sport, homeInfo?.stats, awayInfo?.stats, model),
    text,
    sources: {
      repos: SOURCES_BY_SPORT[sport],
      historicalMatches: histMatches,
      lastDataUpdate: leagueStats?.updated_at ?? homeInfo?.updated_at ?? null,
      notes,
    },
  };

  // ---- Mise en cache (calcul unique) + vues appareil + fiabilité ----
  const { error: cacheErr } = await supabase.from("analyses_cache").upsert({
    cache_key: cacheKey,
    sport,
    subject: `${homeName} — ${awayName}`,
    match_id: matchId,
    payload,
    model_version: MODEL_VERSION,
  }, { onConflict: "cache_key" });
  if (cacheErr) log(`mise en cache impossible : ${cacheErr.message}`);

  await recordDeviceView(deviceId, cacheKey, matchId, sport);
  if (fixture?.status !== "finished") await seedReliability(deviceId, cacheKey, matchId, sport, verdict);

  log(`analyse ${sport} ${homeName} — ${awayName} : calculée (${histMatches} matchs historiques)`);
  return jsonResponse({ ok: true, cached: false, cacheKey, analysis: payload });
}

// ----------------------------------------------------------------------------
// ACTION « history » — Mes analyses (48 h, par appareil)
// ----------------------------------------------------------------------------

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

async function doHistory(deviceId: string): Promise<Response> {
  await lazyPurge();
  const cutoff = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
  const { data: das, error: dasErr } = await supabase
    .from("device_analyses")
    .select("cache_key, match_id, sport, created_at")
    .eq("device_id", deviceId)
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(120);
  if (dasErr) return errorResponse("DB_ERROR", `Lecture impossible : ${dasErr.message}`, 500);
  if (!das?.length) return jsonResponse({ ok: true, items: [] });

  const keys = [...new Set(das.map((d) => d.cache_key))];
  const caches = await selectIn("analyses_cache", "cache_key, sport, subject, match_id, payload, computed_at", "cache_key", keys);
  const cacheMap = new Map(caches.map((c) => [c.cache_key, c]));

  const matchIds = [...new Set(das.map((d) => d.match_id).filter(Boolean) as string[])];
  const matches = matchIds.length
    ? await selectIn("matches", "id, home_team, away_team, home_score, away_score, status, match_date, competition, competition_name, label", "id", matchIds)
    : [];
  const matchMap = new Map(matches.map((m) => [m.id, m]));

  const items = das.map((d) => {
    const c = cacheMap.get(d.cache_key);
    const m = d.match_id ? matchMap.get(d.match_id) : null;
    const verdict = c?.payload?.verdict ?? null;
    return {
      cacheKey: d.cache_key,
      createdAt: d.created_at,
      sport: d.sport ?? c?.sport ?? null,
      subject: c?.subject ?? null,
      computedAt: c?.computed_at ?? null,
      verdict: verdict ? {
        marketKey: verdict.marketKey, label: verdict.label,
        probability: verdict.probability, exactScore: verdict.exactScore,
        confidence: verdict.confidence ?? null,
      } : null,
      match: m ? {
        id: m.id, homeTeam: m.home_team, awayTeam: m.away_team,
        homeScore: m.home_score, awayScore: m.away_score, status: m.status,
        date: m.match_date, competition: m.competition, competitionName: m.competition_name, label: m.label,
      } : null,
    };
  }).filter((it) => it.verdict || it.match);

  return jsonResponse({ ok: true, items });
}

// ----------------------------------------------------------------------------
// ACTIONS « history-remove » / « history-clear »
// ----------------------------------------------------------------------------

async function doHistoryRemove(deviceId: string, cacheKey: string): Promise<Response> {
  await supabase.from("device_analyses").delete().eq("device_id", deviceId).eq("cache_key", cacheKey);
  return jsonResponse({ ok: true });
}

async function doHistoryClear(deviceId: string): Promise<Response> {
  await supabase.from("device_analyses").delete().eq("device_id", deviceId);
  return jsonResponse({ ok: true });
}

// ----------------------------------------------------------------------------
// ACTION « reliability » — historique de fiabilité
// ----------------------------------------------------------------------------

async function doReliability(deviceId: string): Promise<Response> {
  await lazyPurge();
  const { data: rows } = await supabase
    .from("reliability")
    .select("id, cache_key, match_id, sport, market, pick, probability, hit, actual, evaluated_at, created_at")
    .eq("device_id", deviceId)
    .order("created_at", { ascending: true })
    .limit(600);

  const all = rows ?? [];
  const evaluated = all.filter((r) => r.hit !== null);
  const pending = all.filter((r) => r.hit === null);

  // Détail par marché
  const byMarketMap = new Map<string, { market: string; n: number; hits: number }>();
  for (const r of evaluated) {
    const e = byMarketMap.get(r.market) ?? { market: r.market, n: 0, hits: 0 };
    e.n++; if (r.hit) e.hits++;
    byMarketMap.set(r.market, e);
  }
  const byMarket = [...byMarketMap.values()]
    .map((e) => ({ ...e, rate: e.n ? +(e.hits / e.n).toFixed(4) : 0 }))
    .sort((a, b) => b.n - a.n);

  // Courbe d'évolution (taux cumulé, chronologique)
  let acc = 0;
  const curve = evaluated.map((r, i) => {
    if (r.hit) acc++;
    return { i: i + 1, rate: +(acc / (i + 1)).toFixed(4), hit: r.hit, market: r.market, evaluatedAt: r.evaluated_at };
  });

  // Série en cours (depuis le plus récent)
  let streak = 0;
  for (let i = evaluated.length - 1; i >= 0; i--) {
    if (evaluated[i].hit) streak++;
    else break;
  }

  // Détail match par match (le plus récent d'abord), enrichi du sujet
  const keys = [...new Set(all.map((r) => r.cache_key))];
  const caches = keys.length
    ? await selectIn("analyses_cache", "cache_key, subject, match_id", "cache_key", keys)
    : [];
  const subjectMap = new Map(caches.map((c) => [c.cache_key, c.subject]));
  const matchIds = [...new Set(all.map((r) => r.match_id).filter(Boolean) as string[])];
  const matches = matchIds.length
    ? await selectIn("matches", "id, home_team, away_team, home_score, away_score, status, match_date", "id", matchIds)
    : [];
  const matchMap = new Map(matches.map((m) => [m.id, m]));
  const detail = [...all].reverse().map((r) => {
    const m = r.match_id ? matchMap.get(r.match_id) : null;
    return {
      id: r.id, cacheKey: r.cache_key, subject: subjectMap.get(r.cache_key) ?? null,
      sport: r.sport, market: r.market, pick: r.pick,
      probability: Number(r.probability), hit: r.hit, actual: r.actual,
      evaluatedAt: r.evaluated_at, createdAt: r.created_at,
      match: m ? { homeTeam: m.home_team, awayTeam: m.away_team, homeScore: m.home_score, awayScore: m.away_score, status: m.status, date: m.match_date } : null,
    };
  });

  // Statistiques « communauté » (tous appareils, anonymes)
  const { count: globalEvaluated } = await supabase.from("reliability").select("id", { count: "exact", head: true }).not("hit", "is", null);
  const { count: globalHits } = await supabase.from("reliability").select("id", { count: "exact", head: true }).eq("hit", true);

  const hits = evaluated.filter((r) => r.hit).length;
  const level =
    evaluated.length >= 100 ? "Maître Oracle"
      : evaluated.length >= 50 ? "Oracle d'or"
      : evaluated.length >= 25 ? "Oracle d'argent"
      : evaluated.length >= 10 ? "Oracle de bronze"
      : evaluated.length >= 3 ? "Apprenti Oracle"
      : "Novice";

  return jsonResponse({
    ok: true,
    summary: {
      evaluated: evaluated.length,
      hits,
      misses: evaluated.length - hits,
      rate: evaluated.length ? +(hits / evaluated.length).toFixed(4) : null,
      pending: pending.length,
      streak,
      level,
    },
    byMarket,
    curve,
    detail,
    community: {
      evaluated: globalEvaluated ?? 0,
      hits: globalHits ?? 0,
      rate: globalEvaluated ? +((globalHits ?? 0) / globalEvaluated).toFixed(4) : null,
    },
  });
}

// ----------------------------------------------------------------------------
// ACTION « autocomplete » — suggestions d'équipes / joueuses
// ----------------------------------------------------------------------------

async function doAutocomplete(sport: string, q: string): Promise<Response> {
  const query = sanitizeLike(q.trim().slice(0, 60));
  if (query.length < 2) return jsonResponse({ ok: true, suggestions: [] });

  if (sport === "tennis") {
    const { data } = await supabase
      .from("player_stats")
      .select("player, tour, matches_count, meta")
      .ilike("player", `%${query}%`)
      .limit(40);
    const suggestions = (data ?? [])
      .sort((a, b) => (b.matches_count ?? 0) - (a.matches_count ?? 0))
      .slice(0, 12)
      .map((r) => ({ name: r.player, tour: r.tour, rank: r.meta?.rank ?? null }));
    return jsonResponse({ ok: true, suggestions });
  }

  const { data } = await supabase
    .from("team_stats")
    .select("team, competition, meta")
    .eq("sport", sport)
    .ilike("team", `%${query}%`)
    .limit(40);
  const suggestions = (data ?? [])
    .sort((a, b) => ((b.meta?.n ?? 0) - (a.meta?.n ?? 0)))
    .slice(0, 12)
    .map((r) => ({ name: r.team, competition: r.competition }));
  return jsonResponse({ ok: true, suggestions });
}

// ----------------------------------------------------------------------------
// LIMITATION DE DÉBIT PAR APPAREIL (en mémoire : suffit à décourager l'abus)
// ----------------------------------------------------------------------------
const rateBuckets = new Map<string, number[]>();

function rateLimited(deviceId: string, maxPerHour = 60): boolean {
  const now = Date.now();
  const bucket = (rateBuckets.get(deviceId) ?? []).filter((t) => now - t < 3600 * 1000);
  if (bucket.length >= maxPerHour) {
    rateBuckets.set(deviceId, bucket);
    return true;
  }
  bucket.push(now);
  rateBuckets.set(deviceId, bucket);
  if (rateBuckets.size > 5000) rateBuckets.clear(); // garde-fou mémoire
  return false;
}

// ----------------------------------------------------------------------------
// GESTIONNAIRE PRINCIPAL
// ----------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method === "GET") {
    return jsonResponse({ ok: true, service: "analyze-match", version: MODEL_VERSION });
  }
  if (req.method !== "POST") {
    return errorResponse("METHOD_NOT_ALLOWED", "Méthode non autorisée : utilisez POST.", 405);
  }

  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action ?? "analyze");

    if (action === "analyze") {
      const deviceId = String(body?.deviceId ?? "");
      if (!/^[a-zA-Z0-9-]{8,64}$/.test(deviceId)) {
        return errorResponse("INVALID_DEVICE", "Identifiant d'appareil invalide ou manquant.");
      }
      if (rateLimited(deviceId)) {
        return errorResponse("RATE_LIMITED", "Trop d'analyses demandées (60/heure max). Patientez un instant.", 429);
      }
      return await doAnalyze(body);
    }

    if (action === "history") {
      const deviceId = String(body?.deviceId ?? "");
      if (!/^[a-zA-Z0-9-]{8,64}$/.test(deviceId)) return errorResponse("INVALID_DEVICE", "Identifiant d'appareil invalide.");
      return await doHistory(deviceId);
    }

    if (action === "history-remove") {
      const deviceId = String(body?.deviceId ?? "");
      const cacheKey = String(body?.cacheKey ?? "");
      if (!/^[a-zA-Z0-9-]{8,64}$/.test(deviceId) || !/^[a-f0-9]{64}$/.test(cacheKey)) {
        return errorResponse("INVALID_INPUT", "Paramètres invalides.");
      }
      return await doHistoryRemove(deviceId, cacheKey);
    }

    if (action === "history-clear") {
      const deviceId = String(body?.deviceId ?? "");
      if (!/^[a-zA-Z0-9-]{8,64}$/.test(deviceId)) return errorResponse("INVALID_DEVICE", "Identifiant d'appareil invalide.");
      return await doHistoryClear(deviceId);
    }

    if (action === "reliability") {
      const deviceId = String(body?.deviceId ?? "");
      if (!/^[a-zA-Z0-9-]{8,64}$/.test(deviceId)) return errorResponse("INVALID_DEVICE", "Identifiant d'appareil invalide.");
      return await doReliability(deviceId);
    }

    if (action === "autocomplete") {
      const sport = String(body?.sport ?? "");
      if (!["football", "basketball", "tennis"].includes(sport)) {
        return errorResponse("INVALID_SPORT", "Sport non pris en charge.");
      }
      return await doAutocomplete(sport, String(body?.q ?? ""));
    }

    return errorResponse("UNKNOWN_ACTION", `Action inconnue : ${action}`);
  } catch (err) {
    log(`ERREUR : ${err}`);
    return errorResponse("INTERNAL", "Erreur interne du moteur d'analyse : " + String(err).slice(0, 200), 500);
  }
});

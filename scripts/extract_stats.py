#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
PronoScope — extract_stats.py
=============================
Script d'extraction de statistiques sportives SANS CLÉ API, à destination des
data scientists qui veulent étudier les données en local (backtesting,
vérification du modèle, recherche).

Bibliothèques open-source utilisées (dépôts GitHub publics) :
  • Football    : SoccerData  (https://github.com/probberechts/soccerdata)
                  -> scrape FBref / WhoScored, aucun compte requis.
  • Basketball  : basketball_reference_scraper
                  (https://github.com/vishaalagartha/basketball_reference_scraper)
                  -> calendriers et box scores Basketball Reference.
  • Tennis      : dépôts JeffSackmann/tennis_atp et tennis_wta
                  (https://github.com/JeffSackmann) — CSV directs, aucun scraping.

PRINCIPE D'HONNÊTETÉ : ce script n'invente JAMAIS de donnée. Si une source
échoue, il le signale et passe à la suite. Chaque fichier exporté contient
exactement ce que la source a fourni.

TEMPORISATION : chaque requête est espacée de time.sleep(...) avec jitter
aléatoire, pour éviter tout blocage d'IP (politique de politesse envers les
sites scrapés).

UTILISATION :
    pip install -r requirements.txt
    python extract_stats.py --sport all
    python extract_stats.py --sport football --leagues ENG-Premier_League ESP-La_Liga
    python extract_stats.py --sport basketball --seasons 2025 2026
    python extract_stats.py --sport tennis --seasons 2025 2026

Sortie : fichiers CSV dans ./exports/ (créé automatiquement).
"""

import argparse
import logging
import random
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

try:
    import pandas as pd
except ImportError:  # pragma: no cover
    print("ERREUR : pandas est requis.  pip install pandas")
    sys.exit(1)

# ----------------------------------------------------------------------------
# Configuration
# ----------------------------------------------------------------------------
EXPORTS_DIR = Path(__file__).parent / "exports"

OPENFOOTBALL_LEAGUES = {  # repli statique (JSON ouverts, aucun scraping)
    "ENG-Premier_League": "en.1",
    "ENG-Championship": "en.2",
    "ESP-La_Liga": "es.1",
    "ITA-Serie_A": "it.1",
    "GER-Bundesliga": "de.1",
    "FRA-Ligue_1": "fr.1",
    "POR-Primeira_Liga": "pt.1",
    "NED-Eredivisie": "nl.1",
}

SOCCERDATA_LEAGUES = list(OPENFOOTBALL_LEAGUES.keys())

NBA_CDN_SCHEDULE = "https://cdn.nba.com/static/json/staticData/scheduleLeagueV2.json"
SACKMANN_BASE = {
    "atp": "https://raw.githubusercontent.com/JeffSackmann/tennis_atp/master",
    "wta": "https://raw.githubusercontent.com/JeffSackmann/tennis_wta/master",
}

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-7s | %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("pronoscope")

# ----------------------------------------------------------------------------
# Outils de politesse (temporisation anti-blocage d'IP)
# ----------------------------------------------------------------------------

def polite_sleep(base: float = 3.0, jitter: float = 2.0, enabled: bool = True) -> None:
    """Pause entre deux requêtes : base + jitter aléatoire (évite les motifs
    réguliers détectables par les protections anti-scraping)."""
    if not enabled:
        return
    delay = base + random.uniform(0, jitter)
    log.info("   … temporisation %.1f s (anti-blocage IP)", delay)
    time.sleep(delay)

def retry(fn, tries: int = 3, backoff: float = 5.0, label: str = ""):
    """Réessaie une fonction en cas d'échec, avec délai croissant."""
    for attempt in range(1, tries + 1):
        try:
            return fn()
        except Exception as exc:  # noqa: BLE001
            log.warning("   échec %s (tentative %d/%d) : %s", label, attempt, tries, exc)
            if attempt == tries:
                raise
            time.sleep(backoff * attempt)

def save_csv(df: pd.DataFrame, name: str) -> Path:
    EXPORTS_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d")
    path = EXPORTS_DIR / f"{stamp}_{name}.csv"
    df.to_csv(path, index=False, encoding="utf-8")
    log.info("✔ export : %s (%d lignes)", path.name, len(df))
    return path

# ----------------------------------------------------------------------------
# FOOTBALL — SoccerData (FBref) avec repli statique openfootball
# ----------------------------------------------------------------------------

def extract_football(leagues: list[str], seasons: list[str], delay_enabled: bool) -> None:
    log.info("FOOTBALL — SoccerData (FBref) ; repli : openfootball/football.json")

    # --- 1) Tentative via SoccerData (scraping FBref, aucune clé) ----------
    try:
        import soccerdata as sd  # noqa: PLC0415
    except ImportError:
        log.warning("soccerdata non installé -> repli sur les JSON ouverts openfootball")
        _extract_football_openfootball(leagues, seasons, delay_enabled)
        return

    for league in leagues:
        sd_name = league.replace("_", " ")
        if sd_name not in SOCCERDATA_LEAGUES and sd_name not in [l.replace("_", " ") for l in SOCCERDATA_LEAGUES]:
            log.warning("Ligue inconnue de SoccerData : %s (ignorée)", league)
            continue
        for season in seasons:
            log.info("→ %s %s (FBref via SoccerData)", sd_name, season)
            try:
                def _fetch():
                    fbref = sd.FBref(leagues=[sd_name], seasons=[season])
                    return fbref.read_schedule()
                schedule = retry(_fetch, label=f"schedule {sd_name} {season}")
                if schedule is not None and len(schedule):
                    save_csv(schedule.reset_index(), f"football_{league}_{season}_calendrier")
                polite_sleep(4.0, 3.0, delay_enabled)
                try:
                    def _stats():
                        return fbref.read_team_season_stats(stat_type="schedule")
                    stats = retry(_stats, tries=2, label=f"stats {sd_name} {season}")
                    if stats is not None and len(stats):
                        save_csv(stats.reset_index(), f"football_{league}_{season}_stats_equipes")
                except Exception as exc:  # noqa: BLE001
                    log.warning("   stats équipe indisponibles pour %s %s : %s", sd_name, season, exc)
            except Exception as exc:  # noqa: BLE001
                log.error("   FBref indisponible pour %s %s : %s -> repli openfootball",
                          sd_name, season, exc)
                _extract_football_openfootball([league], [season], delay_enabled)
            polite_sleep(4.0, 3.0, delay_enabled)

def _extract_football_openfootball(leagues: list[str], seasons: list[str], delay_enabled: bool) -> None:
    """Repli : JSON statiques du dépôt openfootball/football.json (aucune clé,
    aucun scraping — mêmes sources que l'application web)."""
    import io
    import json
    import urllib.request

    def _norm(league_arg: str) -> str:
        direct = OPENFOOTBALL_LEAGUES.get(league_arg) or OPENFOOTBALL_LEAGUES.get(league_arg.replace(" ", "_"))
        return direct or league_arg

    for league in leagues:
        code = _norm(league)
        for season in seasons:
            # openfootball nomme ses saisons « 2024-25 » : convertir « 2025 » ou « 2425 »
            if "-" not in season and len(season) == 4:
                of_season = f"{season}-{int(season[2:]) + 1:02d}" if int(season[:2]) < 50 else None
                if of_season is None:
                    of_season = season
            elif len(season) == 4 and season.isdigit() and int(season[:2]) < 50:
                of_season = f"20{season[:2]}-{int(season[2:]) + 1:02d}"
            else:
                of_season = season
            url = f"https://raw.githubusercontent.com/openfootball/football.json/master/{of_season}/{code}.json"
            log.info("→ openfootball %s %s", code, of_season)
            try:
                def _fetch():
                    req = urllib.request.Request(url, headers={"User-Agent": "PronoScope/1.0"})
                    with urllib.request.urlopen(req, timeout=30) as resp:
                        return json.loads(resp.read().decode("utf-8"))
                data = retry(_fetch, label=f"openfootball {code} {of_season}")
                rows = []
                for m in data.get("matches", []):
                    t1 = m.get("team1", {}) if isinstance(m.get("team1"), dict) else {"name": m.get("team1")}
                    t2 = m.get("team2", {}) if isinstance(m.get("team2"), dict) else {"name": m.get("team2")}
                    ft = (m.get("score") or {}).get("ft")
                    rows.append({
                        "date": m.get("date"),
                        "round": m.get("round"),
                        "home_team": t1.get("name"),
                        "away_team": t2.get("name"),
                        "home_goals": ft[0] if ft else None,
                        "away_goals": ft[1] if ft else None,
                    })
                if rows:
                    save_csv(pd.DataFrame(rows), f"football_{code}_{of_season}_matchs")
                else:
                    log.warning("   fichier vide ou inexistant : %s", url)
            except Exception as exc:  # noqa: BLE001
                log.error("   échec %s : %s", url, exc)
            polite_sleep(2.0, 1.5, delay_enabled)

# ----------------------------------------------------------------------------
# BASKETBALL — basketball_reference_scraper avec repli CDN NBA
# ----------------------------------------------------------------------------

def extract_basketball(seasons: list[int], delay_enabled: bool) -> None:
    log.info("BASKETBALL — basketball_reference_scraper ; repli : CDN public NBA")

    try:
        from basketball_reference_scraper.seasons import get_schedule  # noqa: PLC0415
        bbr_available = True
    except ImportError:
        log.warning("basketball_reference_scraper non installé -> repli CDN NBA")
        bbr_available = False

    if bbr_available:
        for season in seasons:
            log.info("→ Basketball Reference, saison se terminant en %d", season)
            try:
                def _fetch():
                    return get_schedule(season_end_year=season)
                sched = retry(_fetch, label=f"schedule NBA {season}")
                if sched is not None and len(sched):
                    save_csv(sched, f"basketball_NBA_{season}_calendrier_bbr")
            except Exception as exc:  # noqa: BLE001
                log.error("   échec BBR saison %d : %s -> repli CDN NBA", season, exc)
            polite_sleep(4.0, 3.0, delay_enabled)

        # Box scores d'une date récente (exemple d'usage, optionnel)
        try:
            from basketball_reference_scraper.box_scores import get_box_scores  # noqa: PLC0415
            yesterday = datetime.now(timezone.utc).strftime("%Y-%m-%d")
            log.info("→ Box scores du %s (Basketball Reference)", yesterday)
            bs = retry(lambda: get_box_scores(yesterday), tries=2, label=f"boxscore {yesterday}")
            if isinstance(bs, dict):
                for team, df in bs.items():
                    if df is not None and len(df):
                        save_csv(df, f"basketball_boxscore_{yesterday}_{team.replace(' ', '_')}")
                    polite_sleep(3.0, 2.0, delay_enabled)
        except Exception as exc:  # noqa: BLE001
            log.warning("   box scores indisponibles : %s", exc)

    # --- Repli / complément : CDN officiel NBA (les mêmes données que l'app) ---
    try:
        import json as _json
        import urllib.request
        log.info("→ CDN NBA : calendrier complet de la saison en cours")
        def _fetch():
            req = urllib.request.Request(NBA_CDN_SCHEDULE, headers={"User-Agent": "PronoScope/1.0"})
            with urllib.request.urlopen(req, timeout=60) as resp:
                return _json.loads(resp.read().decode("utf-8"))
        data = retry(_fetch, label="CDN NBA")
        rows = []
        for gd in data.get("leagueSchedule", {}).get("gameDates", []):
            for g in gd.get("games", []):
                home, away = g.get("homeTeam", {}), g.get("awayTeam", {})
                rows.append({
                    "game_id": g.get("gameId"),
                    "date_utc": g.get("gameTimeUTC"),
                    "home_team": f"{home.get('teamCity', '')} {home.get('teamName', '')}".strip(),
                    "away_team": f"{away.get('teamCity', '')} {away.get('teamName', '')}".strip(),
                    "home_score": home.get("score"),
                    "away_score": away.get("score"),
                    "status": g.get("gameStatusText"),
                })
        if rows:
            save_csv(pd.DataFrame(rows), "basketball_NBA_saison_courante_cdn")
    except Exception as exc:  # noqa: BLE001
        log.error("   échec CDN NBA : %s", exc)

# ----------------------------------------------------------------------------
# TENNIS — dépôts JeffSackmann (CSV directs, aucun scraping)
# ----------------------------------------------------------------------------

def extract_tennis(years: list[int], delay_enabled: bool) -> None:
    log.info("TENNIS — JeffSackmann/tennis_atp + tennis_wta (CSV publics)")

    for tour, base in SACKMANN_BASE.items():
        # 1) Historique des matchs
        for year in years:
            url = f"{base}/{tour}_matches_{year}.csv"
            log.info("→ %s", url)
            try:
                def _fetch(u=url):
                    return pd.read_csv(u, low_memory=False)
                df = retry(_fetch, tries=2, label=f"{tour} {year}")
                if df is not None and len(df):
                    save_csv(df, f"tennis_{tour}_matchs_{year}")
            except Exception as exc:  # noqa: BLE001
                log.error("   échec : %s", exc)
            polite_sleep(2.0, 1.5, delay_enabled)

        # 2) Classement courant + fiches joueuses
        for suffix in ("rankings_current", "players"):
            url = f"{base}/{tour}_{suffix}.csv"
            log.info("→ %s", url)
            try:
                def _fetch(u=url):
                    return pd.read_csv(u, low_memory=False)
                df = retry(_fetch, tries=2, label=f"{tour} {suffix}")
                if df is not None and len(df):
                    save_csv(df, f"tennis_{tour}_{suffix}")
            except Exception as exc:  # noqa: BLE001
                log.error("   échec : %s", exc)
            polite_sleep(2.0, 1.5, delay_enabled)

    # 3) Agrégats service/retour (calcul local, aucune invention : uniquement
    #    à partir des colonnes réellement présentes dans les CSV)
    log.info("→ Calcul des agrégats service/retour par joueuse")
    try:
        frames = []
        for tour, base in SACKMANN_BASE.items():
            for year in years:
                url = f"{base}/{tour}_matches_{year}.csv"
                try:
                    df = pd.read_csv(url, low_memory=False)
                    df["tour"] = tour
                    frames.append(df)
                except Exception:  # noqa: BLE001
                    continue
        if frames:
            allm = pd.concat(frames, ignore_index=True)
            needed = ["winner_name", "loser_name", "w_svpt", "w_1stWon", "w_2ndWon",
                      "l_svpts" if "l_svpts" in allm.columns else "l_svpt",
                      "l_1stWon", "l_2ndWon"]
            if all(c in allm.columns for c in ["w_svpt", "l_svpt"]):
                for col in ["w_svpt", "w_1stWon", "w_2ndWon", "l_svpt", "l_1stWon", "l_2ndWon"]:
                    allm[col] = pd.to_numeric(allm[col], errors="coerce")
                allm = allm.dropna(subset=["w_svpt", "l_svpt"])

                def _srv_stats(group: pd.DataFrame, wcol: bool) -> dict:
                    pre = "w" if wcol else "l"
                    return {
                        "matches": len(group),
                        "srv_pts": group[f"{pre}_svpt"].sum(),
                        "srv_pts_won": (group[f"{pre}_1stWon"] + group[f"{pre}_2ndWon"]).sum(),
                    }

                winners = allm.groupby("winner_name").apply(
                    lambda g: pd.Series(_srv_stats(g, True)), include_groups=False
                ).reset_index().rename(columns={"winner_name": "player"})
                losers = allm.groupby("loser_name").apply(
                    lambda g: pd.Series(_srv_stats(g, False)), include_groups=False
                ).reset_index().rename(columns={"loser_name": "player"})
                agg = winners.merge(losers, on="player", how="outer", suffixes=("_gagne", "_perdu")).fillna(0)
                agg["matches_total"] = agg["matches_gagne"] + agg["matches_perdu"]
                agg["srv_pct"] = (agg["srv_pts_won_gagne"] + agg["srv_pts_won_perdu"]) / \
                                 (agg["srv_pts_gagne"] + agg["srv_pts_perdu"])
                agg["pct_victoires"] = agg["matches_gagne"] / agg["matches_total"]
                out = agg[["player", "matches_total", "srv_pct", "pct_victoires"]].sort_values("matches_total", ascending=False)
                save_csv(out, "tennis_agregats_service_retour")
            else:
                log.warning("   colonnes de service absentes : agrégat ignoré")
    except Exception as exc:  # noqa: BLE001
        log.error("   échec agrégats : %s", exc)

# ----------------------------------------------------------------------------
# Point d'entrée
# ----------------------------------------------------------------------------

def main() -> int:
    parser = argparse.ArgumentParser(
        description="PronoScope — extraction de statistiques sportives sans clé API.",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument("--sport", choices=["all", "football", "basketball", "tennis"], default="all")
    parser.add_argument("--leagues", nargs="*", default=["ENG-Premier_League", "ESP-La_Liga", "GER-Bundesliga", "ITA-Serie_A", "FRA-Ligue_1"],
                        help="Lignes SoccerData pour le football (séparées par des espaces)")
    parser.add_argument("--seasons", nargs="*", default=None,
                        help="Saisons : football « 2025-26 », basket/tennis « 2025 ». Défaut : saison en cours.")
    parser.add_argument("--out", default=str(EXPORTS_DIR), help="Dossier de sortie des CSV")
    parser.add_argument("--delay", type=float, default=3.0, help="Temporisation de base entre requêtes (secondes)")
    parser.add_argument("--no-jitter", action="store_true", help="Désactive le jitter aléatoire (déconseillé)")
    args = parser.parse_args()

    global EXPORTS_DIR
    EXPORTS_DIR = Path(args.out)

    now = datetime.now(timezone.utc)
    default_team_season = f"{now.year}-{(now.year + 1) % 100:02d}" if now.month >= 7 else f"{now.year - 1}-{now.year % 100:02d}"
    default_year_season = now.year if now.month >= 7 else now.year - 1

    if args.seasons:
        football_seasons = [s for s in args.seasons if "-" in s] or [default_team_season]
        year_seasons = [int(s) for s in args.seasons if s.isdigit()] or [default_year_season]
    else:
        football_seasons = [default_team_season]
        year_seasons = [default_year_season]

    delay_enabled = True
    log.info("PronoScope extract_stats — %s | saisons football=%s, basket/tennis=%s",
             args.sport, football_seasons, year_seasons)

    try:
        if args.sport in ("all", "football"):
            extract_football(args.leagues, football_seasons, delay_enabled)
        if args.sport in ("all", "basketball"):
            extract_basketball(year_seasons, delay_enabled)
        if args.sport in ("all", "tennis"):
            extract_tennis(year_seasons, delay_enabled)
    except KeyboardInterrupt:
        log.warning("Interrompu par l'utilisateur (Ctrl+C)")
        return 130

    log.info("Terminé. Fichiers CSV dans : %s", EXPORTS_DIR.resolve())
    return 0

if __name__ == "__main__":
    sys.exit(main())

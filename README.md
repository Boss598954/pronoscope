# 🔮 PronoScope — L'observatoire statistique du sport

Application web complète de **suivi sportif et d'analyse prédictive de matchs** (football, basketball, tennis),
construite sur des **données publiques ouvertes** : aucune clé API, aucun service payant.

- **Frontend** : React 18 + Vite (application monopage, thème sombre premium + mode clair)
- **Backend** : Supabase — PostgreSQL + Edge Functions (Deno)
- **Hébergement** : Netlify, relié à votre dépôt GitHub (déploiement automatique)
- **Langue** : français, de bout en bout

> ⚠️ **Nouveau ici ?** Ouvrez **`GUIDE-DEPLOIEMENT.md`** : un guide pas à pas pour tout mettre en ligne
> sans jamais toucher à un terminal. Comptez ~30 minutes.

---

## ✨ Fonctionnalités

### Fenêtre 1 — Accueil / Tableau de bord
Sélecteur de sport en grandes tuiles animées (⚽🏀🎾), compteurs animés (matchs chargés, championnats suivis,
analyses en cache, dernière synchronisation), ticker défilant des prochains matchs, résumé du jour avec affiches
marquantes, et carte de première synchronisation si la base est vide.

### Fenêtre 2 — Calendrier
Tous les matchs à venir et récents, **regroupés par compétition puis par date**. Filtres : dates rapides
(aujourd'hui / demain / 7 jours) via l'icône calendrier, championnat via l'icône trophée (liste déroulante **avec
recherche**), et par sport. Écussons avec **repli automatique sur monogramme coloré déterministe** quand le logo
n'existe pas dans les sources. Étiquettes automatiques calculées à partir des classements réels :
**Derby**, **Choc du haut de tableau**, **Lutte pour le maintien**, **Enjeu européen**, **Sans enjeu apparent**
(+ **Enjeu play-in** en NBA, **Affiche du tournoi** au tennis). Si la donnée manque, aucune étiquette n'est inventée.

### Fenêtre 3 — Analyse (le cœur)
Analyse d'un **match du calendrier** ou **saisie libre** de deux équipes/joueurs avec autocomplétion.
Moteur de calcul **côté serveur** (Edge Function) :

| Sport | Modèle |
|---|---|
| ⚽ Football | Poisson bivarié + correction **Dixon-Coles** (ρ = −0,08), intensités domicile/extérieur pondérées par récence, rétrécissement bayésien vers la moyenne du championnat |
| 🏀 Basketball | **Loi normale** des points (moyennes pondérées, écarts-types mesurés, avantage du terrain mesuré sur données réelles) |
| 🎾 Tennis | **Modèle Elo** (classements officiels ESPN + forme et face-à-face accumulés en base), scores en sets par formule exacte |

Marchés calculés : **1, X, 2, 1X, X2, 12, BTTS, totaux plus/moins** (1,5/2,5/3,5 buts ; ligne NBA ; total de jeux
au tennis quand l'historique le permet) et **score exact cohérent avec le total**. Cartons, corners, fautes et tirs
cadrés : affichés **« donnée non disponible »** car les sources ouvertes ne les couvrent pas — jamais inventés.

Affichage : **bandeau verdict** (marché conseillé, score exact probable, **jauge de confiance circulaire animée**
avec niveau élevé/moyen/faible) → texte d'analyse détaillé → **jauges horizontales comparatives animées** + radar →
matrice des scores exacts (football), courbe normale du total (basketball), scores en sets (tennis) → **bloc sources**
(dépôts utilisés, nombre de matchs historiques, notes de transparence). Copie et partage du résumé en un clic.

**Cache en base** : une analyse déjà calculée est réaffichée **à l'identique**, jamais recalculée.

### Fenêtre 4 — Historique
Onglets **« Mes analyses »** / **« Résultats des matchs »**, limités aux **48 dernières heures** avec purge
automatique. Historique scopé par **identifiant d'appareil anonyme** (généré et stocké côté navigateur, transmis à
chaque requête) : aucun compte, aucune donnée personnelle.

### Fenêtre 5 — Historique de fiabilité
Pour chaque analyse dont le match s'est terminé : **comparaison pronostic / résultat réel**, taux de réussite global
et **par marché**, **courbe d'évolution** du taux cumulé, détail match par match avec **pastilles vertes/rouges**,
série en cours, niveaux de progression (Novice → Maître Oracle) et statistiques communauté. Les échecs sont affichés
aussi honnêtement que les réussites ; les analyses rétrospectives (match déjà terminé) et en saisie libre sont
exclues du suivi : aucune triche possible.

### Design
Thème **sombre premium** avec bascule **mode clair** (persistée), dégradés violet/bleu électrique/cyan,
**glassmorphism**, arrière-plan animé (canvas), animations au scroll et au clic (ripple), jauges et compteurs
animés, écran de chargement à **progression réelle**, typographie Google Fonts (Space Grotesk / Inter / JetBrains
Mono), icônes **SVG inline** (~30 icônes, zéro dépendance), PWA installable, raccourcis clavier 1-5,
sons discrets optionnels (WebAudio), et **easter egg** après 5 clics rapides sur le logo 🧙.

---

## 🏗️ Architecture

```
pronoscope/
├── index.html                    # Coquille + écran d'amorçage + polices
├── netlify.toml                  # Build + redirections SPA + en-têtes
├── package.json                  # Dépendances (React, router, supabase-js, Vite)
├── .env.example                  # Variables d'environnement à renseigner
├── public/                       # favicon SVG + manifeste PWA
├── scripts/
│   ├── extract_stats.py          # Script Python d'extraction (SoccerData, BBR, CSV)
│   └── requirements.txt
├── supabase/
│   ├── migrations/
│   │   └── 001_schema.sql        # Tables, index, RLS, triggers (à coller dans l'éditeur SQL)
│   └── functions/
│       ├── daily-refresh/        # Edge Function planifiée (ETL quotidien + fiabilité + purge)
│       └── analyze-match/        # Edge Function d'analyse à la demande (modèles + cache)
└── src/
    ├── main.jsx / App.jsx        # Coquille, routes, chargement, thème, ripple
    ├── config.js                 # Constantes (sports, compétitions, étiquettes, avertissement)
    ├── lib/                      # supabase.js, api.js, format.js, sound.js
    ├── hooks/                    # useTheme, useCountUp, useReveal
    ├── styles/                   # base / components / animations / pages (CSS pur)
    ├── components/               # ui/, dashboard/, calendar/, analysis/…
    └── pages/                    # Dashboard, CalendarPage, AnalysisPage, History, Reliability
```

**Flux de données** : le cron quotidien (23 h 00 UTC = 00 h 00 UTC+1) télécharge les sources, agrège les
statistiques et les stocke ; l'application ne lit ensuite que la base (rapide, sans CORS) ; l'analyse lit les
agrégats en base, calcule, met en cache. La fiabilité est évaluée quand les matchs se terminent.

---

## 📚 Sources de données (gratuites, sans clé)

| Sport | Source | Usage |
|---|---|---|
| ⚽ | [openfootball/football.json](https://github.com/openfootball/football.json) | Calendriers + résultats de 8 championnats (PL, Championship, LaLiga, Serie A, Bundesliga, Ligue 1, Liga Portugal, Eredivisie), saison en cours + précédente |
| 🏀 | [ESPN — API publique NBA](https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard) | Résultats et calendrier NBA (fenêtre glissante 21 j passés / 7 j à venir) |
| 🏀 | [NBA.com — CDN public](https://cdn.nba.com/static/json/staticData/scheduleLeagueV2.json) | Calendrier complet de la saison (enrichissement opportuniste, peut être bloqué selon IP) |
| 🎾 | [ESPN — API publique tennis](https://site.api.espn.com/apis/site/v2/sports/tennis/atp/scoreboard) | Calendrier, résultats et scores des matchs ATP/WTA |
| 🎾 | [ESPN — classements ATP/WTA](https://site.web.api.espn.com/apis/site/v2/sports/tennis/atp/rankings) | Classements officiels (top 150), base du modèle Elo |

> **Note d'honnêteté (2026)** : le cahier des charges initial mentionnait les dépôts
> `JeffSackmann/tennis_atp` et `tennis_wta`. Ces dépôts ont été **supprimés de GitHub** (404 vérifié
> en septembre 2026). Le modèle tennis a donc été repensé autour des classements ESPN et d'un historique
> accumulé en base — sans jamais inventer de statistique. Le script Python conserve d'ailleurs le
> support de ces CSV s'ils réapparaissent (source configurable).

Aucune clé API n'est requise. Les données sont récupérées **côté serveur** (Edge Functions) : pas de souci de
CORS, et mise en cache partagée pour tous les visiteurs.

---

## 🧪 Script Python d'extraction (data scientists)

`scripts/extract_stats.py` extrait les dernières statistiques en local (backtesting, recherche) à l'aide de
bibliothèques open-source, **sans clé API**, avec temporisation `time.sleep` + jitter contre le blocage d'IP :

```bash
pip install -r scripts/requirements.txt
python scripts/extract_stats.py --sport all
python scripts/extract_stats.py --sport football --leagues ENG-Premier_League ESP-La_Liga
python scripts/extract_stats.py --sport basketball --seasons 2026
python scripts/extract_stats.py --sport tennis --seasons 2026
```

- Football : **SoccerData** (scraping FBref) — repli automatique sur les JSON ouverts openfootball
- Basketball : **basketball_reference_scraper** — repli sur le CDN public NBA
- Tennis : CSV JeffSackmann en accès direct (pandas) quand ils sont disponibles
- Sortie : fichiers CSV horodatés dans `scripts/exports/`

---

## 🔒 Sécurité

- Row Level Security activée sur toutes les tables ; lecture publique uniquement pour les données affichables
- `device_analyses` et `reliability` totalement fermées au public (accès via Edge Functions uniquement)
- La clé `service_role` ne quitte jamais le serveur (injectée automatiquement par Supabase)
- Identifiant d'appareil anonyme (UUID navigateur) — aucune donnée personnelle collectée
- Limitation de débit : 60 analyses/heure par appareil ; 1 rafraîchissement complet / 2 h (`force` réservé au
  cron ou à la toute première synchronisation)

## 🛠️ Développement local

```bash
npm install
cp .env.example .env   # renseigner VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY
npm run dev            # http://localhost:5173
npm run build          # build de production dans dist/
```

## ⚖️ Avertissement

PronoScope fournit des analyses statistiques à but informatif. Les probabilités ne sont pas des certitudes :
aucune garantie de gain n'existe. Jouez responsable — le jeu comporte des risques. Pour être aidé :
09 74 75 13 13 (appel non surtaxé). Interdit aux mineurs.

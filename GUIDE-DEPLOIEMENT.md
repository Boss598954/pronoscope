# 🚀 GUIDE DE DÉPLOIEMENT — PronoScope pour débutant complet

> **Objectif** : mettre PronoScope en ligne, gratuitement, **sans jamais taper une seule ligne de commande**.
> Tout se fait en cliquant sur des sites web : GitHub, Supabase et Netlify.
> Durée totale : environ 30 minutes. Coût total : **0 €**.
>
> En cas de blocage, chaque partie contient une section « 🆘 Problème ? ».

### Les mots techniques, expliqués en une phrase

- **GitHub** : un site qui stocke les fichiers d'un projet (le « dépôt ») et garde leur historique.
- **Supabase** : un service qui héberge la base de données (le « garage » où rangent les matchs et analyses) et de petites fonctions serveur (« Edge Functions » : des programmes qui tournent chez Supabase).
- **Netlify** : un site qui transforme les fichiers du projet en site web visitable et lui donne une adresse.
- **Une table** : un grand tableau dans la base de données (ex. la liste des matchs).
- **Le SQL** : le langage qui permet de créer ces tables ; ici, vous n'aurez qu'à **copier-coller** un script déjà écrit.
- **Un déploiement** : l'action de publier une nouvelle version du site.
- **Une variable d'environnement** : un réglage secret collé dans un tableau de bord (ex. l'adresse de votre base).

---

## Étape 1 — Créer un compte GitHub et un dépôt

1. Ouvrez **https://github.com** dans votre navigateur.
2. Cliquez sur le bouton **« Sign up »** (en haut à droite).
3. Remplissez : adresse e-mail, mot de passe, nom d'utilisateur (ex. `jean_dupont`), puis cliquez **« Continue »** à chaque écran. Résolvez la petite énigme de vérification, allez valider l'e-mail reçu, et connectez-vous.
4. Une fois connecté, cliquez sur le **« + » en haut à droite** de n'importe quelle page GitHub, puis **« New repository »** (un « dépôt » = le dossier qui contiendra tous les fichiers du site).
5. Dans le formulaire :
   - **Repository name** : tapez `pronoscope` (ou le nom que vous voulez, sans accents ni espaces).
   - Laissez **« Public »** sélectionné (obligatoire pour le plan gratuit de Netlify).
   - ❌ **Ne cochez AUCUNE case** en bas (pas de README, pas de .gitignore, pas de licence — les fichiers fournis remplacent tout ça).
6. Cliquez sur le bouton vert **« Create repository »**.
7. GitHub affiche une page « Quick setup ». **Laissez-la ouverte**, on va y déposer les fichiers juste après.

> 🆘 **Problème ?** Si la page demande de « vérifier votre appareil », suivez le lien envoyé par e-mail.

---

## Étape 2 — Déposer les fichiers par glisser-déposer

1. Ouvrez l'explorateur de fichiers de votre ordinateur et allez dans le **dossier décompressé du projet PronoScope** (celui qui contient `index.html`, `package.json`, le dossier `src`, le dossier `supabase`, etc.).
2. **Important** : si vous voyez un dossier `node_modules` ou `dist`, **ne le transférez pas** (ce sont des fichiers techniques locaux, inutiles sur GitHub). Tout le reste est à envoyer.
3. Revenez sur la page GitHub « Quick setup » ouverte à l'étape 1. Cliquez sur le lien **« uploading an existing file »** (au milieu de la page).
4. La page devient une zone de dépôt. **Sélectionnez TOUS les fichiers et dossiers du projet** dans votre explorateur (sauf `node_modules` et `dist`) et **glissez-les dans la zone grise** de GitHub.
   - ✅ À déposer : `index.html`, `package.json`, `package-lock.json`, `netlify.toml`, `.env.example`, `.gitignore`, `README.md`, `GUIDE-DEPLOIEMENT.md`, et les dossiers `public/`, `scripts/`, `src/`, `supabase/`.
   - ⚠️ Les fichiers commençant par un point (`.gitignore`, `.env.example`) peuvent être cachés par votre explorateur : dans Windows, onglet « Affichage » → cocher « Éléments masqués » ; sur Mac, raccourci `Cmd + Maj + .`.
   - 💡 Si le glisser-déposer des dossiers ne fonctionne pas d'un coup, déposez les fichiers et dossiers en 2 ou 3 fournées — GitHub accepte plusieurs dépôts successifs.
5. Attendez la fin du traitement (les noms de fichiers apparaissent en liste). En bas de page, dans le champ **« Commit changes »**, laissez le texte proposé et cliquez sur le bouton vert **« Commit changes »**.
6. GitHub affiche maintenant votre dépôt avec tous les fichiers. **C'est rangé.**

> 🆘 **Problème ?** « This file is empty » : un fichier vide a été glissé, retirez-le de la sélection. Rien n'apparaît : rechargez la page et recommencez — pensez à bien être sur l'onglet « uploading an existing file ».

---

## Étape 3 — Créer la base de données Supabase

1. Ouvrez **https://supabase.com** et cliquez sur **« Start your project »** puis **« Sign up »** (la création de compte est gratuite ; vous pouvez vous inscrire avec GitHub pour gagner du temps en cliquant sur « Continue with GitHub »).
2. Une fois connecté, vous arrivez sur la liste de vos projets. Cliquez sur **« New project »** (bouton vert, en haut à droite).
3. Remplissez le formulaire :
   - **Name** : `pronoscope` (ou ce que vous voulez).
   - **Database Password** : cliquez sur **« Generate a password »** et **copiez-collez ce mot de passe dans un coin** (il n'est plus affiché ensuite, mais vous n'en aurez pas besoin pour ce guide — pas de panique si vous le perdez).
   - **Region** : choisissez **« West Europe (Paris) »** pour être proche de la France.
   - **Plan** : laissez **Free**.
4. Cliquez sur **« Create new project »** et patientez 1 à 2 minutes (la barre « Setting up your project » tourne).
5. Une fois le projet prêt, dans la colonne de gauche (icônes verticales), cliquez sur l'icône **« SQL Editor »** (représentée par un petit terminal `>_`, vers le milieu de la colonne).
   - 📍 *Où c'est :* barre verticale sombre à gauche de l'écran ; survolez les icônes pour voir leur nom ; celle cherchée s'appelle « SQL Editor ».
6. Cliquez sur **« + New query »** (ou « New snippet » selon la version).
7. Ouvrez le fichier **`supabase/migrations/001_schema.sql`** du projet avec n'importe quel éditeur de texte (Bloc-notes, TextEdit…), **sélectionnez tout** (Ctrl+A / Cmd+A), **copiez** (Ctrl+C / Cmd+C), puis **collez tout dans la grande zone blanche** de l'éditeur SQL Supabase (Ctrl+V / Cmd+V).
8. Cliquez sur le bouton **« Run »** (ou « Exécuter », en bas à droite, parfois accessible via Ctrl+Entrée).
9. Vous devez voir un message de réussite du type **« Success. No rows returned »** : les 7 tables sont créées. ✅
10. **Récupérez vos deux clés** : dans la colonne de gauche, cliquez sur l'icône d'**engrenage « Project Settings »** (en bas), puis dans le menu qui s'affiche sur **« API »**. Repérez :
    - **Project URL** : une adresse du type `https://abcdefghijk.supabase.co` → copiez-la quelque part.
    - **anon public** (dans « Project API keys ») : une longue clé commençant par `eyJ...` → copiez-la aussi.
    - ⚠️ Ne copiez JAMAIS la clé **service_role** dans Netlify ou dans GitHub : elle reste côté Supabase (elle est déjà injectée automatiquement dans les Edge Functions).

> 🆘 **Problème ?** « syntax error » : une partie du script n'a pas été copiée — videz l'éditeur et re-collez la TOTALITÉ du fichier. « permission denied » : vérifiez que vous êtes bien connecté au bon projet.

---

## Étape 4 — Créer et planifier les Edge Functions

### 4a. Créer la fonction d'analyse (`analyze-match`)

1. Toujours dans Supabase, colonne de gauche : cliquez sur l'icône **« Edge Functions »** (représentée par un éclair ⚡ ou une fonction `ƒx`, selon la version).
2. Cliquez sur le bouton **« Create a function »** (en haut à droite).
3. Dans la fenêtre qui s'ouvre :
   - **Name** : tapez exactement `analyze-match` (sans espaces, tout en minuscules).
   - Si une case **« Verify JWT with this function »** apparaît : **décochez-la** (notre application fonctionne sans compte utilisateur ; la protection se fait par appareil et par limitations intégrées).
4. Un **éditeur de code** s'affiche avec du contenu d'exemple. **Sélectionnez tout ce contenu et supprimez-le.**
5. Ouvrez le fichier **`supabase/functions/analyze-match/index.ts`** du projet, copiez **l'intégralité** de son contenu, et collez-le dans l'éditeur Supabase.
6. Cliquez sur **« Deploy »** (bouton vert, en haut à droite de l'éditeur). Patientez quelques secondes jusqu'au message de succès.

### 4b. Créer la fonction de rafraîchissement (`daily-refresh`)

1. Revenez à la liste des Edge Functions, cliquez encore sur **« Create a function »**.
2. **Name** : `daily-refresh`. Décochez « Verify JWT » si proposé.
3. Videz l'éditeur, collez le contenu intégral de **`supabase/functions/daily-refresh/index.ts`**, puis **« Deploy »**.

### 4c. Planifier le rafraîchissement quotidien (00 h 00 UTC+1)

**Méthode recommandée (interface Supabase)** :

1. Dans la liste des Edge Functions, **cliquez sur `daily-refresh`** pour ouvrir son panneau de détail.
2. Cherchez l'onglet ou la section **« Schedules »** (ou « Planification »/« Cron » — l'interface évolue, le mot « schedule » est le repère). Cliquez sur **« Add schedule »** / « Create schedule ».
3. Remplissez :
   - Un nom libre, par ex. `rafraichissement-quotidien`.
   - La périodicité : choisissez **l'option cron / personnalisée** et tapez exactement : **`0 23 * * *`**
   - Explication : les planificateurs fonctionnent en heure universelle (UTC) ; 23 h 00 UTC = **minuit en heure d'hiver française (UTC+1)**, le créneau demandé.
4. Validez (**« Create »**). C'est en place : chaque nuit, la fonction téléchargera calendriers, résultats, classements, calculera les étiquettes, évaluera la fiabilité et purgera les données de plus de 48 h.

**Méthode de repli (si votre interface ne propose pas de bouton « Schedules »)** :

1. Allez dans **« Project Settings » → « API »** et copiez votre **Project URL** et votre clé **service_role** (celle-ci sert uniquement ici, elle ne quitte pas Supabase).
2. Retournez dans le **SQL Editor** → **« + New query »**.
3. Activez les deux extensions requises : dans la colonne de gauche, ouvrez **« Database » → « Extensions »**, cherchez **`pg_cron`** → basculez sur **« Active »**, puis **`pgnet`** (ou `pg_net`) → **« Active »**.
4. Dans l'éditeur SQL, collez le bloc ci-dessous en remplaçant les deux valeurs entre `< >` (sans les chevrons) par les vôtres, puis **« Run »** :

```sql
select cron.schedule('pronoscope-quotidien', '0 23 * * *', $$
  select net.http_post(
    url := 'https://<VOTRE-REF-PROJET>.supabase.co/functions/v1/daily-refresh',
    headers := '{"Content-Type": "application/json",
                "Authorization": "Bearer <VOTRE-CLE-SERVICE-ROLE>"}'::jsonb,
    body := '{}'::jsonb
  );
$$);
```

> 🆘 **Problème ?** « Function not found » au déploiement : vérifiez l'orthographe exacte des noms. Pour vérifier que le planning est actif : Database → Extensions → pg_cron est actif, et en SQL `select * from cron.job;` doit afficher votre tâche.

---

## Étape 5 — Déployer le site sur Netlify

1. Ouvrez **https://www.netlify.com** et cliquez sur **« Sign up »** → choisissez **« Sign up with GitHub »** (le plus simple : Netlify aura directement accès au dépôt créé à l'étape 1). Autorisez l'accès quand GitHub vous le demande.
2. Une fois connecté au tableau de bord Netlify, cliquez sur **« Add new site »** (bouton vert, en haut à droite) puis **« Import an existing project »**.
3. Cliquez sur **« GitHub »** dans la liste des fournisseurs. Si demandé, cliquez sur **« Configure Netlify on GitHub »** et accordez la permission sur votre dépôt `pronoscope`.
4. Netlify vous propose la liste de vos dépôts : **cliquez sur `pronoscope`**.
5. Sur la page de configuration :
   - **Branch to deploy** : laissez `main`.
   - **Build command** : `npm run build` (souvent pré-rempli grâce au fichier `netlify.toml`).
   - **Publish directory** : `dist` (idem).
   - ⚠️ **Ne cliquez pas tout de suite sur « Deploy »** : dépliez d'abord la section **« Environment variables »** (variables d'environnement) et ajoutez les DEUX clés copiées à l'étape 3 :
     - Cliquez **« Add a variable »** → clé : `VITE_SUPABASE_URL` → valeur : votre Project URL (`https://xxxx.supabase.co`).
     - **« Add a variable »** à nouveau → clé : `VITE_SUPABASE_ANON_KEY` → valeur : votre clé `eyJ...` (anon public).
6. Cliquez maintenant sur le bouton **« Deploy »** (ou « Deploy pronoscope »).
7. Patientez 1 à 3 minutes : Netlify installe les dépendances et construit le site (suivez la progression dans le « deploy log »). Le statut passe à **« Published »** ✅.

> 🆘 **Problème ?** « Build failed » avec une erreur `VITE_SUPABASE_URL is not defined` : vous avez oublié les variables d'environnement → Site settings → Environment variables → ajoutez-les → onglet « Deploys » → « Trigger deploy » → « Clear cache and deploy site ». Autre erreur : vérifiez que `package.json` a bien été déposé sur GitHub.

---

## Étape 6 — Récupérer le lien du site et lancer la première synchronisation

1. Sur la page du site Netlify, en haut, cliquez sur l'**adresse du site** (du type `https://pronoscope-xxxx.netlify.app`). Le site s'ouvre dans un nouvel onglet : **c'est votre lien à partager** ! 🎉
2. Vous pouvez renommer cette adresse : **Site settings → Domain management → Change site name**.
3. **Première visite** : l'écran de chargement démarre, puis l'accueil s'affiche. Comme la base est encore vide, une carte **« Première synchronisation requise »** est proposée : cliquez sur **« Synchroniser maintenant »** et patientez 30 à 90 secondes (les sources publiques sont téléchargées dans votre base : openfootball, ESPN, NBA).
4. La page se met à jour : les compteurs montent, le calendrier se remplit, et vous pouvez lancer votre première analyse ! 🔮
5. Chaque nuit à minuit, le rafraîchissement se fera tout seul (étape 4c).

> 🆘 **Le site affiche « Configuration requise »** : les variables Netlify sont absidentes ou mal orthographiées — elles doivent s'appeler EXACTEMENT `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY`. Corrigez puis « Trigger deploy ».
> 🆘 **La synchronisation échoue** : vérifiez dans Supabase → Edge Functions → daily-refresh → « Logs » (journaux) ce qui s'est passé ; le bloc SQL de l'étape 3 a-t-il bien été exécuté ? Les deux fonctions sont-elles déployées ?

---

## Étape 7 — Faire une mise à jour plus tard

**Ce qui se met à jour TOUT SEUL** :
- Les **données** (matchs, résultats, classements, statistiques, fiabilité) : rafraîchies chaque nuit par la fonction planifiée, sans aucune action.
- Les **résultats et étiquettes** des matchs déjà en base.

**Ce qu'il faut refaire quand vous MODIFIEZ LE CODE du projet** :

| Ce qui change | Quoi faire |
|---|---|
| Fichiers du site (dossier `src/`, `index.html`, `package.json`…) | Glissez les nouveaux fichiers sur GitHub (étape 2 : bouton « Add file » → « Upload files » → commit). Netlify reconstruit et publie **automatiquement** 1 à 3 min après. Rien d'autre à faire. |
| Le script SQL (`001_schema.sql`) | Copiez-coller la partie modifiée dans le SQL Editor de Supabase (étape 3.7-3.8). |
| Une Edge Function | Collez le nouveau contenu dans l'éditeur de la fonction (étapes 4a/4b) puis « Deploy ». La planification est conservée. |
| Les variables d'environnement | Site settings → Environment variables → modifier → « Trigger deploy ». |

> 💡 Astuce : gardez le fichier `GUIDE-DEPLOIEMENT.md` dans le dépôt, il sert d'aide-mémoire.

---

## 🧭 Récapitulatif express (pour plus tard)

1. **GitHub** : dépôt `pronoscope` avec tous les fichiers (étape 1-2).
2. **Supabase** : projet + script SQL collé (étape 3) + 2 fonctions déployées + 1 planification `0 23 * * *` (étape 4).
3. **Netlify** : site importé depuis GitHub + 2 variables d'environnement (étape 5).
4. Première synchro depuis l'accueil (étape 6), et tout roule tout seul.

**Coût : 0 €** (plans gratuits GitHub / Supabase / Netlify, sources de données publiques sans clé API).

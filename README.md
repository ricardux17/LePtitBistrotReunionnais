# Le P'tit Bistro Réunionnais

Site vitrine pour un restaurant réunionnais (Saint-Paul, La Réunion) : présentation, carte détaillée (nourriture et boissons séparées), réservation en ligne avec horaires de service, et un espace d'administration pour tout gérer sans toucher au code.

## Stack technique

- **Backend** : Node.js + Express, déployé sur **Vercel** (fonction serverless)
- **Stockage des données** : Redis (via [Upstash](https://upstash.com), utilisé comme "Vercel KV") — menu, réservations, réglages
- **Stockage des photos** : [Vercel Blob](https://vercel.com/docs/storage/vercel-blob) (photos de plats, carte du moment)
- **Email** : [Nodemailer](https://nodemailer.com) (confirmation de réservation)
- **Frontend** : HTML / CSS / JavaScript vanilla (aucun framework, aucune étape de build)

Le stockage est distant (pas de fichier local) car l'app est conçue pour tourner sur Vercel, dont les fonctions serverless ont un disque non persistant. Voir [Déploiement sur Vercel](#déploiement-sur-vercel) ci-dessous.

## Démarrage rapide (local)

Le développement local utilise les **mêmes** ressources cloud (Redis + Blob) que la production — il n'y a pas de mode "hors-ligne". Il faut donc d'abord avoir suivi la section [Déploiement sur Vercel](#déploiement-sur-vercel) pour créer ces ressources, puis récupérer les identifiants localement :

```bash
npm install
npx vercel link       # relie ce dossier à ton projet Vercel
npx vercel env pull .env
npm start
```

Le site est disponible sur http://localhost:3000

## Structure du projet

```
server.js              App Express + routes API (export du module, pas de app.listen sur Vercel)
api/index.js           Point d'entrée pour la fonction serverless Vercel (ré-exporte server.js)
db.js                   Accès Redis (menu, réservations, réglages) + valeurs par défaut
mailer.js               Envoi de l'email de confirmation (Nodemailer)
vercel.json             Configuration du déploiement (routes statique + fonction API)
seed/menu.json          Données de départ pour le menu (utilisées seulement si Redis est vide)
photos/                 Photos sources fournies (logo, carte, plats) — pas servies directement
public/                 Fichiers servis par le site
  index.html            Accueil (slides verticales)
  menu.html             Notre Carte (carte du moment + carte détaillée)
  reservation.html      Formulaire de réservation
  faq.html              Questions fréquentes
  mentions-legales.html Mentions légales
  confidentialite.html  Politique de confidentialité (RGPD)
  admin.html            Espace d'administration
  css/style.css         Feuille de style unique du site
  js/                   Scripts par page (slides, menu, reservation, admin, logo-lightbox)
  images/               Logo et carte d'origine (les nouvelles photos uploadées vont sur Vercel Blob)
```

## Pages du site

- **`/` — Accueil** : présentation du restaurant en slides verticales plein écran (navigation à la molette, au clavier, au swipe ou via les points sur le côté), avec un teaser de la carte et un résumé des infos pratiques (horaires, adresse, contact).
- **`/menu.html` — Notre Carte** : deux onglets séparés, *Carte Nourriture* et *Carte Boissons*, chacun avec une image "carte du moment" (mise à jour depuis l'admin) suivie de la liste détaillée des plats/boissons avec photo, description et prix. Cliquer sur une photo l'affiche en grand.
- **`/reservation.html` — Réservation** : formulaire de réservation. La date et l'heure sont contraintes aux horaires d'ouverture réels (voir ci-dessous) — impossible de réserver un jour de fermeture ou en dehors des services.
- **`/faq.html` — FAQ** : questions fréquentes en accordéon (une question ouverte referme les autres).
- **`/admin.html` — Administration** : protégé par mot de passe, avec 3 onglets :
  - **Réservations** : liste des demandes, changement de statut (en attente / confirmée / annulée), suppression.
  - **Carte du moment** : upload d'une image pour la carte "Nourriture" et une autre pour "Boissons".
  - **Menu détaillé** : ajout, modification et suppression de plats/boissons (catégorie, nom, description, prix, photo optionnelle), avec possibilité de retirer uniquement la photo sans supprimer l'élément.

## Horaires d'ouverture et règles de réservation

Le restaurant est fermé dimanche, lundi et mardi. Ces règles sont appliquées à la fois côté formulaire (la liste des horaires disponibles s'adapte à la date choisie) et côté serveur (toute tentative de réservation hors service est refusée) :

| Jour | Service |
|---|---|
| Mercredi | 11h30 – 14h00 |
| Jeudi, Vendredi, Samedi | 11h30 – 14h00 et 19h00 – 22h00 |
| Dimanche, Lundi, Mardi | Fermé |

Pour changer ces horaires, éditer `SERVICE_HOURS` dans **`server.js`** (validation) et dans **`public/js/reservation.js`** (formulaire).

## Configuration

Variables d'environnement (`.env` en local, onglet "Environment Variables" du projet sur Vercel) :

- `PORT` — port du serveur en local (3000 par défaut, ignoré sur Vercel)
- `ADMIN_PASSWORD` — mot de passe pour accéder à `/admin.html`
- `KV_REST_API_URL` / `KV_REST_API_TOKEN` — accès à la base Redis (voir déploiement ci-dessous)
- `BLOB_READ_WRITE_TOKEN` — accès au stockage des photos (voir déploiement ci-dessous)
- `SMTP_*` / `FROM_EMAIL` / `FROM_NAME` — voir la section email plus bas

## Déploiement sur Vercel

L'app a besoin de deux ressources Vercel avant de fonctionner : une base **Redis** (pour les données) et un store **Blob** (pour les photos). Étapes :

1. **Créer le projet** : pousser ce dossier sur un dépôt GitHub, puis sur [vercel.com](https://vercel.com) → *Add New → Project* → importer le dépôt. Vercel détecte `vercel.json` automatiquement, pas besoin de configurer quoi que ce soit d'autre.

2. **Ajouter une base Redis** : dans le projet Vercel → onglet *Storage* → *Create Database* → chercher **Upstash** (ou un autre fournisseur Redis du Marketplace) → suivre les étapes. Vercel connecte automatiquement la base au projet et ajoute les variables `KV_REST_API_URL` et `KV_REST_API_TOKEN` (ou `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` selon l'intégration — le code accepte les deux noms).

3. **Ajouter un store Blob** : toujours dans *Storage* → *Create Database* → **Blob**. Vercel ajoute automatiquement la variable `BLOB_READ_WRITE_TOKEN`.

4. **Ajouter les autres variables** : dans *Settings → Environment Variables*, ajouter `ADMIN_PASSWORD` et, si tu veux activer les emails, les variables `SMTP_*` (voir section suivante).

5. **Déployer** : Vercel déploie automatiquement à chaque push. Le site sera disponible sur l'URL `*.vercel.app` fournie (un nom de domaine personnalisé peut être ajouté dans *Settings → Domains*).

6. **Développer en local avec les mêmes données** : `npx vercel link` puis `npx vercel env pull .env` dans ce dossier — ça récupère automatiquement toutes les variables ci-dessus (y compris Redis et Blob) pour que `npm start` fonctionne en local exactement comme en production.

## Email de confirmation automatique

Quand l'admin passe une réservation au statut **confirmée** (dans `/admin.html`), un email de confirmation est envoyé automatiquement au client. Tant que les variables `SMTP_*` ne sont pas renseignées dans `.env`, l'envoi est simplement désactivé (un message s'affiche dans les logs du serveur, le changement de statut fonctionne normalement).

Pour l'activer, renseigner dans `.env` :

```
SMTP_HOST=...
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=...
SMTP_PASS=...
FROM_EMAIL=...
FROM_NAME=Le P'tit Bistro Réunionnais
```

Deux options courantes :

- **Un service transactionnel** (recommandé) : [Resend](https://resend.com), [Brevo](https://www.brevo.com) ou [Mailgun](https://www.mailgun.com) proposent un accès SMTP avec un plan gratuit largement suffisant pour un restaurant. Ils fournissent `SMTP_HOST`, `SMTP_USER` et `SMTP_PASS` directement dans leur interface.
- **Une adresse Gmail** : `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`, `SMTP_USER=votre-adresse@gmail.com`, `SMTP_PASS=` un [mot de passe d'application](https://myaccount.google.com/apppasswords) (pas le mot de passe du compte).

Le contenu de l'email (texte, mise en page) se modifie dans **`mailer.js`**.

## Modifier le contenu

- **Réservations, menu, réglages (carte du moment)** : tout se gère depuis `/admin.html`, aucune édition de fichier nécessaire.
- **Menu de départ** : `seed/menu.json` ne sert qu'à peupler la base Redis la toute première fois (si le menu est vide au démarrage).
- **Logo, carte d'origine** : dossier `photos/` (sources), copiées dans `public/images/` pour être servies par le site. Les nouvelles photos ajoutées depuis l'admin sont stockées sur Vercel Blob, pas dans ce dossier.

## API

| Méthode | Route | Description | Auth |
|---|---|---|---|
| GET | `/api/menu` | Liste des plats/boissons | — |
| POST | `/api/menu` | Ajouter un plat/boisson (multipart, photo optionnelle) | admin |
| PUT | `/api/menu/:id` | Modifier un plat/boisson | admin |
| DELETE | `/api/menu/:id/photo` | Retirer uniquement la photo d'un plat | admin |
| DELETE | `/api/menu/:id` | Supprimer un plat/boisson | admin |
| GET | `/api/settings` | Réglages (images "carte du moment") | — |
| POST | `/api/admin/carte` | Uploader une carte du moment (`type=nourriture\|boisson`) | admin |
| POST | `/api/reservations` | Créer une réservation | — |
| GET | `/api/reservations` | Liste des réservations | admin |
| PATCH | `/api/reservations/:id` | Changer le statut d'une réservation | admin |
| DELETE | `/api/reservations/:id` | Supprimer une réservation | admin |

L'authentification admin se fait via l'en-tête `x-admin-password`.

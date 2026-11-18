# Fil rouge – Liste de tâches (TP Kubernetes)

Trois briques, chacune dans son conteneur :

| Brique | Techno | Port | Image |
|--------|--------|------|-------|
| `web`  | HTML + JS vanilla servi par nginx (non-root) | 8080 | `fil-rouge-web` |
| `api`  | Node.js 24 + Express + pg (utilisateur `node`) | 8080 | `fil-rouge-api` |
| `db`   | PostgreSQL 17 (image officielle) | 5432 | `postgres:17-alpine` |

Le front appelle l'API avec des URL relatives (`/api/...`). En production, un Ingress envoie `/` vers `web` et `/api` vers `api`. En local, le service `ingress` du docker compose joue ce rôle (`local-ingress.conf`).

## Endpoints

| Brique | Route | Rôle |
|--------|-------|------|
| api | `GET /healthz` | liveness : 200 si le process tourne (ne teste pas la base) |
| api | `GET /ready` | readiness : 200 si `SELECT 1` passe, sinon 503 |
| api | `GET /api/version` | `{"version": "1.0.0"}` |
| api | `GET` / `POST /api/tasks` | lister / créer (`{"title": "..."}`) |
| api | `PATCH` / `DELETE /api/tasks/:id` | cocher (`{"done": true}`) / supprimer |
| web | `GET /healthz` | 200 |

## Lancer en local (facultatif, nécessite Docker)

```bash
docker compose up --build
```

- Front : http://localhost:8080
- API à travers le faux ingress : http://localhost:8080/api/tasks

Pour tout arrêter : `docker compose down` (ajouter `-v` pour effacer la base).

## Construire et pousser les images (GitHub Actions → ghcr.io)

Les images sont construites par le workflow `.github/workflows/images.yml`, sans Docker en local. Il se déclenche quand on pousse un tag git qui commence par `v` :

```bash
git tag v1.0.0
git push origin v1.0.0
```

Le workflow construit `api` et `web` en parallèle sur un runner `ubuntu-latest` (donc en linux/amd64, comme le serveur k3s) et les pousse vers :

| Image | Exemple |
|-------|---------|
| `ghcr.io/<owner>/fil-rouge-api:<tag>` | `ghcr.io/<owner>/fil-rouge-api:v1.0.0` |
| `ghcr.io/<owner>/fil-rouge-web:<tag>` | `ghcr.io/<owner>/fil-rouge-web:v1.0.0` |

`<owner>` est le compte GitHub propriétaire du dépôt, en minuscules. Le tag d'image est exactement le tag git, **avec le `v`** (`v1.0.0`).

Le suivi se fait dans l'onglet **Actions** du dépôt, les images apparaissent dans **Packages**.

> **Visibilité :** sur ghcr.io, un package est **privé** par défaut, même si le dépôt est public. Pour que k3s puisse tirer l'image sans `imagePullSecret` : Profil GitHub → Packages → `fil-rouge-api` → Package settings → Change visibility → Public. Faire de même pour `fil-rouge-web`.

### Construire à la main (facultatif, si Docker est disponible)

```bash
export REGISTRY=ghcr.io/<owner>
docker buildx build --platform linux/amd64 -t $REGISTRY/fil-rouge-api:v1.0.0 --push ./api
docker buildx build --platform linux/amd64 -t $REGISTRY/fil-rouge-web:v1.0.0 --push ./web
```

`--platform linux/amd64` est indispensable depuis un Mac Apple Silicon.

## Variables d'environnement de l'API

| Variable | Défaut | Description |
|----------|--------|-------------|
| `DB_HOST` | `localhost` | hôte PostgreSQL (le nom du Service en K8s) |
| `DB_PORT` | `5432` | port PostgreSQL |
| `DB_NAME` | `tasks` | nom de la base |
| `DB_USER` | `tasks` | utilisateur |
| `POSTGRES_PASSWORD` | *(aucun)* | mot de passe (à mettre dans un Secret) |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn` ou `error` (`debug` affiche les appels aux probes) |
| `APP_VERSION` | version du `package.json` | version renvoyée par `/api/version` |

L'image `postgres` utilise `POSTGRES_DB`, `POSTGRES_USER` et `POSTGRES_PASSWORD` : le même Secret peut donc servir à la base et à l'API.

## Kubernetes : à savoir

- L'API est stateless : on peut lancer plusieurs replicas.
- Elle arrête proprement sur SIGTERM (fin des requêtes en cours, fermeture du pool pg).
- Si la base n'est pas prête, l'API ne plante pas : `/ready` renvoie 503 et elle réessaie toutes les 5 s.
- `readOnlyRootFilesystem: true` fonctionne pour les deux images si on monte un `emptyDir` sur `/tmp` (nginx y écrit son pid et ses fichiers temporaires).
- `runAsNonRoot: true` : l'api tourne en uid 1000 (`node`), le web en uid 101 (`nginx`).

## Sortir une version 1.1.0

1. **API** : changer `"version"` dans `api/package.json`, et/ou la variable `APP_VERSION` dans le Deployment.
2. **Front** : changer `FRONT_VERSION` en haut de `web/app.js`.
3. Faire la modification fonctionnelle voulue (par exemple la couleur du bouton dans `web/index.html`).
4. Commiter, créer le tag et le pousser. GitHub Actions construit alors les images `:v1.1.0` :
   ```bash
   git commit -am "Version 1.1.0"
   git push
   git tag v1.1.0
   git push origin v1.1.0
   ```
5. Dans Kubernetes, mettre à jour le tag d'image des Deployments (`v1.0.0` → `v1.1.0`) et regarder le rolling update. Le pied de page du front affiche les deux versions.

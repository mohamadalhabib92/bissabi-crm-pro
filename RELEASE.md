# Release next

`release/next` prépare les builds iOS (TestFlight). **`main` déploie uniquement la PWA** (GitHub Pages, workflow `pages.yml`). Ne pas fusionner cette branche dans `main` sans accord explicite : un push sur `main` publie le site.

Les branches sources restent en place. Cette branche les rassemble ; elle ne les remplace pas.

## Origine

Les builds TestFlight déjà livrés (build interne 25, numéro distant EAS) partent de `main` (`e648daa`), qui contient la préparation App Store (`ascAppId`, équipe `Y9XF9RY2BU`, bundle inchangé) et les PR fusionnées #2 et #3. Aucune pull request encore ouverte n’a elle-même été construite pour TestFlight.

`release/next` part du tête le plus avancé qui prolonge ce `main` : `cursor/preservation-foundation-b5cc` (PR #6).

## Branches reprises

| Branche | PR | Pourquoi |
| --- | --- | --- |
| `cursor/preservation-foundation-b5cc` | #6 | Base : conservation des numéros, JSON illisible, schéma futur, pièces |
| `fix/import-vibecode-robust` | #5 | Lecture JSON plus robuste, sans conflit |
| `ci/pr-checks-2026-11-19` | #8 | Contrôles PR et Dependabot, élargis ici (push + export) |
| `cursor/telephonie-ia-d159` | #7 | Écrans et gateway, sans appliquer la migration Supabase |
| `ux/passe-plaisir-2026-11-04` | #4 | Clair/sombre, haptique, célébrations, accessibilité — le verre s’appuie dessus |

## Laissée de côté

`cursor/passe-1-fondations-10e0` (PR #1). Elle diverge de `main` (base antérieure à la PR #2, déjà fusionnée) et le merge est conflictuel sur le stockage, les factures et les numéros. La rejouer risquerait d’écraser la conservation déjà en place.

## CI

`.github/workflows/ci.yml` tourne sur chaque push et chaque pull request : `npm ci`, `tsc --noEmit`, `npm test`, `npx expo export --platform web`. Aucun déploiement, aucun secret, aucun build EAS. Le workflow Pages ne part que de `main`.

## Envoyer un build sur TestFlight

À lancer **depuis `release/next`**, quand le feu vert est donné. Ne pas le lancer depuis `main`. Ne pas changer le bundle ID, l’équipe Apple, `ascAppId` ni `experiments.baseUrl`.

Le numéro de build iOS est distant (`appVersionSource: remote`, profil `production` avec `autoIncrement`). Il n’est pas écrit dans `app.json`.

```bash
git checkout release/next
bunx eas-cli build --platform ios --profile production
bunx eas-cli submit --platform ios --profile production --latest
```

La clé API App Store Connect n’est pas dans le dépôt. `eas.json` lit `EXPO_ASC_API_KEY_PATH`, `EXPO_ASC_KEY_ID` et `EXPO_ASC_ISSUER_ID`. `ascAppId` reste `6805133419`, équipe `Y9XF9RY2BU`.

La migration `supabase/migrations/20261113193000_telephonie_ia.sql` est versionnée avec la téléphonie. Elle n’est pas appliquée par ce processus.

# Passe adverse — conservation — 8 novembre 2026

PR : https://github.com/mohamadalhabib92/bissabi-crm-pro/pull/6  
Branche : `cursor/preservation-foundation-b5cc`  
Point de départ vérifié : `93409c34887684ffa40a2ab423451d348e232103`  
Commit des correctifs : `198dece262a9c341786b733a57b71d8742a11dd3`  
Base main au moment de la passe : `e648daa`  
PR #1, #4 et #5 : non touchées. Aucun merge, aucun build, aucun déploiement, aucune migration de données réelles.

Cette passe ne prouve pas une sauvegarde appareil. `cutoverAllowed()` reste faux. Rien n’a été publié.

## Ce qui a été reproduit, et le correctif

| Scénario | Constat sur `93409c3` | Correctif |
| --- | --- | --- |
| Lecture pas finie, puis mutation ou reset | `mutate` refusait déjà l’écriture. L’écran de réinitialisation annonçait quand même « Données métier effacées ». `applyReset`, s’il est appelé, vide la liste active. | Le bouton n’annonce le succès que si `resetBusiness()` a été accepté. Tant que `canMutateStore` est faux, l’objet d’origine n’est pas remplacé. |
| Suppression refusée, puis écriture | `deleteDraftInvoice` renvoyait `true` dès que la facture était un brouillon, même si `mutate` n’écrivait rien (schéma > 2). L’écran quittait la fiche. Une facture émise était bien refusée, mais un enregistrement ultérieur devait le prouver. | Le succès n’est vrai que si la suppression a eu lieu et que l’écriture a été acceptée. `applyInvoiceSave` garde le numéro, les lignes et les champs inconnus d’une facture déjà émise. |
| Schéma > 2 | Déjà en lecture seule au chargement. La restauration d’un fichier au schéma 9 pouvait quand même remplacer la mémoire et se dire terminée. | `backupWriteAllowed` refuse cette restauration. Rien n’est écrit. |
| Journal illisible | La clé `audit` cassée bloquait déjà toute écriture. Une seconde lecture pouvait être prise pour un succès si l’interface l’annonçait. | Relecture testée deux fois : toujours une erreur, `sets` vide, octets d’origine identiques. |
| Champs inconnus | Déjà conservés par le parseur et par `preserveInvoiceRows` sur une facture émise. | Verrouillé par le test d’écriture après suppression refusée (`champInconnu`, `noteInterne`). |
| Justificatif, cache, copie échouée | `decideAttachment` gardait déjà l’URI si l’inline échoue, et ne posait pas `persisted` sur un cache. L’écran dépense faisait `router.back()` même si l’écriture était refusée. | Pas de nouvelle règle sur l’URI. L’écran ne quitte plus la fiche si l’écriture est refusée, donc l’URI déjà stockée n’est pas présentée comme remplacée. |
| Numéros et montants historiques | `FA-2026-3` n’était pas réécrit par la migration. Un passage en « payée » avec un prix et un numéro paddés dans le formulaire aurait pu être affiché comme enregistré. | `applyInvoiceSave` renvoie le numéro `FA-2026-3`, le prix 2,50 et la même référence QR. Le prix 999 du formulaire n’est pas pris sur une facture émise. |
| CHF | 1 × 10,10 à 8,1 % reste 10,92. Le pas cash 10,90 n’est pas appliqué. | Aucune règle comptable ajoutée. |
| Retry / relecture | Un JSON illisible restait une erreur. Les boutons « Enregistré », « Restauration terminée », « Import terminé » et les `router.back()` partaient même quand l’écriture était refusée. | Ces annonces dépendent du booléen d’écriture. |

## Non reproduit, donc non changé

- Pas de course atteinte où une lecture lente écrase une saisie déjà affichée. Le bouton Réessayer n’est proposé que tant que l’ouverture n’est pas prête, ou après une erreur. Avant l’hydratation, `canMutateStore` est faux. Aucun jeton de génération n’a été ajouté.
- La formule `totals` et le champ montant du QR ne sont pas modifiés.
- `applyReset` vide toujours la liste s’il est appelé. Le correctif empêche de l’appeler, et empêche de l’annoncer, quand l’écriture est refusée.
- L’export réel Vibecode n’est pas dans le dépôt. `VIBECODE_REAL_EXPORT` est absent. La fixture `tests/fixtures/vibecode-sample.json` n’a pas 17 factures : ce n’est pas cet export, et ce n’est pas une preuve appareil. Le test réel reste ignoré.

## Tests

Commandes lancées dans ce clone, après les correctifs :

- `npx tsc --noEmit` : succès.
- `npm test` : 44 passés, 0 échec, 1 ignoré.

Ignoré, exprès : `vibecode: contrôle sur l’export réel (hors dépôt, VIBECODE_REAL_EXPORT)`.

Les 7 tests de `tests/preserve-adverse.test.ts` sont dans les 44. Aucun test n’a été peint en vert en élargissant une tolérance. La suite précédente (37 passés + 1 ignoré au commit `93409c3`) reste verte.

## Déclencheur de `main` et limites d’appareil

`.github/workflows/pages.yml` part sur `push` vers `main`, et sur `workflow_dispatch`. Le job `build` fait `npm ci`, `tsc`, `npm run build:web`, puis envoie `dist/`. Le job `deploy` publie GitHub Pages. Un push sur cette branche ne correspond pas à `branches: [main]` : il ne déclenche pas ce workflow. Fusionner la PR le déclencherait.

Limites : pas de dossiers `ios/` ni `android/` dans le dépôt (générés par Expo, pas édités ici). Pas de cible macOS dans `app.json`. iPad déclaré (`supportsTablet`), orientation portrait. Données dans AsyncStorage ou localStorage, préfixe `@bissabi-crm-pro/`. Le système de fichiers d’un iPhone, d’un iPad ou d’un Mac n’a pas été ouvert. Aucun build EAS, aucun Expo, aucun navigateur dans cette passe.

## Verrous de publication

- Ne pas fusionner cette PR tant qu’une sauvegarde chiffrée n’a pas été produite sur l’appareil, relue sur une copie isolée, avec comptages, hash et retour arrière.
- `cutoverAllowed()` est faux. Aucun argument ne le rend vrai.
- Ne pas pousser `main` pour « voir » la PWA : ce push construit et déploie.
- Ne pas lancer EAS, TestFlight, App Store ni Play depuis cette passe.
- Ne pas ouvrir de projet Supabase ni de synchronisation.
- Les PR #1, #4 et #5 restent en dehors de ce correctif.

## Risque restant

Un flush peut encore échouer après qu’une écriture a été acceptée en mémoire (stockage plein). Le bandeau « Enregistrement impossible » existe. Le message de reset le rappelle. Ce n’est pas une sauvegarde vérifiée. Les tests comparent des objets en mémoire et des chaînes de fixture. Ils ne lisent pas un appareil.

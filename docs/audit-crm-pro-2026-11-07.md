# Audit Bissabi CRM Pro — 7 novembre 2026

Passe adverse du 8 novembre 2026 : `docs/passe-adverse-2026-11-08.md`. Ce fichier reste l’audit du 7 novembre.

Périmètre : ce dépôt seulement (`bissabi-crm-pro`), commit audité `e648daa` (main). RH Master CH n’est pas dans ce dépôt et n’est pas modifié. Aucune requête Supabase : il n’y a pas de client Supabase ici, et aucun secret n’a été lu.

PR déjà présentes, non modifiées :

| PR | État au 7 novembre 2026 | Décision |
| --- | --- | --- |
| [#1](https://github.com/mohamadalhabib92/bissabi-crm-pro/pull/1) | Ouverte, en conflit avec main | Doublon de la passe 1. Obsolète. Ne pas fusionner, ne pas rebaser. |
| [#2](https://github.com/mohamadalhabib92/bissabi-crm-pro/pull/2) | Fusionnée | Passe 1 déjà dans main. Ne pas la refaire. |
| [#3](https://github.com/mohamadalhabib92/bissabi-crm-pro/pull/3) | Fusionnée | Import Vibecode additif. |
| [#4](https://github.com/mohamadalhabib92/bissabi-crm-pro/pull/4) | Ouverte (UX) | Hors périmètre. Non touchée. |
| [#5](https://github.com/mohamadalhabib92/bissabi-crm-pro/pull/5) | Ouverte (import) | Hors périmètre. Non touchée. |

L’intention produit est un CRM iPhone, iPad et Mac qui se synchronise. L’état du code est une application locale, sans backend dans ce dépôt. Ce document n’invente pas un serveur déjà en ligne et n’ouvre pas de projet payant.

## Diagnostic

CRM Pro est l’outil local de Bissabi Drinks (comptes, offres, factures QR, dépenses), Expo SDK 58, sans synchronisation : la passe 1 déjà fusionnée empêche d’écraser le stockage au chargement et ne réécrit pas les numéros pendant la migration.
Le trou restant est plus étroit qu’une réécriture : un justificatif copié dans le cache pouvait être marqué conservé, un journal de crash illisible pouvait être remplacé par une liste vide, et un schéma plus récent que v2 restait modifiable après lecture.
`FA-2026-3` et `FA-2026-0003` sont deux textes historiques différents ; les passer en silence à 4 chiffres changerait la référence QR, donc il est interdit de les renuméroter.
Les montants de QR-facture sont en CHF au centime (pas l’arrondi cash à 5 centimes) ; la formule actuelle est verrouillée par un test, pas « corrigée ».
Aucun test de ce dépôt, y compris ceux ajoutés avec la fondation, ne prouve l’absence de perte sur un appareil : une bascule sync exige encore une sauvegarde chiffrée vérifiée, une restauration isolée, des comptages, des hash et une checklist de retour arrière.

## 1. Vision

Bissabi CRM Pro sert la prospection et la facturation de Bissabi Drinks - BA (Prilly, Vaud, IDE CHE-332.255.936), d’abord en Suisse romande, livraison boissons limitée au canton de Vaud. Le métier est le pipeline HORECA et la QR-facture, pas la comptabilité complète ni la caisse.

La vision « iPhone + iPad + Mac synchronisés » n’est pas implémentée. `README.md` le dit : pas de synchronisation multi-appareils sans backend. `EXPO_PUBLIC_BACKEND_URL` peut être lue ; aucun `fetch` n’est fait au démarrage (test de la passe 1 sur `src/app/_layout.tsx`, `src/lib/data.tsx`, `src/lib/backend.ts`, `src/lib/migrate.ts`).

## 2. Concurrents nommés et sources

Pas d’étude de marché faite ici, pas de prix repris comme des faits, pas de part de marché. Les noms ci-dessous sont des outils de facturation ou de comptabilité suisse cités par des pages publiques consultées le 7 novembre 2026. Ils ne sont pas des copies de CRM Pro, et CRM Pro ne prétend pas les égaler.

| Outil | Rôle cité | Source |
| --- | --- | --- |
| bexio | QR-facture dans un logiciel de facturation | [bexio.com/en-CH/qr-invoice](https://www.bexio.com/en-CH/qr-invoice) |
| KLARA, CashCtrl, Banana Comptabilité, bexio | Comparaison d’outils de facturation suisses, tous présentés comme capables de QR-facture | [infinity.swiss, billet du comparatif](https://www.infinity.swiss/en/blog/invoicing-software-switzerland-comparison) |
| bexio, Banana, CashCtrl, Klara, AbaNinja | Tableau comparatif d’un éditeur tiers (TILL) | [tillbooks.ch/en/compare](https://tillbooks.ch/en/compare/) |
| Abacus | ERP suisse cité par bexio dans sa propre page de comparaison | [bexio.com, comparaison comptabilité](https://www.bexio.com/de-CH/buchhaltungssoftware-schweiz-vergleich) |
| Bexio, Abacus, Banana, Crésus, Klara | Cités ensemble à propos de QR-facture et eBill | [giar.digital](https://giar.digital/blog/qr-rechnung-ebill-kmu-schweiz) |
| Vibecode CRM | Ancienne base Bissabi, import JSON déjà dans main (PR #3) | `src/lib/vibecodeImport.ts`, commit `e648daa` |

Ce qui distingue le code actuel : données sur l’appareil, TVA Oui/Non par document, QR en SPÉCIMEN tant que l’IBAN n’est pas valide, pipeline en 6 étapes, pas de comptabilité ni d’eBill.

## 3. Fonctions, UX, iPad, iOS, web, Mac, accessibilité

Fonctions présentes (README et écrans `src/app/`) : tableau de bord, comptes, pipeline, offres, factures, avoirs, dépenses avec justificatif, import CSV, import Vibecode, exports JSON / CSV / fichier chiffré.

| Surface | Constat au commit `e648daa` |
| --- | --- |
| iOS | Bundle `com.vibecode.bissabicrmpro-h7qq2g` (`app.json` ligne 18). Inchangé. |
| iPad | `supportsTablet: true` (`app.json` ligne 17). Orientation portrait seulement (ligne 8). Pas de vue partagée, pas de raccourcis clavier. |
| Mac | Pas de cible macOS dans `app.json`. Un Mac peut ouvrir la PWA dans un navigateur. Ce n’est pas une app Mac native, et rien ne synchronise les trois. |
| Web | PWA, `experiments.baseUrl` = `/bissabi-crm-pro`. |
| Accessibilité | Contraste des textes vérifié par test (passe 1). Quelques `accessibilityLabel` (`src/ui/kit.tsx`, lignes, QR). VoiceOver, taille de texte dynamique et navigation clavier n’ont pas été exercés sur un appareil. |

## 4. Architecture, hors-ligne, CI, tests

Stockage local, préfixe `@bissabi-crm-pro/` (`src/lib/storage.ts` ligne 13). Clés métier : comptes, offres, factures, dépenses, société, produits, compteurs, avoirs, journal, sauvegardes, version de schéma. Schéma courant : 2 (`src/lib/migrate.ts` ligne 8).

Hors-ligne : pas de réseau au démarrage. Les écritures métier attendent une lecture réussie (`src/lib/persistGate.ts`).

CI (`.github/workflows/pages.yml` lignes 30-31) : `tsc` et export web sur `main`. `npm test` n’y figure pas. Les tests sont `tsx --test tests/*.test.ts` (Node), pas un simulateur.

Il n’y a pas de file d’envoi (outbox) réseau. Deux éditions du même brouillon : la dernière écriture gagne, sauf le numéro déjà posé, que la fondation refuse de remplacer. Il n’y a pas de fusion de champs concurrente.

## 5. Performance

Les listes passent par `ScrollView` (`src/ui/kit.tsx` ligne 32, pipeline), pas par une liste virtualisée. Aucun temps de démarrage n’a été mesuré sur iPhone, iPad ou Mac. Le chiffrement d’export utilise PBKDF2 à 120 000 itérations (`src/lib/backup.ts`) : coût volontaire au moment de l’export, pas au lancement. Pas de chiffre de perf inventé.

## 6. Sécurité, nLPD, RGPD

Données personnelles possibles : nom du contact, e-mail, téléphone, notes, et justificatifs qui peuvent contenir des tiers. L’IBAN saisi est stocké avec la société. Tout cela est en clair dans AsyncStorage (mobile) ou localStorage (web).

L’export chiffré AES-GCM existe (`src/lib/backup.ts`, phrase non stockée). Il n’a pas été produit ni relu sur un appareil dans cet audit.

Sentry ne part pas sans DSN réel (test existant). Un message de crash est tronqué à 500 caractères (`src/lib/crash.ts` ligne 13) : s’il contenait une donnée client, il pourrait partir seulement si un DSN réel est configuré.

La nLPD (Suisse, en vigueur depuis le 1er septembre 2023) et le RGPD (si des personnes dans l’UE sont concernées) peuvent s’appliquer. Ceci n’est pas un avis juridique. Il n’y a pas de registre de traitement, pas de contrat de sous-traitance, pas de compte utilisateur. Aucune base Supabase n’est branchée.

La PWA publique sur GitHub Pages ne reçoit pas les données métier : elles restent dans le navigateur de la personne qui s’en sert. Le dépôt de code, lui, est lisible.

## 7. Langue et termes de facturation suisse

Documents et PDF en français. La navigation a des amorces DE / IT / EN (`src/lib/i18n.ts`) ; le repli est le français. Les PDF ne sont pas traduits.

Termes présents : facture, offre, avoir, échéance, TVA, « TVA non applicable », UID, CHF, QR-facture, SPÉCIMEN, référence QRR ou SCOR. Taux proposés : 8,1 / 2,6 / 3,8 / 0. Délai de paiement par défaut : 30 jours. Le numéro de TVA `YOUR_VAT_NUMBER` n’est pas imprimé. L’assujettissement n’est pas tranché par le code.

QR : SPC 0200, adresse structurée `S`, montant `toFixed(2)` puis `CHF` (`src/lib/qrbill.ts` ligne 55). La référence QRR est dérivée des chiffres du numéro (`src/lib/iban.ts` lignes 32-37). `FA-2026-3` et `FA-2026-0003` ne donnent pas la même référence : un remplissage silencieux à 4 chiffres changerait un document déjà émis. Le pays du débiteur dans le QR est forcé à `CH` quand l’adresse est complète (ligne 56). La conformité à une version précise des Implementation Guidelines SIX n’a pas été certifiée.

Unités : les prix sont des francs décimaux, pas des centimes entiers stockés. `totals` (`src/lib/model.ts` lignes 149-152) arrondit au centime le total HT, puis la TVA sur ce HT, puis le TTC. Ce n’est pas l’arrondi monétaire cash à 5 centimes. Pour 1 × 10,10 CHF à 8,1 %, le résultat actuel est HT 10,10, TVA 0,82, TTC 10,92 (1 092 centimes, alors que le pas cash donnerait 1 090). Cette PR ne change pas la formule, pour ne pas modifier une facture déjà imprimée.

## 8. Pédagogie — non applicable

CRM Pro n’est pas un logiciel d’apprentissage. Il n’y a pas de parcours, de classe, de note, ni de profil d’élève. L’axe pédagogie est explicitement sans objet. Il ne faut pas y ajouter de suivi scolaire ni réutiliser les fiches clients comme profils d’apprenants.

## 9. IA : confidentialité, usage, coût

Aucun appel de modèle, aucune clé d’API d’IA, aucun prompt dans le dépôt. Usage actuel : aucun. Coût actuel : 0 CHF. Aucune donnée client n’est envoyée à un modèle.

Si une aide à la rédaction est ajoutée plus tard, elle ne doit pas partir avec les factures, les contacts ou les justificatifs tant qu’une décision séparée n’a pas fixé l’hébergement, la conservation et le coût. Cette PR n’ajoute pas d’IA.

## 10. Stores

`store/ios-metadata.md` est un brouillon de fiche App Store. Rien n’a été soumis dans cet audit, et cette PR ne lance ni EAS, ni TestFlight, ni Play, ni App Store. Le risque déjà noté dans la fiche (app interne à une seule entreprise) reste une décision de Mohamed, pas un correctif de cette PR. Pas de capture d’écran produite ici.

## 11. Croissance et KPI

Il n’y a pas d’analytics. Aucun taux d’activation, de rétention ou de conversion n’est connu. En publier un serait inventer une métrique.

Cibles proposées, toutes non mesurées en conditions réelles, à ne remplir qu’avec un comptage sur export volontaire :

- part des factures émises dont l’IBAN des réglages est valide (aujourd’hui : non mesuré ; le défaut est `YOUR_SWISS_IBAN`) ;
- nombre de sauvegardes chiffrées réussies, puis relues, par mois (aujourd’hui : non mesuré) ;
- délai entre brouillon et émission (aujourd’hui : non mesuré).

Tant qu’il n’y a pas de mesure, le tableau de bord de l’app (CA, ouvert, dépenses) reste un calcul local sur les données saisies, pas un KPI de croissance du produit.

## 12. Composants partagés, sans partage de profil sensible

Composants réutilisés dans cette app seulement : `src/ui/kit.tsx`, `src/ui/theme.ts`, `LinesEditor`, `QrPreview`, `AccountPicker`, `format`, `model`, `qrbill`. Le préfixe `@bissabi-crm-pro/` évite de mélanger les clés avec une autre PWA sur la même origine GitHub Pages (`src/lib/storage.ts` lignes 11-13).

Aucun profil client, IBAN ou justificatif ne doit être copié vers RH Master CH ni vers une autre app. Cette PR ne crée pas de module partagé entre dépôts.

## Données locales, fichiers, migration

| Sujet | Où c’est | Risque constaté sur `e648daa` |
| --- | --- | --- |
| Comptes, factures, offres, avoirs, dépenses | Clés AsyncStorage / localStorage | Migration v0→v2 additive. Les numéros ne sont pas réécrits par `applySchemaMigration`. |
| Justificatif | `attachment.uri` + `persisted` | Le sélecteur copie vers le cache (`copyToCacheDirectory: true`) puis, hors web, posait `persisted: true` (`src/app/expense/[id].tsx` lignes 38-41). Le fichier peut être purgé par le système. Le CSV n’exporte que le nom (`src/lib/backup.ts` ligne 108), pas les octets. |
| JSON illisible | `loadAndMigrate` | La clé n’était pas réécrite (lignes 337-338). En revanche `loadJSON` rendait le repli (lignes 25-30) et le journal de crash réécrivait ensuite (lignes 15-17). |
| Schéma futur | `applySchemaMigration` ligne 115 | Une version déjà ≥ 2 n’était pas migrée, mais l’app pouvait encore enregistrer par-dessus. |
| Numéros 3 ou 4 chiffres | `padStart(4)` lignes 28-29, boucle lignes 107-110 | Les nouveaux numéros sont paddés. La boucle ne comparait que l’égalité exacte. Les deux largeurs d’un même entier n’étaient pas signalées. Les textes historiques n’étaient pas réécrits par la migration, et il fallait que cela reste vrai. |
| Éditions concurrentes | `saveInvoice` lignes 207-218 | Pas de version par fiche. Dernière écriture. |
| Système de fichiers | — | Non inspecté. Aucun chemin réel d’iPhone, d’iPad ou de Mac n’a été ouvert. |

## Tableau impact / effort

Échelle 1 (faible) à 5 (fort). L’effort est celui du changement dans ce dépôt, pas un calendrier.

| Sujet | Impact | Effort | Décision |
| --- | --- | --- | --- |
| Fondation de préservation (numéros, JSON, schéma futur, cache) | 5 | 2 | Faite dans la PR séparée, sans changer le schéma v2 |
| Sauvegarde chiffrée vérifiée + restauration isolée avant toute sync | 5 | 4 | Pas commencée : il faut un appareil et une copie isolée |
| Justificatif durable vérifié sur l’appareil | 5 | 3 | Logique seulement : ne plus déclarer le cache « enregistré » |
| Ne pas renuméroter 3 ↔ 4 chiffres | 5 | 2 | Garde ajoutée ; les textes existants ne sont pas réécrits |
| Lancer `npm test` dans la CI | 3 | 1 | Non fait : le workflow ne part que sur main |
| Mise en page iPad / Mac | 3 | 4 | Hors de cette PR |
| VoiceOver et texte dynamique | 3 | 3 | Non testé sur appareil |
| Décision TVA / IBAN réel | 4 | 1 | Décision de Mohamed, pas un patch |
| Publication stores | 2 | 3 | Interdite dans cette mission |
| Analytics | 2 | 2 | Ne pas ajouter de pistage pour « avoir des KPI » |
| IA | 1 | 1 | Ne pas brancher |
| Réécriture Swift | 1 | 5 | Refusée |
| Reprendre la PR #1 | 1 | 1 | Obsolète |

## Top 5 de la semaine

1. Fondation de préservation bornée (cette PR) : gel d’écriture si le schéma est plus récent, numéro historique non remplacé, cache non déclaré durable, original illisible non remplacé.
2. Ne pas fusionner la PR #1, ne pas rebaser les PR #4 et #5, ne pas pousser main, ne pas lancer de sync.
3. Avant toute bascule : export chiffré fait sur l’appareil, relu sur une copie isolée, comptages et hash comparés, retour arrière encore possible. `cutoverAllowed()` reste faux tant que ce n’est pas fait.
4. Sur un appareil de test qui n’est pas la seule copie : voir si les justificatifs déjà saisis sont dans `Caches` et si un data URL tient dans le stockage. Le système de fichiers n’a pas été ouvert ici.
5. Décision humaine : IBAN réel et assujettissement TVA, avant tout envoi de facture. L’app ne doit pas envoyer, encaisser ni annuler à la place de Mohamed.

## Cinq prompts d’implémentation

1. **CI.** Ajouter `npm test` au workflow, sans changer `baseUrl`, le bundle iOS, ni les clés `@bissabi-crm-pro/`. Ne pas faire échouer la CI en exigeant un appareil. Ne pas merger la PR #1.

2. **Export de quarantaine, sans réécrire.** Si `loadAndMigrate` renvoie `quarantine`, proposer un téléchargement du texte original. Ne pas appeler `set` sur la clé illisible. Ne pas parser « au mieux ».

3. **Justificatifs sur appareil de test.** Avec l’accord de Mohamed et une copie chiffrée déjà relue, mesurer la taille AsyncStorage et le sort d’un fichier passé par `copyToCacheDirectory`. Si la copie inline échoue, laisser l’URI et `persisted: false`. Ne pas effacer le fichier du cache pour « nettoyer ».

4. **iPad, sans sync.** Largeur de lecture, cible tactile, et un essai VoiceOver sur un brouillon de facture. Ne pas ajouter de backend. Ne pas changer les numéros ni les montants stockés.

5. **Bascule, seulement après les portes.** Produire la checklist réelle : backup AES-GCM, restauration dans un profil vide, comptages, SHA-256 des deux côtés, retour arrière. Tant que `cutoverAllowed` ne peut pas devenir vrai par une preuve externe au test Node, ne pas écrire de file de synchronisation et ne pas ouvrir de projet Supabase.

## Cibles mesurables proposées

Ce ne sont pas des résultats de production. La colonne « constaté » dit ce que le test Node a réellement montré le 7 novembre 2026.

| Cible | Constaté ici | Pas constaté |
| --- | --- | --- |
| 0 réécriture de `FA-2026-3` et `FA-2026-0003` sur la fixture | Oui, test `fixture historique` | Aucune base réelle d’appareil |
| 0 écriture si le JSON est illisible ou si le schéma est 9 | Oui, tests dédiés, `kv.sets` vide | Un stockage corrompu sur iPhone |
| 0 nouveau lien de cache avec `persisted: true` | Oui, `decideAttachment` | Le sélecteur natif n’a pas été lancé |
| `cutoverAllowed()` reste faux | Oui | Une sauvegarde appareil vérifiée |
| Aucun KPI d’usage publié | Il n’y a pas d’analytics | Tout chiffre d’activation |

## Preuves (commit `e648daa`, avant cette PR)

- Préfixe : `src/lib/storage.ts:13`
- `loadJSON` avale l’erreur et rend le repli : `src/lib/storage.ts:25-30`
- Crash qui réécrit après ce repli : `src/lib/crash.ts:15-17`
- JSON de migration illisible : pas d’écriture, `src/lib/migrate.ts:337-338`
- Schéma déjà supérieur ou égal : retour sans migration, `src/lib/migrate.ts:115`, sans gel d’écriture ensuite
- Cache marqué conservé hors web : `src/app/expense/[id].tsx:38-41`
- CSV sans les octets du justificatif : `src/lib/backup.ts:108`
- Padding des nouveaux numéros : `src/lib/numbering.ts:28-29` et comparaison exacte `src/lib/numbering.ts:107-110`
- Totaux au centime : `src/lib/model.ts:149-152`
- Montant QR : `src/lib/qrbill.ts:55`
- Référence QR dépendante des chiffres : `src/lib/iban.ts:32-37`
- iPad déclaré, portrait : `app.json:8` et `app.json:17`
- CI sans `npm test` : `.github/workflows/pages.yml:30-31`

## Ce que la PR de fondation change

Fichier nouveau `src/lib/preserve.ts`. Pas de nouvelle version de schéma, pas de réécriture des factures déjà stockées au chargement, pas de dépendance, pas de backend.

- Schéma supérieur à 2 : `preserveOnly`, aucune clé métier écrite.
- Enregistrement d’une facture : le numéro déjà présent est gardé, y compris si une édition propose la forme paddée. Les champs inconnus présents sur l’objet précédent restent.
- Nouveau justificatif : `persisted` n’est vrai que si les octets sont dans un data URL. Un lien de cache reste le lien, avec un avertissement. L’app n’efface pas le fichier. Les fiches déjà stockées ne sont pas réécrites toutes seules ; l’écran dit la vérité d’après l’URI.
- Journal de crash : un texte illisible n’est pas remplacé.
- `cutoverAllowed()` est faux, sans paramètre pour le forcer.

## Tests réellement exécutés

Commandes, dans ce clone, après `npm ci` :

- `npx tsc --noEmit` : succès.
- `npm test` : 37 tests passés, 1 ignoré (`VIBECODE_REAL_EXPORT` absent du dépôt). Les 9 tests de `tests/preserve.test.ts` sont inclus. Fixtures : `tests/fixtures/preserve/historic-store.json`, `invoices-corrupt.txt`, `future-schema.json`.

Non exécuté : Expo, simulateur, iPhone, iPad, Mac, navigateur, export web, EAS, store, restauration d’une vraie sauvegarde, lecture du système de fichiers. Le sous-titre du justificatif n’a pas été vu à l’écran.

Ces tests prouvent des égalités sur des chaînes et des objets en mémoire. Ils ne prouvent pas zéro perte.

## Inconnues

- Contenu réel du stockage d’un appareil déjà utilisé, s’il en existe un.
- Tenue d’un data URL volumineux dans AsyncStorage.
- Succès de `fetch` sur une URI `file://` iOS : en cas d’échec, l’URI d’origine est gardée et `persisted` reste faux.
- Cas d’arrondi flottant autres que 1 × 10,10 à 8,1 %.
- Certification SIX de la QR-facture.
- Qualification juridique nLPD / RGPD.
- La quarantaine est renvoyée à l’appelant de `loadAndMigrate` et n’a pas d’écran d’export. L’original reste la clé déjà présente, parce qu’aucune écriture n’est faite.

# Kaizen

Petites améliorations sûres. `main` n’est pas fusionné depuis ces entrées.

## 2026-11-23

Écart visé : QR-facture suisse (repère bexio). Les factures déjà émises ne sont pas réécrites : numéro, lignes, montant et référence QR restent ceux du stockage.

### 1. Géométrie du QR (SIX)

**Avant.** Le SVG annonçait 46 mm, mais il était dans une colonne flexible de la section paiement, sans `min-width` ni `flex: 0 0 46mm`. À l’impression la colonne d’informations le comprimait (souvent vers ~35 mm). La croix était déjà au ratio 7/46.

**Après.** Boîte verrouillée 46 × 46 mm (`qrBoxStyle`), croix 7 × 7 mm, récépissé 62 × 105 mm et section paiement 148 × 105 mm en `flex: 0 0` (ils ne rétrécissent plus). Aucun `35mm` dans le HTML.

**Fichiers.** `src/lib/qrbill.ts`, `src/lib/documents.ts`

**Tests.** `tests/kaizen-2026-11-23.test.ts` (symbole, boîte, bandes). `tests/passe1.test.ts` (QR décodé, 46 mm) reste vert.

### 2. Convertir une offre en facture en un geste

**Avant.** Le bouton « Convertir en facture » était petit, dans la rangée du bas, et absent tant que l’offre n’avait pas de numéro.

**Après.** Bouton principal « Convertir en facture » sur la fiche (il enregistre puis ouvre le brouillon). Dans Ventes, les offres envoyées ou acceptées ont « Facturer ». Une offre déjà liée ne crée pas une seconde facture. Le brouillon naît sans numéro : le numéro n’est posé qu’à l’émission.

**Fichiers.** `src/lib/offers.ts`, `src/lib/data.tsx`, `src/app/offer/[id].tsx`, `src/app/(tabs)/sales.tsx`

**Tests.** `tests/kaizen-2026-11-23.test.ts` (brouillon neuf, offre et facture émise inchangées).

### 3. Section paiement lisible

**Avant.** Toute la bande QR était en 8 pt, y compris les valeurs de la section paiement et le montant.

**Après.** Récépissé toujours en 8 pt. Valeurs de la section paiement en 10 pt, montant en 11 pt gras (guide de style SIX). Le libellé « Scannez pour payer » reste au-dessus de la bande.

**Fichiers.** `src/lib/documents.ts`

**Tests.** `tests/kaizen-2026-11-23.test.ts` (`payinfo` 10 pt, montant 11 pt).

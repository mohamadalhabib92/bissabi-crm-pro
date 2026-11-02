# Bissabi CRM Pro

CRM et facturation pour **Bissabi Drinks - BA** (Chemin de la Suettaz 17, 1008 Prilly · IDE CHE-332.255.936) — *Swiss Premium Botanical Beverage Brand Inspired by the Sahel*. Cible : HORECA de Suisse romande. Livraison : canton de Vaud uniquement, offerte dès CHF 36.

Expo / React Native (iOS, Android) + PWA installable. **Fonctionne entièrement hors ligne** (données sur l'appareil) : aucun écran « Loading » bloquant, aucun appel payant (pas de 402) dans le parcours principal.

## Fonctions
- **Tableau de bord** : CA, encaissements, ouvert, dépenses, marge, TVA collectée (+ export CSV), filtre Mois / Trimestre / Année / Tout, factures en retard, prochaines actions.
- **Comptes** : recherche, filtres canton / type / étape, historique offres-factures, import / export CSV.
- **Pipeline** à 6 étapes fixes : Prospect → Contacté → RDV/échantillon → Essai → Première commande → Client actif.
- **Hors Vaud** : `livraison_ok=false` + avertissement « hors zone livraison actuelle » (non bloquant).
- **Offres** : création, duplication, envoi (PDF + brouillon e-mail), acceptée / refusée, conversion en facture.
- **Factures** : TVA **Oui / Non** par facture (taux 8.1 / 2.6 / 3.8 / 0 %). « Non » → mention « TVA non applicable ».
- **QR-facture suisse** (SPC 0200, référence SCOR/RF ou QRR si QR-IBAN) : QR **46×46 mm**, récépissé 62×105 mm, section paiement 148×105 mm, « Scannez pour payer (TWINT / e-banking) » au-dessus de la section. SPÉCIMEN tant que l’IBAN n’est pas valide. Logo vert sur les documents.
- **Numéros** : les factures déjà émises gardent leur numéro. La suite continue après le dernier. Une facture émise ne se supprime pas : on émet un avoir.
- **Sauvegarde** : export JSON complet, CSV hors démo, fichier chiffré (phrase secrète), restauration avec retour arrière. Migration de schéma versionnée, sauvegarde automatique avant migration.
- **Message de remerciement adaptatif** (HORECA / autre) au paiement.
- **Dépenses** : catégories, justificatif (photo / PDF), filtre période, total, export CSV.
- **CSV TVA** : n° facture, date, client, HT, taux, montant TVA, TTC, TVA Oui/Non.
- Langue : FR d'abord. Navigation en DE / IT / EN ; écrans et PDF encore en FR.

## Import CSV des comptes
Séparateur `;`, en-têtes **exacts** :
```
nom;type;etape;canton;ville;livraison_ok;mode_logistique;contact_nom;contact_role;contact_email;contact_tel;prochaine_action;prochaine_action_date;notes;source
```
Les étapes sont mappées strictement sur les 6 étapes ; une ligne invalide est rejetée avec son motif (rapport téléchargeable). Un modèle est disponible dans l'écran d'import.

## IBAN — important
Aucun IBAN n'est fourni : la valeur par défaut est `YOUR_SWISS_IBAN`. Tant qu'un IBAN valide (contrôle mod 97) n'est pas saisi dans **Réglages**, les QR-factures portent la mention **SPÉCIMEN** et ne doivent pas être envoyées.

## Données de démonstration
Comptes, offre, facture et dépense d'exemple, marqués « démo » (« Café Exemple (démo) », etc.). Bouton « Supprimer les données démo » sur le tableau de bord et dans Réglages.

## Démarrer
```bash
npm install
npx expo start          # « w » pour le web, ou QR code avec Expo Go
npx tsc --noEmit
npm run build:web       # expo export -p web + service worker, 404.html, .nojekyll → dist/
```
Servie sous `/bissabi-crm-pro` (`experiments.baseUrl`). `.github/workflows/pages.yml` publie `dist/` sur GitHub Pages à chaque push sur `main` (Settings → Pages → Source : GitHub Actions).

## Configuration (optionnelle)
Copier `.env.example` vers `.env`. Valeurs `YOUR_*` uniquement. `EXPO_PUBLIC_EXAMPLE_ENV_VAR` est supprimée. `BETTER_AUTH_SECRET` et `DATABASE_URL` sont **obsolètes** (aucun backend dans ce dépôt) et ne sont pas lues. Sentry et Supabase restent désactivés tant que le placeholder n’est pas remplacé. Aucun appel réseau au démarrage.

## Limites connues
- Logo vert provisoire (wordmark) : remplacer `src/lib/logo.ts` par le logo officiel.
- QR imprimé à 46 × 46 mm (SPÉCIMEN tant que l’IBAN est `YOUR_SWISS_IBAN`). À faire valider par la banque de Mohamed avant un envoi réel.
- Pas de synchronisation multi-appareils : sauvegarde par export JSON, CSV et fichier chiffré.
- PDF et e-mails en français uniquement.

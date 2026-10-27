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
- **QR-facture suisse** (SPC 0200, référence SCOR/RF ou QRR si QR-IBAN) : QR ≈ 3,5 cm, « Scannez pour payer (TWINT / e-banking) », créancier = la société. Logo vert sur les documents.
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
Copier `.env.example` vers `.env`. Seule `EXPO_PUBLIC_BACKEND_URL` est lue par l'app ; `BETTER_AUTH_SECRET`, `DATABASE_URL`, `WIX_SITE_ID`, `WIX_SITE_URL` restent **côté serveur**. Toutes les valeurs sont des `YOUR_*` à remplacer.

## Limites connues
- Logo vert provisoire (wordmark) : remplacer `src/lib/logo.ts` par le logo officiel.
- QR imprimé à 35 mm (demande ≈ 3,5 cm) ; la norme SIX prévoit 46 × 46 mm : vérifier avec votre banque avant usage réel.
- Pas de synchronisation multi-appareils sans backend ; sauvegarde via export JSON.
- PDF et e-mails en français uniquement.

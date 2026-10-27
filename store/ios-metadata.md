# Bissabi CRM Pro — fiche App Store (brouillon)

> Brouillon à recopier dans App Store Connect. Rien n'a été soumis.

| Champ | Valeur |
|---|---|
| Nom (≤ 30) | Bissabi CRM Pro (15 car.) |
| Sous-titre (≤ 30) | CRM, offres et QR-factures (26 car.) |
| Bundle ID | `com.vibecode.bissabicrmpro-h7qq2g` |
| SKU proposé | `bissabi-crm-pro-ios-001` |
| Projet EAS | `dcf8624c-52fa-4862-8f7a-10858db2056d` (compte habib548) |
| Version / build | 1.0.0 / numéro de build géré par EAS (remote, autoIncrement) |
| Langue principale | Français |
| Catégorie principale | Économie et entreprise (Business) |
| Catégorie secondaire | Productivité (Productivity) |
| Prix | Gratuit |
| URL de confidentialité | https://mohamadalhabib92.github.io/bissabi-crm-pro/privacy/ |
| URL d'assistance | https://mohamadalhabib92.github.io/bissabi-crm-pro/support/ |
| URL marketing | https://mohamadalhabib92.github.io/bissabi-crm-pro/ |
| Copyright | 2026 Bissabi Drinks - BA (Mohamed El Habib Ba) |
| Appareils | iPhone + iPad (supportsTablet) |
| Chiffrement | Aucun chiffrement non exempté (ITSAppUsesNonExemptEncryption = false) |

## Texte promotionnel (≤ 170)
Le CRM de Bissabi Drinks : comptes HORECA, pipeline, offres, QR-factures suisses et suivi des dépenses, hors ligne.

## Mots-clés (≤ 100, séparés par des virgules)
`CRM,facture,QR-facture,TVA,offre,devis,HORECA,clients,pipeline,Suisse,dépenses,CSV` (82 car.)

## Description — FR
Bissabi CRM Pro est l'outil commercial et de facturation de Bissabi Drinks - BA.

• Tableau de bord : chiffre d'affaires, encaissements, factures en retard, dépenses, marge, TVA.
• Comptes clients avec recherche et filtres, import et export CSV.
• Pipeline en 6 étapes, du prospect au client actif.
• Offres : création, duplication, conversion en facture.
• Factures avec QR-facture suisse et TVA au choix.
• Dépenses avec justificatifs (photo ou PDF).
• Export CSV pour la TVA.

Les données restent sur l'appareil, sans compte ni serveur.

## Description — EN
Bissabi CRM Pro is the sales and invoicing tool of Bissabi Drinks - BA: dashboard, customer accounts with CSV import/export, a 6-stage pipeline, quotes, Swiss QR-bill invoices with optional VAT, expenses with receipts, and VAT CSV export. All data stays on the device.

## Classification par âge
4+ — réponses au questionnaire : aucune violence, aucun contenu sexuel, pas de jeux d'argent, pas de navigation web non filtrée, pas de contenu médical, pas de messagerie entre utilisateurs.

## Confidentialité de l'app (étiquettes « nutrition »)
- **Collecte de données : « Nous ne collectons pas de données »** (Data Not Collected). Tout est stocké uniquement sur l'appareil et n'est transmis ni à l'éditeur ni à des tiers (au sens d'Apple, il n'y a donc pas de « collecte »).
- Suivi (tracking) : Non. Pas d'identifiant publicitaire.
- À revoir si un backend (Supabase, Stripe, API) est activé dans une version future.

Données stockées localement (pour information) :
- Les comptes clients que vous saisissez ou importez (nom de l'établissement, contacts professionnels : nom, fonction, e-mail, téléphone, notes) ;
- Vos offres, factures, paiements et dépenses, ainsi que les justificatifs que vous joignez ;
- Les réglages de l'entreprise (coordonnées, IBAN saisi par vous).

Autorisations :
- Sélecteur de fichiers / photos du système, uniquement quand vous joignez un justificatif ou importez un CSV.

## Notes pour l'équipe de révision (App Review)
Outil interne de Bissabi Drinks - BA. Aucun compte : l'app s'ouvre directement. Tant qu'aucun IBAN n'est saisi dans Réglages, les QR-factures portent la mention SPÉCIMEN. Aucun paiement n'est effectué dans l'app (les QR-factures sont payées hors de l'app, par e-banking).

Contact révision : à compléter (prénom, nom, téléphone, e-mail de Mohamed). Compte de démonstration : non requis.

## Captures d'écran à fournir
- iPhone 6,9 pouces (1320 × 2868 ou 1290 × 2796) : 3 à 10 captures.
- iPad 13 pouces (2064 × 2752 ou 2048 × 2732) : 3 à 10 captures (obligatoire car l'app est disponible sur iPad).

## Risques de refus (App Review) et corrections
| Niveau | Risque | À faire avant soumission |
|---|---|---|
| Élevé | 3.2 / 4.2 App propre à une seule entreprise : l'adresse, l'IDE et le pipeline sont ceux de Bissabi. Apple refuse en général ces apps sur l'App Store public. | Publier en « distribution non répertoriée » (Unlisted App) ou se limiter à TestFlight pour usage interne ; sinon rendre l'entreprise configurable pour tout utilisateur. |
| Moyen | 2.1 Le mode SPÉCIMEN pourrait sembler incomplet. | Le mentionner dans les notes de révision (fait) et préremplir un exemple. |

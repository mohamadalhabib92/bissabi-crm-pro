# Téléphonie IA

Assistante vocale B2B pour Bissabi Drinks et Bissabi Home Made. Les écrans sont dans l’app Expo (onglet **Tél. IA**). Les appels passent par un gateway Node long-running. Les données de cette section vivent dans Supabase `bissabi-crm` (Zurich, `eu-central-2`). Le reste du CRM (comptes, factures, dépenses) reste sur l’appareil, dans AsyncStorage : cette livraison ne le migre pas.

Rien dans ce dépôt n’a été appliqué au projet Supabase distant.

## Ce qui est en place

- Prompts français : `prompts/outbound.md`, `prompts/inbound.md`, schémas d’outils `prompts/tools.json`.
- Migration idempotente : `supabase/migrations/20261113193000_telephonie_ia.sql` (étend `clients`, `contacts`, `tasks`).
- Gateway : `services/voice-gateway` (Telnyx par défaut, Twilio en second, voix xAI Grok, pipeline UE en stub, agenda Google, Outlook en stub).
- Écrans : tableau de bord, journal, détail d’appel, scripts / personas / voix, campagnes (CSV, pause, A/B), liste ne-pas-appeler, base de connaissances.
- Moteur de conformité testé (plages, fériés Vaud, DNC, annuaire, B2B, bac à sable) et outils d’appel (`create_lead`, `update_contact`, `book_meeting`, `transfer_call`, `add_to_dnc`, `log_call_summary`, `lookup_knowledge_base`).

## Règles codées

- Lun–ven 09:00–11:30 et 14:00–17:30, Europe/Zurich. Restaurants, cafés, bars et hôtels : 14:30–17:00. Pas le samedi, le dimanche, ni les fériés vaudois et le 1er août.
- Prospection seulement si le numéro est inscrit à l’annuaire sans astérisque, vérifié depuis moins de 180 jours. Un client actif peut être appelé même non inscrit.
- Refus de sollicitation → `add_to_dnc` immédiat. L’assistante ne retire personne de la liste.
- Transfert à chaud seulement pendant ces plages, vers `TRANSFER_PHONE_NUMBER`. Sinon, prise de rappel.
- Pas d’enregistrement audio en v1 (`RECORDING_ENABLED=false`). Transcriptions conservées 24 mois une fois la purge planifiée.
- La première phrase d’un script doit contenir « assistante IA de Bissabi ».
- Aucun prix inventé : la voix lit `kb_articles` publiés.

## Variables

L’app (publiques, clé **anon** seulement) :

| Variable | Rôle |
|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | URL du projet |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Clé anon. Jamais la clé `service_role` |

Le gateway (`services/voice-gateway/.env`, voir `.env.example`) :

| Variable | Rôle |
|---|---|
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | Écritures serveur |
| `BISSABI_OWNER_ID` | UUID du compte propriétaire |
| `PUBLIC_GATEWAY_URL` | URL https du gateway (webhooks + flux média) |
| `SANDBOX_MODE` | `true` par défaut |
| `SANDBOX_ALLOWLIST` | Numéros E.164 autorisés, séparés par des virgules. Le vôtre. |
| `TRANSFER_PHONE_NUMBER` | Portable pour le transfert. Aucun numéro n’est écrit dans le code. |
| `OWNER_DISPLAY_NAME` | Nom prononcé avant un transfert. Défaut : « le responsable Bissabi » |
| `TELEPHONY_PROVIDER` | `telnyx` (défaut) ou `twilio` |
| `TELNYX_API_KEY` / `TELNYX_PUBLIC_KEY` / `TELNYX_CONNECTION_ID` / `TELNYX_FROM_NUMBER` | Compte Telnyx, endpoint UE |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_FROM_NUMBER` | Adaptateur secondaire |
| `VOICE_PROVIDER` | `grok` ou `eu_pipeline` |
| `XAI_API_KEY` / `XAI_VOICE_MODEL` | Grok Voice (`grok-voice-latest`) |
| `EU_STT_URL` / `EU_LLM_URL` / `EU_TTS_URL` | Plan B. Sans les trois, l’adaptateur refuse la session. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REFRESH_TOKEN` / `GOOGLE_CALENDAR_ID` | Agenda |
| `OUTLOOK_ACCESS_TOKEN` | Stub Graph, inactif sans jeton |
| `RECORDING_ENABLED` | Laisser `false` |
| `PORT` / `DIALER_INTERVAL_MS` / `PROMPTS_DIR` | Réseau et prompts |

Copier les exemples. Ne pas committer `.env`.

## Mise en route

1. Créer un utilisateur dans Supabase Auth (e-mail + mot de passe). Son `id` est `BISSABI_OWNER_ID`. Au lancement il est admin : `auth.uid()` est le propriétaire. Un agent se ajoute plus tard dans `team_members`.
2. Appliquer **vous-même**, quand vous le décidez, la migration SQL sur le projet Zurich. Ne pas la lancer deux fois en parallèle. Elle suppose les tables CRM déjà là (`clients`, `contacts`, `tasks`, `products`).
3. Dans l’app, onglet Tél. IA : la première connexion crée `tel_settings` (bac à sable activé) et les plages par défaut.
4. Coller les prompts dans l’éditeur de scripts, choisir la voix (`ara`, `eve`, `leo`, `rex`, `sal`, ou un voice id xAI), publier la version. Une version publiée ne se réécrit pas.
5. Renseigner la base de connaissances (tarifs surtout) avant tout appel réel.

```bash
npm install
npm test
npx tsc --noEmit
npx expo export -p web
```

Gateway, en local :

```bash
cd services/voice-gateway
cp .env.example .env
npm install
npm run dev
```

Image :

```bash
docker build -f services/voice-gateway/Dockerfile -t bissabi-voice-gateway .
```

Héberger le conteneur en Suisse ou à Francfort (Infomaniak, Exoscale, Hetzner). Le serverless ne tient pas un WebSocket de plusieurs minutes. Pointer les webhooks Telnyx vers `https://<hôte>/webhooks/telnyx` et le flux média vers `wss://<hôte>/media`.

Santé : `GET /health`.

## Bac à sable, sur votre numéro

1. `SANDBOX_MODE=true`
2. `SANDBOX_ALLOWLIST=+41…` (votre portable, le même que `TRANSFER_PHONE_NUMBER`)
3. Dans `tel_settings`, `sandbox_mode` reste vrai et `sandbox_allowlist` contient ce numéro. L’app ne le devine pas : mettez-le dans la base (SQL ou table) en E.164.
4. Créer une campagne, importer une seule ligne CSV avec ce numéro, un établissement de test, statut Prospect. Tant que l’annuaire n’est pas `inscrit_ok` et daté, la conformité exclut la ligne : pour un essai, passez la fiche de test en `relationship = client_actif` **ou** renseignez `directory_status = inscrit_ok` et `directory_checked_at = now()`.
5. Lancer le gateway avec la clé Telnyx de test et `TELNYX_FROM_NUMBER`. Reprendre la campagne. Le dialer rappelle `tel_check_outbound` juste avant de composer. Un autre numéro est refusé, même si la base est en retard.
6. Les appels `is_sandbox` ne comptent pas dans le tableau de bord.

## Encore manuel

- Compte Telnyx, achat du +41 21, dossier d’usage professionnel, inscription du numéro à l’annuaire (LCD, prospection).
- Clé xAI, et la mention dans la politique de confidentialité : l’audio Grok n’est pas traité en Suisse.
- Déploiement du gateway et URL publique TLS.
- Application de la migration et création du compte Auth.
- Consentement OAuth Google (et plus tard Outlook) pour poser les rendez-vous dans l’agenda.
- `pg_cron` n’est pas activé par la migration. Le gateway réserve la file lui-même. Plus tard, si vous activez l’extension : `tel_release_stale_locks` chaque minute et `tel_purge_retention` la nuit.
- Le pipeline STT + LLM + TTS hébergé dans l’UE est une interface seulement. Twilio compose et vérifie la signature ; le pont de transfert Twilio n’est pas fait.
- Aucun audio n’est stocké. Le seau privé `call-recordings` est créé pour plus tard, vide.

## Rôles

`admin` : scripts, campagnes, numéros, réglages, retrait DNC. `agent` : journal, rendez-vous, correction du résultat, ajout à la DNC. Au lancement, un seul utilisateur, le propriétaire, qui a les droits admin.

-- =============================================================================
-- Bissabi CRM · Section « Téléphonie IA » · Schéma Postgres (Supabase)
-- Cible : projet Supabase « bissabi-crm » (ref ppeovmfuhtidavdnrwxu, région eu-central-2 Zurich)
-- Version : 0.2 (migration de dépôt, NON appliquée au projet live) · 13.11.2026
-- Adaptations par rapport au SQL 0.1 validé :
--   * voice_provider par persona (grok | eu_pipeline)
--   * plages « horeca » (restaurants / cafés) en plus des plages générales
--   * numéro appelant inscrit à l'annuaire (LCD let. v) hors bac à sable
--   * raison explicite « samedi » s'il n'y a pas de plage
--   * garde d'accès sur les fonctions exposées, file post-appel, purge, seeds
-- Ne pas exécuter ce fichier sur le projet Supabase distant depuis l'app ou le CI.
--
-- Principes :
--  * On ÉTEND l'existant (public.clients = entreprises/comptes, public.contacts = personnes,
--    public.tasks, public.activities, public.audit_log) au lieu de dupliquer.
--  * Les nouvelles tables sont préfixées tel_ (téléphonie) ; ids uuid, FK text vers l'existant
--    (les ids existants sont des text de type cuid).
--  * Même modèle multi-tenant que l'existant : owner_id = compte propriétaire (auth.users),
--    + table team_members pour les rôles admin / agent.
--  * Le voice gateway et les workers utilisent la clé service_role (bypass RLS) ; l'app CRM
--    utilise la clé anon + JWT utilisateur (RLS appliquée).
--  * Tout est idempotent autant que possible (IF NOT EXISTS) ; à appliquer en migration.
-- =============================================================================

create extension if not exists pgcrypto;      -- déjà installé sur bissabi-crm

do $$ begin
  if to_regclass('public.clients') is null or to_regclass('public.contacts') is null
     or to_regclass('public.tasks') is null or to_regclass('public.products') is null then
    raise exception 'Migration Téléphonie IA : tables public.clients/contacts/tasks/products absentes. Elle étend le schéma existant de bissabi-crm.';
  end if;
end $$;
-- Optionnels (à activer dans le dashboard Supabase au moment du déploiement) :
-- create extension if not exists pg_cron;    -- planification (tick du dialer, purge rétention)
-- create extension if not exists pgmq;       -- Supabase Queues (post-traitement des appels)
-- create extension if not exists vector;     -- recherche sémantique dans la base de connaissances

-- -----------------------------------------------------------------------------
-- 0. Types énumérés
-- -----------------------------------------------------------------------------
do $$ begin
  create type public.tel_role               as enum ('admin','agent');
  create type public.tel_direction          as enum ('inbound','outbound');
  create type public.tel_call_status        as enum ('queued','dialing','ringing','in_progress','completed',
                                                     'no_answer','busy','failed','canceled','voicemail','blocked_compliance');
  create type public.tel_answered_by        as enum ('human','machine','fax','unknown');
  create type public.tel_outcome            as enum ('interesse','a_rappeler','refus','ne_plus_appeler',
                                                     'rdv_pris','echantillon','catalogue','transfere',
                                                     'message_laisse','info_donnee','commande','sav','autre');
  create type public.tel_sentiment          as enum ('tres_negatif','negatif','neutre','positif','tres_positif');
  create type public.tel_campaign_status    as enum ('brouillon','planifiee','active','en_pause','terminee','archivee');
  create type public.tel_cc_status          as enum ('en_attente','planifie','en_cours','a_rappeler','termine',
                                                     'exclu','max_tentatives','erreur');
  create type public.tel_script_kind        as enum ('outbound','inbound','voicemail');
  create type public.tel_version_status     as enum ('brouillon','publiee','archivee');
  create type public.tel_dnc_source         as enum ('demande_orale','annuaire_asterisque','non_inscrit_annuaire',
                                                     'manuel','email','droit_opposition_nlpd','import');
  create type public.tel_directory_status   as enum ('inconnu','inscrit_ok','inscrit_asterisque','non_inscrit');
  create type public.tel_relationship       as enum ('prospect','client_actif','ancien_client','partenaire');
  create type public.tel_consent_kind       as enum ('enregistrement','transcription','prospection','sms_whatsapp');
  create type public.tel_consent_status     as enum ('accorde','refuse','retire');
  create type public.tel_appt_status        as enum ('propose','confirme','annule','realise','no_show');
  create type public.tel_calendar_provider  as enum ('google','outlook','aucun');
  create type public.tel_dsr_kind           as enum ('acces','rectification','suppression','opposition','portabilite');
  create type public.tel_dsr_status         as enum ('recue','en_cours','traitee','rejetee');
  create type public.tel_telephony_provider as enum ('telnyx','twilio');
  create type public.tel_kb_status          as enum ('brouillon','publie','archive');
exception when duplicate_object then null; end $$;

-- -----------------------------------------------------------------------------
-- 1. Utilitaires : updated_at + rôles (admin / agent)
-- -----------------------------------------------------------------------------
create or replace function public.tel_set_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at := now(); return new; end $$;

-- Membres de l'équipe d'un compte propriétaire (owner_id = compte Bissabi).
create table if not exists public.team_members (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        public.tel_role not null default 'agent',
  display_name text,
  transfer_phone_e164 text check (transfer_phone_e164 ~ '^\+[1-9][0-9]{6,14}$'),
  accepts_transfers boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (owner_id, user_id)
);

-- Accès : le propriétaire lui-même ou un membre de son équipe.
create or replace function public.tel_has_access(p_owner uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select (select auth.uid()) = p_owner
      or exists (select 1 from public.team_members m
                 where m.owner_id = p_owner and m.user_id = (select auth.uid()));
$$;

create or replace function public.tel_is_admin(p_owner uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select (select auth.uid()) = p_owner
      or exists (select 1 from public.team_members m
                 where m.owner_id = p_owner and m.user_id = (select auth.uid()) and m.role = 'admin');
$$;

-- -----------------------------------------------------------------------------
-- 2. Extension des tables existantes (contacts / comptes / tâches)
-- -----------------------------------------------------------------------------
-- public.clients = entreprise / compte (restaurant, épicerie, hôtel…)
alter table public.clients
  add column if not exists phone_e164            text check (phone_e164 is null or phone_e164 ~ '^\+[1-9][0-9]{6,14}$'),
  add column if not exists business_unit         text not null default 'drinks',   -- drinks | home_made | autre
  add column if not exists is_b2b                boolean not null default true,
  add column if not exists relationship          public.tel_relationship not null default 'prospect',
  add column if not exists directory_status      public.tel_directory_status not null default 'inconnu',
  add column if not exists directory_checked_at  timestamptz,
  add column if not exists directory_source      text,           -- ex. 'local.ch', 'search.ch', 'manuel'
  add column if not exists do_not_call           boolean not null default false,
  add column if not exists preferred_language    text,           -- fr | en | ar | de
  add column if not exists best_call_hours       text,           -- texte libre (« après 14h30 »)
  add column if not exists qualification         jsonb not null default '{}'::jsonb, -- besoin, volume, décideur…
  add column if not exists last_call_at          timestamptz,
  add column if not exists last_call_outcome     public.tel_outcome;

-- public.contacts = personne rattachée à un compte
alter table public.contacts
  add column if not exists phone_e164        text check (phone_e164 is null or phone_e164 ~ '^\+[1-9][0-9]{6,14}$'),
  add column if not exists language          text,
  add column if not exists is_decision_maker boolean,
  add column if not exists do_not_call       boolean not null default false,
  add column if not exists updated_at        timestamptz not null default now();

-- public.tasks : tâches créées par l'assistante (rappel, message, SAV…)
alter table public.tasks
  add column if not exists description  text,
  add column if not exists priority     smallint not null default 2 check (priority between 1 and 4), -- 1 = urgent
  add column if not exists assignee_id  uuid references auth.users(id) on delete set null,
  add column if not exists source       text not null default 'manuel',   -- manuel | ia_appel
  add column if not exists contact_id   text references public.contacts(id) on delete set null,
  add column if not exists updated_at   timestamptz not null default now();

create index if not exists clients_phone_e164_idx  on public.clients(owner_id, phone_e164);
create index if not exists contacts_phone_e164_idx on public.contacts(owner_id, phone_e164);
create index if not exists clients_segment_idx     on public.clients(owner_id, type, city, stage);
create index if not exists tasks_open_idx          on public.tasks(owner_id, done, due_date);

drop trigger if exists trg_contacts_updated on public.contacts;
create trigger trg_contacts_updated before update on public.contacts for each row execute function public.tel_set_updated_at();
drop trigger if exists trg_tasks_updated on public.tasks;
create trigger trg_tasks_updated before update on public.tasks for each row execute function public.tel_set_updated_at();

-- -----------------------------------------------------------------------------
-- 3. Paramètres, numéros, fenêtres d'appel, jours fériés
-- -----------------------------------------------------------------------------
create table if not exists public.tel_settings (
  owner_id               uuid primary key references auth.users(id) on delete cascade,
  provider               public.tel_telephony_provider not null default 'telnyx',
  default_transfer_e164  text check (default_transfer_e164 ~ '^\+[1-9][0-9]{6,14}$'),
  timezone               text not null default 'Europe/Zurich',
  home_canton            text not null default 'VD',
  b2b_only               boolean not null default true,
  sandbox_mode           boolean not null default true,     -- bac à sable : seuls les numéros de sandbox_allowlist
  sandbox_allowlist      text[] not null default '{}',
  recording_enabled      boolean not null default false,
  recording_retention_days   int not null default 90  check (recording_retention_days between 1 and 3650),
  transcript_retention_days  int not null default 730 check (transcript_retention_days between 1 and 3650),
  directory_check_max_age_days int not null default 180,
  max_concurrent_calls   int not null default 2 check (max_concurrent_calls between 1 and 50),
  monthly_budget_chf     numeric(10,2),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create table if not exists public.tel_phone_numbers (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references auth.users(id) on delete cascade,
  provider      public.tel_telephony_provider not null,
  e164          text not null unique check (e164 ~ '^\+41[0-9]{9}$'),
  provider_ref  text,                       -- id du numéro chez le fournisseur
  label         text,                       -- « Ligne Bissabi Drinks »
  listed_in_directory boolean not null default false,  -- LCD art. 3 al. 1 let. v : numéro affiché inscrit à l'annuaire
  inbound_enabled  boolean not null default true,
  outbound_enabled boolean not null default false,
  inbound_script_id uuid,                   -- FK ajoutée plus bas
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Plages autorisées (outbound). campaign_id null = règle par défaut du compte.
create table if not exists public.tel_calling_windows (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  campaign_id uuid,                         -- FK ajoutée plus bas
  -- null = plage générale ; horeca = restaurants / cafés / bars / hôtels (14:30–17:00 par défaut)
  segment     text check (segment is null or segment = 'horeca'),
  weekday     smallint not null check (weekday between 1 and 6),  -- ISO : 1 = lundi … 6 = samedi ; 7 (dimanche) interdit
  start_time  time not null,
  end_time    time not null,
  created_at  timestamptz not null default now(),
  check (start_time < end_time),
  check (start_time >= time '08:00' and end_time <= time '20:00'),  -- garde-fou « heures raisonnables »
  unique nulls not distinct (owner_id, campaign_id, weekday, start_time, end_time, segment)
);

-- Jours fériés fédéraux / cantonaux (canton null = fédéral, s'applique partout)
create table if not exists public.tel_holidays (
  id        uuid primary key default gen_random_uuid(),
  day       date not null,
  canton    text,                           -- 'VD', 'GE', … ou null
  label     text not null,
  unique nulls not distinct (day, canton)
);

-- -----------------------------------------------------------------------------
-- 4. Personnalité, scripts versionnés, base de connaissances
-- -----------------------------------------------------------------------------
create table if not exists public.tel_personas (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references auth.users(id) on delete cascade,
  name          text not null,               -- « Awa – assistante IA Bissabi »
  voice_provider text not null default 'grok' check (voice_provider in ('grok', 'eu_pipeline')),
  voice_id      text not null,               -- id de voix du moteur (ex. xAI 'ara', 'eve', ou id personnalisé)
  default_language text not null default 'fr',
  languages     text[] not null default '{fr,en,ar}',
  tone          text,                        -- chaleureux, pro, concis…
  speaking_rate numeric(3,2) not null default 1.0 check (speaking_rate between 0.7 and 1.5),
  traits        jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (owner_id, name)
);

create table if not exists public.tel_scripts (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references auth.users(id) on delete cascade,
  kind          public.tel_script_kind not null,
  name          text not null,
  business_unit text not null default 'drinks',
  persona_id    uuid references public.tel_personas(id) on delete set null,
  current_version_id uuid,                   -- FK ajoutée plus bas (version publiée active)
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (owner_id, name)
);

-- Versions immuables une fois publiées : on crée une nouvelle version pour modifier.
create table if not exists public.tel_script_versions (
  id            uuid primary key default gen_random_uuid(),
  script_id     uuid not null references public.tel_scripts(id) on delete cascade,
  owner_id      uuid not null references auth.users(id) on delete cascade,
  version       int not null,
  status        public.tel_version_status not null default 'brouillon',
  language      text not null default 'fr',
  system_prompt text not null,               -- prompt système complet
  opening_line  text not null,               -- doit contenir l'annonce IA (contrôle ci-dessous)
  voicemail_message text,                    -- message déposé sur répondeur
  objections    jsonb not null default '[]'::jsonb, -- [{objection, reponse}]
  qualification_fields jsonb not null default '["besoin","volume","decideur"]'::jsonb,
  tools_enabled text[] not null default '{create_lead,update_contact,book_meeting,transfer_call,add_to_dnc,log_call_summary}',
  changelog     text,
  created_by    uuid references auth.users(id) on delete set null,
  published_at  timestamptz,
  created_at    timestamptz not null default now(),
  unique (script_id, version),
  check (opening_line ~* '\m(IA|intelligence artificielle|AI|artificial intelligence)\M')   -- annonce IA obligatoire
);

create table if not exists public.kb_articles (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  business_unit text not null default 'drinks',
  category    text not null,                 -- produits | tarifs | horaires | livraison | partenariats | sav | faq
  title       text not null,
  body        text not null,
  language    text not null default 'fr',
  product_id  text references public.products(id) on delete set null,
  status      public.tel_kb_status not null default 'brouillon',
  tags        text[] not null default '{}',
  valid_from  date,
  valid_until date,
  -- embedding vector(1536),                 -- si extension vector activée
  updated_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists kb_articles_lookup_idx on public.kb_articles(owner_id, status, category, language);
create index if not exists kb_articles_fts_idx on public.kb_articles
  using gin (to_tsvector('french', coalesce(title,'') || ' ' || coalesce(body,'')));

-- -----------------------------------------------------------------------------
-- 5. Campagnes, variantes A/B, file d'appels
-- -----------------------------------------------------------------------------
create table if not exists public.tel_campaigns (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references auth.users(id) on delete cascade,
  name           text not null,
  business_unit  text not null default 'drinks',
  status         public.tel_campaign_status not null default 'brouillon',
  goal           text,                         -- « RDV dégustation », « envoi échantillon »…
  segment_filter jsonb not null default '{}'::jsonb, -- {type:[…], city:[…], stage:[…], canton:[…]}
  from_number_id uuid references public.tel_phone_numbers(id) on delete restrict,
  max_attempts   smallint not null default 3 check (max_attempts between 1 and 6),
  retry_delay_minutes int not null default 1440 check (retry_delay_minutes >= 60),
  max_concurrent smallint not null default 1 check (max_concurrent between 1 and 20),
  leave_voicemail boolean not null default true,
  starts_on      date,
  ends_on        date,
  created_by     uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (ends_on is null or starts_on is null or ends_on >= starts_on)
);

create table if not exists public.tel_campaign_variants (   -- A/B test de scripts
  id                uuid primary key default gen_random_uuid(),
  campaign_id       uuid not null references public.tel_campaigns(id) on delete cascade,
  owner_id          uuid not null references auth.users(id) on delete cascade,
  label             text not null,             -- 'A', 'B'
  script_version_id uuid not null references public.tel_script_versions(id) on delete restrict,
  weight            smallint not null default 50 check (weight between 0 and 100),
  created_at        timestamptz not null default now(),
  unique (campaign_id, label)
);

create table if not exists public.tel_campaign_contacts (
  id              uuid primary key default gen_random_uuid(),
  campaign_id     uuid not null references public.tel_campaigns(id) on delete cascade,
  owner_id        uuid not null references auth.users(id) on delete cascade,
  client_id       text not null references public.clients(id) on delete cascade,
  contact_id      text references public.contacts(id) on delete set null,
  phone_e164      text not null check (phone_e164 ~ '^\+[1-9][0-9]{6,14}$'),
  variant_id      uuid references public.tel_campaign_variants(id) on delete set null,
  status          public.tel_cc_status not null default 'en_attente',
  attempts        smallint not null default 0,
  next_attempt_at timestamptz,
  last_attempt_at timestamptz,
  last_outcome    public.tel_outcome,
  exclusion_reason text,                      -- rempli par le moteur de conformité
  locked_at       timestamptz,               -- réservation par un worker (SKIP LOCKED)
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (campaign_id, client_id, phone_e164)
);
create index if not exists tel_cc_due_idx on public.tel_campaign_contacts(status, next_attempt_at)
  where status in ('en_attente','planifie','a_rappeler');

alter table public.tel_calling_windows
  drop constraint if exists tel_calling_windows_campaign_fk,
  add constraint tel_calling_windows_campaign_fk foreign key (campaign_id) references public.tel_campaigns(id) on delete cascade;

-- -----------------------------------------------------------------------------
-- 6. Liste « Ne pas appeler » (DNC)
-- -----------------------------------------------------------------------------
create table if not exists public.tel_dnc_list (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  phone_e164  text not null check (phone_e164 ~ '^\+[1-9][0-9]{6,14}$'),
  source      public.tel_dnc_source not null,
  reason      text,
  client_id   text references public.clients(id) on delete set null,
  call_id     uuid,                          -- appel où la demande a été faite (FK plus bas)
  added_by    uuid references auth.users(id) on delete set null,   -- null = ajout automatique par l'IA
  expires_at  timestamptz,                   -- null = permanent (défaut)
  created_at  timestamptz not null default now(),
  unique (owner_id, phone_e164)
);

-- -----------------------------------------------------------------------------
-- 7. Appels, événements, transcriptions, résumés
-- -----------------------------------------------------------------------------
create table if not exists public.tel_calls (
  id                 uuid primary key default gen_random_uuid(),
  owner_id           uuid not null references auth.users(id) on delete cascade,
  direction          public.tel_direction not null,
  provider           public.tel_telephony_provider not null,
  provider_call_id   text,                   -- Telnyx call_control_id / Twilio CallSid
  voice_session_id   text,                   -- id de session côté moteur voix
  from_e164          text not null,
  to_e164            text not null,
  phone_number_id    uuid references public.tel_phone_numbers(id) on delete set null,
  client_id          text references public.clients(id) on delete set null,
  contact_id         text references public.contacts(id) on delete set null,
  campaign_id        uuid references public.tel_campaigns(id) on delete set null,
  campaign_contact_id uuid references public.tel_campaign_contacts(id) on delete set null,
  script_version_id  uuid references public.tel_script_versions(id) on delete set null,
  variant_id         uuid references public.tel_campaign_variants(id) on delete set null,
  status             public.tel_call_status not null default 'queued',
  answered_by        public.tel_answered_by,
  language           text,
  is_sandbox         boolean not null default false,
  ai_disclosed_at    timestamptz,            -- horodatage de l'annonce « je suis une IA »
  recording_consent  public.tel_consent_status,
  started_at         timestamptz,
  answered_at        timestamptz,
  ended_at           timestamptz,
  duration_seconds   int generated always as
                     (case when answered_at is not null and ended_at is not null
                           then greatest(0, extract(epoch from (ended_at - answered_at))::int) end) stored,
  hangup_cause       text,
  transferred_to     text,
  transferred_at     timestamptz,
  outcome            public.tel_outcome,
  sentiment          public.tel_sentiment,
  sentiment_score    numeric(4,3) check (sentiment_score between -1 and 1),
  lead_score         smallint check (lead_score between 0 and 100),
  summary            text,                   -- résumé IA (log_call_summary)
  next_steps         text,
  qualification      jsonb not null default '{}'::jsonb,
  -- Enregistrement (uniquement si consentement accordé) — fichier chiffré dans Storage privé
  recording_path     text,                   -- storage: call-recordings/<owner>/<call>.ogg.enc
  recording_key_ref  text,                   -- référence de la clé (Vault / KMS), jamais la clé
  recording_sha256   text,
  recording_expires_at timestamptz,
  -- Coûts (alimentés par les webhooks / la facturation fournisseur), en CHF
  cost_telephony_chf numeric(10,4) not null default 0,
  cost_ai_chf        numeric(10,4) not null default 0,
  cost_total_chf     numeric(10,4) generated always as (cost_telephony_chf + cost_ai_chf) stored,
  latency_p50_ms     int,
  latency_p95_ms     int,
  error              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  check (recording_path is null or recording_consent = 'accorde')
);
create unique index if not exists tel_calls_provider_uid on public.tel_calls(provider, provider_call_id) where provider_call_id is not null;
create index if not exists tel_calls_owner_date_idx on public.tel_calls(owner_id, created_at desc);
create index if not exists tel_calls_client_idx     on public.tel_calls(client_id, created_at desc);
create index if not exists tel_calls_campaign_idx   on public.tel_calls(campaign_id, outcome);

alter table public.tel_dnc_list
  drop constraint if exists tel_dnc_call_fk,
  add constraint tel_dnc_call_fk foreign key (call_id) references public.tel_calls(id) on delete set null;

-- Journal technique de l'appel (webhooks, AMD, appels de fonctions, erreurs)
create table if not exists public.tel_call_events (
  id          bigint generated always as identity primary key,
  call_id     uuid not null references public.tel_calls(id) on delete cascade,
  owner_id    uuid not null references auth.users(id) on delete cascade,
  at          timestamptz not null default now(),
  source      text not null,                -- telnyx | twilio | voice_ai | gateway | compliance | crm
  type        text not null,                -- call.answered, amd.machine, tool.book_meeting, error…
  payload     jsonb not null default '{}'::jsonb
);
create index if not exists tel_call_events_call_idx on public.tel_call_events(call_id, at);

-- Segments de transcription (tour de parole)
create table if not exists public.tel_transcript_segments (
  id          bigint generated always as identity primary key,
  call_id     uuid not null references public.tel_calls(id) on delete cascade,
  owner_id    uuid not null references auth.users(id) on delete cascade,
  seq         int not null,
  speaker     text not null check (speaker in ('assistant','interlocuteur','humain','systeme')),
  text        text not null,
  language    text,
  start_ms    int,
  end_ms      int,
  interrupted boolean not null default false,   -- barge-in : l'assistante a été coupée
  created_at  timestamptz not null default now(),
  unique (call_id, seq)
);

-- Idempotence des webhooks fournisseurs (rejeux)
create table if not exists public.tel_webhook_events (
  provider     public.tel_telephony_provider not null,
  event_id     text not null,
  received_at  timestamptz not null default now(),
  processed_at timestamptz,
  payload      jsonb not null,
  error        text,
  primary key (provider, event_id)
);

-- File de post-traitement (résumé, activité CRM) sans extension pgmq.
create table if not exists public.tel_post_jobs (
  id           bigint generated always as identity primary key,
  owner_id     uuid not null references auth.users(id) on delete cascade,
  call_id      uuid not null references public.tel_calls(id) on delete cascade,
  kind         text not null default 'post_call',
  available_at timestamptz not null default now(),
  locked_at    timestamptz,
  done_at      timestamptz,
  attempts     int not null default 0,
  last_error   text,
  created_at   timestamptz not null default now()
);
create index if not exists tel_post_jobs_due_idx on public.tel_post_jobs (available_at)
  where done_at is null;

create or replace function public.tel_claim_post_jobs(p_limit int default 10)
returns setof public.tel_post_jobs
language sql volatile security definer set search_path = public as $$
  update public.tel_post_jobs j
     set locked_at = now(), attempts = j.attempts + 1
   where j.id in (
     select x.id from public.tel_post_jobs x
      where x.done_at is null
        and x.available_at <= now()
        and (x.locked_at is null or x.locked_at < now() - interval '10 minutes')
      order by x.id
      limit p_limit
      for update of x skip locked)
  returning j.*;
$$;

-- -----------------------------------------------------------------------------
-- 8. Rendez-vous, consentements, demandes nLPD
-- -----------------------------------------------------------------------------
create table if not exists public.appointments (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references auth.users(id) on delete cascade,
  client_id     text not null references public.clients(id) on delete cascade,
  contact_id    text references public.contacts(id) on delete set null,
  call_id       uuid references public.tel_calls(id) on delete set null,
  kind          text not null default 'degustation',   -- degustation | visite | appel | livraison_echantillon
  title         text not null,
  starts_at     timestamptz not null,
  ends_at       timestamptz not null,
  location      text,
  status        public.tel_appt_status not null default 'confirme',
  calendar_provider public.tel_calendar_provider not null default 'google',
  calendar_id   text,
  external_event_id text,
  organizer_id  uuid references auth.users(id) on delete set null,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (ends_at > starts_at),
  unique (calendar_provider, external_event_id)
);
create index if not exists appointments_owner_start_idx on public.appointments(owner_id, starts_at);

create table if not exists public.tel_consents (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  phone_e164  text not null,
  client_id   text references public.clients(id) on delete set null,
  contact_id  text references public.contacts(id) on delete set null,
  call_id     uuid references public.tel_calls(id) on delete set null,
  kind        public.tel_consent_kind not null,
  status      public.tel_consent_status not null,
  evidence    text,          -- extrait de transcription horodaté : « Oui, vous pouvez enregistrer »
  captured_at timestamptz not null default now(),
  created_at  timestamptz not null default now()
);
create index if not exists tel_consents_lookup_idx on public.tel_consents(owner_id, phone_e164, kind, captured_at desc);

create table if not exists public.data_subject_requests (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references auth.users(id) on delete cascade,
  kind          public.tel_dsr_kind not null,
  status        public.tel_dsr_status not null default 'recue',
  requester_name  text,
  requester_contact text not null,          -- e-mail ou téléphone
  phone_e164    text,
  client_id     text references public.clients(id) on delete set null,
  received_via  text not null default 'email', -- email | telephone | courrier
  call_id       uuid references public.tel_calls(id) on delete set null,
  due_at        timestamptz not null default (now() + interval '30 days'),
  handled_by    uuid references auth.users(id) on delete set null,
  resolution    text,
  export_path   text,                       -- export (droit d'accès) dans Storage privé
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- FK différées (références circulaires)
alter table public.tel_scripts
  drop constraint if exists tel_scripts_current_version_fk,
  add constraint tel_scripts_current_version_fk foreign key (current_version_id) references public.tel_script_versions(id) on delete set null;
alter table public.tel_phone_numbers
  drop constraint if exists tel_phone_numbers_inbound_script_fk,
  add constraint tel_phone_numbers_inbound_script_fk foreign key (inbound_script_id) references public.tel_scripts(id) on delete set null;

-- Triggers updated_at
do $$ declare t text; begin
  foreach t in array array['team_members','tel_settings','tel_phone_numbers','tel_personas','tel_scripts','kb_articles',
                           'tel_campaigns','tel_campaign_contacts','tel_calls','appointments','data_subject_requests'] loop
    execute format('drop trigger if exists trg_%1$s_updated on public.%1$I', t);
    execute format('create trigger trg_%1$s_updated before update on public.%1$I for each row execute function public.tel_set_updated_at()', t);
  end loop;
end $$;

-- Une version publiée est immuable
create or replace function public.tel_freeze_published_version() returns trigger
language plpgsql as $$ begin
  if old.status = 'publiee' and (new.system_prompt, new.opening_line, new.objections, new.voicemail_message)
                             is distinct from (old.system_prompt, old.opening_line, old.objections, old.voicemail_message) then
    raise exception 'Version publiée immuable : créez une nouvelle version';
  end if;
  return new;
end $$;
drop trigger if exists trg_freeze_version on public.tel_script_versions;
create trigger trg_freeze_version before update on public.tel_script_versions
  for each row execute function public.tel_freeze_published_version();

-- -----------------------------------------------------------------------------
-- 9. Moteur de conformité (appelé par le dialer AVANT chaque composition)
-- -----------------------------------------------------------------------------
create or replace function public.tel_window_scope_match(p_owner uuid, p_campaign_id uuid, p_campaign uuid)
returns boolean
language sql stable as $$
  select (p_campaign_id is not null and p_campaign = p_campaign_id)
      or (p_campaign is null and not exists (
            select 1 from public.tel_calling_windows w2
            where w2.owner_id = p_owner and w2.campaign_id = p_campaign_id));
$$;

create or replace function public.tel_check_outbound(
  p_owner uuid, p_client_id text, p_phone text, p_campaign_id uuid default null, p_at timestamptz default now()
) returns table (allowed boolean, reason text)
language plpgsql stable security definer set search_path = public as $$
declare
  s        public.tel_settings%rowtype;
  c        public.clients%rowtype;
  local_ts timestamp;
  dow      int;
  has_win  boolean;
  v_horeca boolean;
  v_listed boolean;
begin
  if coalesce(auth.role(), '') = 'anon'
     or (auth.role() = 'authenticated' and not public.tel_has_access(p_owner)) then
    return query select false, 'acces_refuse'; return;
  end if;

  select * into s from public.tel_settings where owner_id = p_owner;
  if not found then return query select false, 'parametres_absents'; return; end if;
  local_ts := p_at at time zone s.timezone;
  dow := extract(isodow from local_ts);

  -- Bac à sable : uniquement les numéros autorisés
  if s.sandbox_mode and not (p_phone = any (s.sandbox_allowlist)) then
    return query select false, 'sandbox_numero_non_autorise'; return; end if;

  -- LCD let. v : le numéro affiché doit être inscrit à l'annuaire (hors bac à sable)
  if p_campaign_id is not null and not s.sandbox_mode then
    select n.listed_in_directory into v_listed
      from public.tel_campaigns k
      left join public.tel_phone_numbers n on n.id = k.from_number_id and n.owner_id = p_owner
     where k.id = p_campaign_id and k.owner_id = p_owner;
    if not coalesce(v_listed, false) then
      return query select false, 'numero_appelant_non_inscrit'; return; end if;
  end if;

  -- DNC (liste + drapeaux fiche)
  if exists (select 1 from public.tel_dnc_list d where d.owner_id = p_owner and d.phone_e164 = p_phone
             and (d.expires_at is null or d.expires_at > p_at)) then
    return query select false, 'liste_ne_pas_appeler'; return; end if;

  select * into c from public.clients where id = p_client_id and owner_id = p_owner;
  if not found then return query select false, 'compte_introuvable'; return; end if;
  if c.do_not_call then return query select false, 'compte_ne_pas_appeler'; return; end if;
  if exists (select 1 from public.contacts k where k.client_id = c.id and k.phone_e164 = p_phone and k.do_not_call) then
    return query select false, 'contact_ne_pas_appeler'; return; end if;

  -- B2B uniquement (phase 1)
  if s.b2b_only and not c.is_b2b then return query select false, 'non_b2b'; return; end if;

  -- LCD art. 3 al. 1 let. u : astérisque OU non inscrit = interdit, sauf relation commerciale existante
  if c.relationship = 'prospect' then
    if c.directory_status <> 'inscrit_ok' then
      return query select false, 'annuaire_' || c.directory_status::text; return; end if;
    if c.directory_checked_at is null or c.directory_checked_at < p_at - make_interval(days => s.directory_check_max_age_days) then
      return query select false, 'verification_annuaire_perimee'; return; end if;
  end if;

  -- Dimanche / jours fériés (fédéraux + canton du compte + canton de Bissabi)
  if dow = 7 then return query select false, 'dimanche'; return; end if;
  if exists (select 1 from public.tel_holidays h where h.day = local_ts::date
             and (h.canton is null or h.canton = coalesce(c.canton, s.home_canton) or h.canton = s.home_canton)) then
    return query select false, 'jour_ferie'; return; end if;

  v_horeca := coalesce(c.type, '') ~* '(restaurant|caf[ée]|horeca|\mbar\M|h[ôo]tel)';

  -- Plages : campagne si elle en a, sinon défaut. HORECA si des plages horeca existent pour ce périmètre.
  select exists (
    select 1 from public.tel_calling_windows w
     where w.owner_id = p_owner
       and public.tel_window_scope_match(p_owner, p_campaign_id, w.campaign_id)
       and w.weekday = dow
       and local_ts::time >= w.start_time and local_ts::time < w.end_time
       and (
         case
           when v_horeca and exists (
             select 1 from public.tel_calling_windows h
              where h.owner_id = p_owner
                and h.segment = 'horeca'
                and public.tel_window_scope_match(p_owner, p_campaign_id, h.campaign_id)
           ) then w.segment = 'horeca'
           else w.segment is null
         end
       )
  ) into has_win;
  if not has_win then
    if dow = 6 then return query select false, 'samedi'; return; end if;
    return query select false, 'hors_plage_horaire'; return;
  end if;

  return query select true, 'ok';
end $$;

-- Réservation atomique des prochains numéros à composer (plusieurs workers possibles)
create or replace function public.tel_claim_due_contacts(p_limit int default 5)
returns setof public.tel_campaign_contacts
language sql volatile security definer set search_path = public as $$
  update public.tel_campaign_contacts cc
     set status = 'en_cours', locked_at = now()
   where cc.id in (
     select x.id from public.tel_campaign_contacts x
       join public.tel_campaigns k on k.id = x.campaign_id and k.status = 'active'
      where x.status in ('en_attente','planifie','a_rappeler')
        and (x.next_attempt_at is null or x.next_attempt_at <= now())
        and x.attempts < k.max_attempts
      order by x.next_attempt_at nulls first
      limit p_limit
      for update of x skip locked)
  returning cc.*;
$$;

-- Transfert à chaud : mêmes plages, dimanche et fériés, sans contrôle DNC ni annuaire (l'appel est déjà en cours).
create or replace function public.tel_transfer_allowed(
  p_owner uuid,
  p_at timestamptz default now(),
  p_client_type text default null,
  p_canton text default null
) returns table (allowed boolean, reason text)
language plpgsql stable security definer set search_path = public as $$
declare
  s        public.tel_settings%rowtype;
  local_ts timestamp;
  dow      int;
  has_win  boolean;
  v_horeca boolean;
begin
  if coalesce(auth.role(), '') = 'anon'
     or (auth.role() = 'authenticated' and not public.tel_has_access(p_owner)) then
    return query select false, 'acces_refuse'; return;
  end if;
  select * into s from public.tel_settings where owner_id = p_owner;
  if not found then return query select false, 'parametres_absents'; return; end if;
  local_ts := p_at at time zone s.timezone;
  dow := extract(isodow from local_ts);
  if dow = 7 then return query select false, 'dimanche'; return; end if;
  if exists (
    select 1 from public.tel_holidays h
     where h.day = local_ts::date
       and (h.canton is null or h.canton = coalesce(p_canton, s.home_canton) or h.canton = s.home_canton)
  ) then
    return query select false, 'jour_ferie'; return;
  end if;
  v_horeca := coalesce(p_client_type, '') ~* '(restaurant|caf[ée]|horeca|\mbar\M|h[ôo]tel)';
  select exists (
    select 1 from public.tel_calling_windows w
     where w.owner_id = p_owner
       and w.campaign_id is null
       and w.weekday = dow
       and local_ts::time >= w.start_time and local_ts::time < w.end_time
       and (
         case
           when v_horeca and exists (
             select 1 from public.tel_calling_windows h
              where h.owner_id = p_owner and h.campaign_id is null and h.segment = 'horeca'
           ) then w.segment = 'horeca'
           else w.segment is null
         end
       )
  ) into has_win;
  if not has_win then
    if dow = 6 then return query select false, 'samedi'; return; end if;
    return query select false, 'hors_plage_horaire'; return;
  end if;
  return query select true, 'ok';
end $$;

-- Plages par défaut : lun–ven 09:00–11:30 et 14:00–17:30 ; HORECA 14:30–17:00 ; pas de samedi.
create or replace function public.tel_seed_default_windows(p_owner uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(auth.role(), '') = 'anon'
     or (auth.role() = 'authenticated' and not public.tel_is_admin(p_owner)) then
    raise exception 'acces_refuse';
  end if;
  insert into public.tel_calling_windows (owner_id, weekday, start_time, end_time, segment)
  select p_owner, d, t.s, t.e, t.seg
    from generate_series(1, 5) as d
    cross join (values
      (time '09:00', time '11:30', null::text),
      (time '14:00', time '17:30', null::text),
      (time '14:30', time '17:00', 'horeca')
    ) as t(s, e, seg)
  on conflict do nothing;
end $$;

create or replace function public.tel_release_stale_locks(p_minutes int default 15)
returns int
language plpgsql volatile security definer set search_path = public as $$
declare n int;
begin
  update public.tel_campaign_contacts
     set status = 'a_rappeler', locked_at = null,
         next_attempt_at = now() + interval '5 minutes'
   where status = 'en_cours'
     and locked_at < now() - make_interval(mins => p_minutes);
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function public.tel_purge_retention()
returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  delete from public.tel_transcript_segments s
   using public.tel_calls c, public.tel_settings t
   where s.call_id = c.id and t.owner_id = c.owner_id
     and c.created_at < now() - make_interval(days => t.transcript_retention_days);
  update public.tel_calls c
     set recording_path = null, recording_key_ref = null, recording_sha256 = null
    from public.tel_settings t
   where t.owner_id = c.owner_id
     and c.recording_path is not null
     and c.recording_expires_at is not null
     and c.recording_expires_at < now();
end $$;

-- Vue tableau de bord (jour courant, fuseau Europe/Zurich)
create or replace view public.tel_dashboard_daily with (security_invoker = true) as
select owner_id,
       (created_at at time zone 'Europe/Zurich')::date                         as jour,
       count(*)                                                               as appels,
       count(*) filter (where direction = 'outbound')                         as sortants,
       count(*) filter (where direction = 'inbound')                          as entrants,
       count(*) filter (where answered_by = 'human')                          as decroches_humain,
       round(100.0 * count(*) filter (where answered_by = 'human')
             / nullif(count(*) filter (where direction = 'outbound'), 0), 1)  as taux_decroche_pct,
       count(*) filter (where outcome in ('interesse','rdv_pris','echantillon','catalogue','commande')) as conversions,
       round(100.0 * count(*) filter (where outcome in ('interesse','rdv_pris','echantillon','catalogue','commande'))
             / nullif(count(*) filter (where answered_by = 'human'), 0), 1)   as taux_conversion_pct,
       count(*) filter (where outcome = 'rdv_pris')                           as rdv_pris,
       round(avg(duration_seconds))                                           as duree_moyenne_s,
       round(sum(cost_total_chf), 2)                                          as cout_total_chf,
       round(sum(cost_total_chf) / nullif(count(*), 0), 3)                    as cout_par_appel_chf
  from public.tel_calls
 where not is_sandbox
 group by 1, 2;

-- -----------------------------------------------------------------------------
-- 10. RLS (esquisse) — admin : tout ; agent : lecture + actions opérationnelles
-- -----------------------------------------------------------------------------
do $$ declare t text; begin
  foreach t in array array['team_members','tel_settings','tel_phone_numbers','tel_calling_windows','tel_personas','tel_scripts',
                           'tel_script_versions','kb_articles','tel_campaigns','tel_campaign_variants','tel_campaign_contacts',
                           'tel_dnc_list','tel_calls','tel_call_events','tel_transcript_segments','appointments',
                           'tel_consents','data_subject_requests'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %1$s_read on public.%1$I', t);
    execute format('create policy %1$s_read on public.%1$I for select to authenticated using (public.tel_has_access(owner_id))', t);
  end loop;
end $$;
alter table public.tel_holidays enable row level security;
alter table public.tel_webhook_events enable row level security;   -- aucune policy : service_role uniquement
drop policy if exists tel_holidays_read on public.tel_holidays;
create policy tel_holidays_read on public.tel_holidays for select to authenticated using (true);

-- Écriture réservée aux admins (configuration, scripts, campagnes, numéros, droits nLPD)
do $$ declare t text; begin
  foreach t in array array['team_members','tel_settings','tel_phone_numbers','tel_calling_windows','tel_personas','tel_scripts',
                           'tel_script_versions','kb_articles','tel_campaigns','tel_campaign_variants','tel_campaign_contacts',
                           'data_subject_requests'] loop
    execute format('drop policy if exists %1$s_admin_write on public.%1$I', t);
    execute format('create policy %1$s_admin_write on public.%1$I for all to authenticated using (public.tel_is_admin(owner_id)) with check (public.tel_is_admin(owner_id))', t);
  end loop;
end $$;

-- Agents : peuvent ajouter à la DNC (jamais retirer), gérer RDV, corriger le résultat d'un appel
drop policy if exists tel_dnc_agent_insert on public.tel_dnc_list;
create policy tel_dnc_agent_insert on public.tel_dnc_list for insert to authenticated with check (public.tel_has_access(owner_id));
drop policy if exists tel_dnc_admin_delete on public.tel_dnc_list;
create policy tel_dnc_admin_delete on public.tel_dnc_list for delete to authenticated using (public.tel_is_admin(owner_id));
drop policy if exists appointments_team_write on public.appointments;
create policy appointments_team_write on public.appointments for all to authenticated
  using (public.tel_has_access(owner_id)) with check (public.tel_has_access(owner_id));
drop policy if exists tel_calls_team_update on public.tel_calls;
create policy tel_calls_team_update on public.tel_calls for update to authenticated
  using (public.tel_has_access(owner_id)) with check (public.tel_has_access(owner_id));
-- tel_calls insert/delete, tel_call_events, tel_transcript_segments, tel_consents : écrits par le gateway (service_role).
-- Suppression nLPD : via une fonction admin dédiée (à coder), journalisée dans audit_log.

-- -----------------------------------------------------------------------------
-- 11. Storage : bucket privé des enregistrements (fichiers déjà chiffrés AES-256-GCM par le gateway)
-- -----------------------------------------------------------------------------
do $$ begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public)
    values ('call-recordings', 'call-recordings', false)
    on conflict (id) do nothing;
  end if;
end $$;
-- Lecture d'un enregistrement : uniquement via URL signée courte générée par une Edge Function admin
-- (pas de policy de lecture directe sur storage.objects pour ce bucket).

-- -----------------------------------------------------------------------------
-- 12. Données de référence : jours fériés Vaud 2026-2027 (seul le 1er août est fédéral ; canton null = toute la Suisse) (à compléter GE/NE/FR/VS/JU)
-- -----------------------------------------------------------------------------
insert into public.tel_holidays (day, canton, label) values
  ('2026-01-01', 'VD', 'Nouvel An'), ('2026-01-02', 'VD', 'Saint-Berchtold'),
  ('2026-04-03', 'VD', 'Vendredi saint'), ('2026-04-06', 'VD', 'Lundi de Pâques'),
  ('2026-05-14', 'VD', 'Ascension'), ('2026-05-25', 'VD', 'Lundi de Pentecôte'),
  ('2026-08-01', null, 'Fête nationale'), ('2026-09-21', 'VD', 'Lundi du Jeûne fédéral'),
  ('2026-12-25', 'VD', 'Noël'),
  ('2027-01-01', 'VD', 'Nouvel An'), ('2027-01-02', 'VD', 'Saint-Berchtold'),
  ('2027-03-26', 'VD', 'Vendredi saint'), ('2027-03-29', 'VD', 'Lundi de Pâques'),
  ('2027-05-06', 'VD', 'Ascension'), ('2027-05-17', 'VD', 'Lundi de Pentecôte'),
  ('2027-08-01', null, 'Fête nationale'), ('2027-09-20', 'VD', 'Lundi du Jeûne fédéral'),
  ('2027-12-25', 'VD', 'Noël')
on conflict (day, canton) do nothing;
-- Fenêtres par défaut : select public.tel_seed_default_windows('<owner uuid>');
--   lun-ven 09:00-11:30 et 14:00-17:30 ; HORECA 14:30-17:00 ; samedi et dimanche : aucune.

create index if not exists tel_windows_owner_idx on public.tel_calling_windows (owner_id, weekday);
create index if not exists tel_campaigns_owner_idx on public.tel_campaigns (owner_id, status);
create index if not exists tel_scripts_owner_idx on public.tel_scripts (owner_id);
create index if not exists team_members_user_idx on public.team_members (user_id);

alter table public.tel_post_jobs enable row level security;
alter table public.tel_webhook_events enable row level security;

-- Le dialer (service_role) est le seul à réserver la file. pg_cron, s'il est activé plus tard :
--   select cron.schedule('tel-release-locks', '* * * * *', $$select public.tel_release_stale_locks(15)$$);
--   select cron.schedule('tel-purge', '15 3 * * *', $$select public.tel_purge_retention()$$);

revoke all on function public.tel_claim_due_contacts(int) from public;
revoke all on function public.tel_claim_post_jobs(int) from public;
revoke all on function public.tel_release_stale_locks(int) from public;
revoke all on function public.tel_purge_retention() from public;
revoke all on function public.tel_check_outbound(uuid, text, text, uuid, timestamptz) from public;
revoke all on function public.tel_transfer_allowed(uuid, timestamptz, text, text) from public;
revoke all on function public.tel_seed_default_windows(uuid) from public;

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.tel_claim_due_contacts(int) to service_role;
    grant execute on function public.tel_claim_post_jobs(int) to service_role;
    grant execute on function public.tel_release_stale_locks(int) to service_role;
    grant execute on function public.tel_purge_retention() to service_role;
    grant execute on function public.tel_check_outbound(uuid, text, text, uuid, timestamptz) to service_role;
    grant execute on function public.tel_transfer_allowed(uuid, timestamptz, text, text) to service_role;
    grant execute on function public.tel_seed_default_windows(uuid) to service_role;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on function public.tel_check_outbound(uuid, text, text, uuid, timestamptz) to authenticated;
    grant execute on function public.tel_transfer_allowed(uuid, timestamptz, text, text) to authenticated;
    grant execute on function public.tel_seed_default_windows(uuid) to authenticated;
  end if;
end $$;

do $$ begin
  alter publication supabase_realtime add table public.tel_calls;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

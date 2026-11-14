import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const sqlPath = join(dirname(fileURLToPath(import.meta.url)), '../../../supabase/migrations/20261113193000_telephonie_ia.sql');

async function database(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(`
    do $$ begin
      if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
      if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
      if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
    end $$;
    create schema if not exists auth;
    create table if not exists auth.users (id uuid primary key);
    create or replace function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
    create or replace function auth.role() returns text language sql stable as $$ select null::text $$;
    create schema if not exists storage;
    create table if not exists storage.buckets (id text primary key, name text not null, public boolean default false);
    create table if not exists public.clients (id text primary key, owner_id uuid not null, name text not null, type text, stage text, phone text, city text, canton text, email text, source text);
    create table if not exists public.contacts (id text primary key, owner_id uuid not null, client_id text not null references public.clients(id), name text not null, role text, email text, phone text);
    create table if not exists public.tasks (id text primary key, owner_id uuid not null, client_id text, title text not null, due_date timestamptz, done boolean not null default false);
    create table if not exists public.products (id text primary key, owner_id uuid not null, name text not null);
    create table if not exists public.activities (id text primary key, owner_id uuid not null, client_id text not null, type text not null, content text not null);
    create table if not exists public.audit_log (id text primary key, owner_id uuid not null, entity text not null, entity_id text not null, action text not null, summary text not null);
  `);
  const sql = readFileSync(sqlPath, 'utf8').replace(/create extension if not exists pgcrypto;/, 'select 1;');
  await db.exec(sql);
  await db.exec(sql);
  return db;
}

test('migration : consentement NULL n’autorise pas un fichier, et « j’ai » n’est pas une annonce IA', async () => {
  const db = await database();
  const owner = '11111111-1111-1111-1111-111111111111';
  await db.exec(`insert into auth.users (id) values ('${owner}')`);
  await assert.rejects(
    db.exec(`insert into public.tel_calls (owner_id, direction, provider, from_e164, to_e164, recording_path)
             values ('${owner}', 'inbound', 'telnyx', '+41210000000', '+41210000001', 'owner/call.ogg.enc')`),
    /tel_calls_recording_consent_chk/,
  );
  await db.exec(`insert into public.tel_calls (owner_id, direction, provider, from_e164, to_e164, recording_path, recording_consent)
                 values ('${owner}', 'inbound', 'telnyx', '+41210000000', '+41210000001', 'owner/call.ogg.enc', 'accorde')`);
  const script = await db.query(`insert into public.tel_scripts (owner_id, kind, name) values ('${owner}', 'inbound', 'Accueil') returning id`);
  const scriptId = script.rows[0].id;
  await assert.rejects(
    db.exec(`insert into public.tel_script_versions (script_id, owner_id, version, system_prompt, opening_line)
             values ('${scriptId}', '${owner}', 1, 'prompt', 'Bonjour, j''ai un restaurant à Lausanne.')`),
    /tel_script_versions_opening_ia_chk/,
  );
  await db.exec(`insert into public.tel_script_versions (script_id, owner_id, version, system_prompt, opening_line)
                 values ('${scriptId}', '${owner}', 1, 'prompt', 'Bonjour, je suis l''assistante IA de Bissabi.')`);
});

test('migration : authenticated a les droits des policies, pas ceux du gateway', async () => {
  const db = await database();
  const granted = async (table: string, privilege: string) => {
    const result = await db.query(
      `select 1 from information_schema.role_table_grants
        where grantee = 'authenticated' and table_schema = 'public' and table_name = $1 and privilege_type = $2`,
      [table, privilege],
    );
    return result.rows.length > 0;
  };
  assert.equal(await granted('tel_calls', 'SELECT'), true);
  assert.equal(await granted('tel_calls', 'UPDATE'), true);
  assert.equal(await granted('tel_calls', 'INSERT'), false);
  assert.equal(await granted('tel_scripts', 'INSERT'), true);
  assert.equal(await granted('tel_scripts', 'DELETE'), true);
  assert.equal(await granted('tel_dashboard_daily', 'SELECT'), true);
  assert.equal(await granted('clients', 'INSERT'), true);
  assert.equal(await granted('contacts', 'UPDATE'), true);
  assert.equal(await granted('tel_webhook_events', 'SELECT'), false);
  assert.equal(await granted('tel_post_jobs', 'SELECT'), false);
  assert.equal(await granted('tasks', 'SELECT'), false);
  const anon = await db.query(`select has_function_privilege('anon', 'public.tel_has_access(uuid)', 'execute') as ok`);
  const auth = await db.query(`select has_function_privilege('authenticated', 'public.tel_is_admin(uuid)', 'execute') as ok`);
  assert.equal(anon.rows[0].ok, false);
  assert.equal(auth.rows[0].ok, true);
  const rls = await db.query(`select c.relname, c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname in ('clients', 'contacts')`);
  assert.equal(rls.rows.every((row) => row.relrowsecurity === true), true);
});

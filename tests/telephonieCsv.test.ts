import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CAMPAIGN_TEMPLATE, parseCampaignCsv } from '../src/lib/telephonie/csv';
import { openingIsValid, toE164 } from '../src/lib/telephonie/phone';

test('CSV campagne : segmentation et téléphone suisse', () => {
  const parsed = parseCampaignCsv(CAMPAIGN_TEMPLATE);
  assert.equal(parsed.headerError, undefined);
  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.rows[0].phone, '+41210000000');
  assert.equal(parsed.rows[0].secteur, 'cafe');
  assert.equal(parsed.rows[0].ville, 'Lausanne');
  assert.equal(parsed.rows[0].statut, 'prospect');
  const bad = parseCampaignCsv('nom;telephone;secteur;ville;statut;canton\n;abc;cafe;Lausanne;Prospect;VD\n');
  assert.equal(bad.errors.length, 1);
  assert.match(bad.errors[0].message, /nom manquant/);
  assert.match(bad.errors[0].message, /téléphone/);
});

test('annonce IA exigée en première phrase', () => {
  assert.equal(openingIsValid("Bonjour, je suis l'assistante IA de Bissabi. Suite."), true);
  assert.equal(openingIsValid("Suite. Je suis l'assistante IA de Bissabi."), false);
  assert.equal(toE164('079 000 00 00'), '+41790000000');
});

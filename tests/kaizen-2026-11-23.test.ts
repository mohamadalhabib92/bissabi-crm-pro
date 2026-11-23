import assert from 'node:assert/strict';
import { test } from 'node:test';
import { invoiceHtml } from '../src/lib/documents';
import { DEFAULT_COMPANY, type Account, type Invoice, type Offer } from '../src/lib/model';
import { canConvertOffer, draftInvoiceFromOffer } from '../src/lib/offers';
import { QR_PRINT_MM, SWISS_CROSS_MM, buildQrBill, qrBoxStyle, qrSvg, swissCrossRect } from '../src/lib/qrbill';

function account(): Account {
  return {
    id: 'a1', nom: 'Café du Lac', type: 'HORECA', etape: 'client_actif', canton: 'VD', ville: 'Lausanne',
    adresse: 'Rue du Lac 4', npa: '1003', livraison_ok: true, mode_logistique: 'Livraison Bissabi',
    contact_nom: 'Alex', contact_role: '', contact_email: '', contact_tel: '', prochaine_action: '',
    prochaine_action_date: '', notes: '', source: '', createdAt: '2026-01-01T00:00:00.000Z',
  };
}

function issued(number: string): Invoice {
  return {
    id: 'i1', number, accountId: 'a1', date: '2026-03-01', dueDate: '2026-03-31',
    lines: [{ id: 'l1', description: 'Bissabi Red', qty: 12, unitPrice: 2.5 }],
    vat: { apply: true, rate: 2.6 }, status: 'issued', notes: 'Historique',
  };
}

test('QR-facture : symbole 46×46 mm, croix 7 mm, boîte non rétrécissable', () => {
  assert.equal(QR_PRINT_MM, 46);
  assert.equal(SWISS_CROSS_MM, 7);
  assert.equal(swissCrossRect(QR_PRINT_MM).c, 7);
  const box = qrBoxStyle();
  assert.match(box, /width:46mm/);
  assert.match(box, /height:46mm/);
  assert.match(box, /min-width:46mm/);
  assert.match(box, /flex:0 0 46mm/);
  assert.doesNotMatch(box, /35mm/);
  const svg = qrSvg('SPC', 46, false);
  assert.match(svg, /width="46mm"/);
  assert.match(svg, /height="46mm"/);
  assert.match(svg, /min-width:46mm/);
});

test('section paiement : 62 / 148 / 105 mm, QR verrouillé, facture émise inchangée', () => {
  const acc = account();
  const inv = issued('FA-2026-3');
  const before = JSON.stringify(inv);
  const html = invoiceHtml(DEFAULT_COMPANY, acc, inv);
  assert.equal(JSON.stringify(inv), before);
  assert.match(html, /width:62mm/);
  assert.match(html, /width:148mm/);
  assert.match(html, /height:105mm/);
  assert.match(html, /class="qrbox"/);
  assert.match(html, /min-width:46mm/);
  assert.match(html, /flex:0 0 46mm/);
  assert.match(html, /class="payinfo"/);
  assert.match(html, /font-size:10pt/);
  assert.match(html, /font-size:11pt/);
  assert.doesNotMatch(html, /35mm/);
  const bill = buildQrBill(DEFAULT_COMPANY, acc, inv, 30.78);
  assert.match(bill.payload, /FA-2026-3/);
  assert.equal(bill.amount, 30.78);
});

test('conversion d’offre : brouillon neuf, offre et facture émise intactes', () => {
  const offer: Offer = {
    id: 'of1', number: 'OF-2026-0004', accountId: 'a1', date: '2026-04-01', validUntil: '2026-05-01',
    lines: [{ id: 'ol', description: 'Bissabi White', qty: 6, unitPrice: 3 }],
    vat: { apply: false, rate: 0 }, status: 'accepted', notes: 'Déjà envoyée',
  };
  const issuedInv = issued('FA-2026-0009');
  const offerBefore = JSON.stringify(offer);
  const issuedBefore = JSON.stringify(issuedInv);
  assert.equal(canConvertOffer(offer), true);
  assert.equal(canConvertOffer({ status: 'converted', invoiceId: 'i1' }), false);
  assert.equal(canConvertOffer({ status: 'accepted', invoiceId: 'i1' }), false);
  const draft = draftInvoiceFromOffer(offer, { id: 'new', date: '2026-11-23', dueDate: '2026-12-23', lineIds: ['nl'] });
  assert.equal(draft.status, 'draft');
  assert.equal(draft.number, '');
  assert.equal(draft.offerId, 'of1');
  assert.equal(draft.lines[0].id, 'nl');
  assert.equal(draft.lines[0].unitPrice, 3);
  assert.notEqual(draft.id, issuedInv.id);
  assert.equal(JSON.stringify(offer), offerBefore);
  assert.equal(JSON.stringify(issuedInv), issuedBefore);
});

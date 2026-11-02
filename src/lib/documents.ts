import { formatIban, isPlaceholderIban } from './iban';
import { GREEN_LOGO_SVG } from './logo';
import { chf, dateCH } from './format';
import { buildQrBill, PAYMENT_BAND_MM, PAYMENT_WIDTH_MM, QR_PRINT_MM, qrSvg, RECEIPT_WIDTH_MM } from './qrbill';
import { isHoreca, totals, visibleVatNumber, type Account, type Company, type CreditNote, type Invoice, type Offer } from './model';
import { theme } from '../ui/theme';

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export function companyAddress(c: Company) {
  return `${c.street} ${c.houseNo}, ${c.zip} ${c.town}`;
}

/** Message de remerciement adaptatif (HORECA vs autres) — ton premium, court. */
export function thankYou(account: Account | undefined, kind: 'paid' | 'invoice'): string {
  const name = account?.contact_nom || account?.nom || '';
  const hello = name ? `Bonjour ${name},` : 'Bonjour,';
  if (account && isHoreca(account.type)) {
    return kind === 'paid'
      ? `${hello}\n\nMerci pour votre règlement. C'est un plaisir d'accompagner ${account.nom} : nos boissons botaniques sont prêtes à sublimer votre carte. Pour votre prochain réassort, il suffit de répondre à ce message.\n\nBien cordialement,\nBissabi`
      : `${hello}\n\nMerci pour votre confiance. Vous trouverez ci-joint votre facture. Votre équipe et vos clients méritent le meilleur — nous restons à disposition pour toute dégustation ou mise en avant à la carte.\n\nBien cordialement,\nBissabi`;
  }
  return kind === 'paid'
    ? `${hello}\n\nNous avons bien reçu votre paiement, merci. Nous espérons que nos boissons botaniques inspirées du Sahel vous accompagnent avec plaisir.\n\nBelle journée,\nBissabi`
    : `${hello}\n\nMerci pour votre commande. Vous trouverez ci-joint votre facture.\n\nBelle journée,\nBissabi`;
}

function shell(title: string, body: string) {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${esc(title)}</title><style>
@page{size:A4;margin:0}*{box-sizing:border-box}body{margin:0;font-family:Helvetica,Arial,sans-serif;color:${theme.text};font-size:10pt}
.page{width:210mm;min-height:297mm;padding:16mm 18mm 0;position:relative}
.top{display:flex;justify-content:space-between;align-items:flex-start}.muted{color:${theme.muted}}.tag{font-size:8pt;letter-spacing:.5px;color:${theme.primary}}
h1{font-size:18pt;color:${theme.primary};margin:14mm 0 2mm;font-weight:600}table{width:100%;border-collapse:collapse;margin-top:6mm;font-variant-numeric:tabular-nums}
th{font-size:8.5pt;text-transform:uppercase;letter-spacing:.6px;color:${theme.muted};text-align:left;border-bottom:1.2px solid ${theme.primary};padding:6px 4px}
td{padding:7px 4px;border-bottom:1px solid ${theme.border}}.r{text-align:right;font-variant-numeric:tabular-nums}.tot td{border:none;padding:3px 4px}.grand td{font-weight:700;font-size:12pt;color:${theme.primary};border-top:1.2px solid ${theme.primary}}
.addr{margin-top:10mm;margin-left:95mm;line-height:1.45}
.foot{position:absolute;left:8mm;right:8mm;bottom:${PAYMENT_BAND_MM}mm;min-height:8mm;display:flex;justify-content:space-between;align-items:flex-end;gap:4mm;font-size:8pt;color:${theme.muted};padding-bottom:1.5mm}
.scan{font-size:8.5pt;font-weight:700;color:${theme.primary};text-align:right}
.warn{background:${theme.warningBg};color:${theme.warning};padding:2mm 3mm;border-radius:2mm;font-size:7.5pt;margin-top:2mm}
.qr{position:absolute;left:0;right:0;bottom:0;height:${PAYMENT_BAND_MM}mm;border-top:1px dashed ${theme.qrInk};display:flex;font-size:8pt;background:${theme.qrPaper}}
.scissors{position:absolute;top:-2.6mm;left:2mm;font-size:10pt;line-height:1;background:${theme.qrPaper};padding:0 1mm}
.rec{width:${RECEIPT_WIDTH_MM}mm;padding:5mm;border-right:1px dashed ${theme.qrInk};position:relative}
.rec .vcut{position:absolute;top:-2.6mm;right:-2.2mm;background:${theme.qrPaper};font-size:10pt;line-height:1}
.pay{width:${PAYMENT_WIDTH_MM}mm;padding:5mm;display:flex;gap:5mm}
.qh{font-weight:700;font-size:11pt;margin-bottom:3mm}
.lb{font-weight:700;font-size:6pt;margin-top:2.5mm}
</style></head><body>${body}<script>window.onload=function(){setTimeout(function(){window.focus();window.print()},300)}</script></body></html>`;
}

function header(c: Company, a: Account | undefined) {
  return `<div class="top"><div>${GREEN_LOGO_SVG}<div class="tag" style="margin-top:2mm">${esc(c.tagline)}</div></div>
<div class="muted" style="text-align:right;line-height:1.5">${esc(c.name)}<br>${esc(companyAddress(c))}<br>UID ${esc(c.uid)}${visibleVatNumber(c) ? '<br>N° TVA ' + esc(visibleVatNumber(c)) : ''}${c.email ? '<br>' + esc(c.email) : ''}${c.phone ? '<br>' + esc(c.phone) : ''}</div></div>
<div class="addr">${a ? `<b>${esc(a.nom)}</b>${a.contact_nom ? '<br>' + esc(a.contact_nom) : ''}${a.adresse ? '<br>' + esc(a.adresse) : ''}<br>${esc([a.npa, a.ville].filter(Boolean).join(' '))}` : ''}</div>`;
}

function linesTable(doc: Offer | Invoice) {
  const t = totals(doc.lines, doc.vat);
  const rows = doc.lines
    .map((l) => `<tr><td>${esc(l.description)}</td><td class="r">${l.qty}</td><td class="r">${chf(l.unitPrice, false)}</td><td class="r">${chf(l.qty * l.unitPrice, false)}</td></tr>`)
    .join('');
  const vatRows = doc.vat.apply
    ? `<tr class="tot"><td colspan="3" class="r">TVA ${doc.vat.rate.toFixed(1)} %</td><td class="r">${chf(t.tva, false)}</td></tr>`
    : `<tr class="tot"><td colspan="3" class="r muted">TVA non applicable</td><td class="r muted">—</td></tr>`;
  return `<table><thead><tr><th>Désignation</th><th class="r">Qté</th><th class="r">Prix unit. CHF</th><th class="r">Total CHF</th></tr></thead><tbody>${rows}
<tr class="tot"><td colspan="3" class="r" style="padding-top:8px">Total HT</td><td class="r" style="padding-top:8px">${chf(t.ht, false)}</td></tr>${vatRows}
<tr class="grand"><td colspan="3" class="r">Total ${doc.vat.apply ? 'TTC' : ''} CHF</td><td class="r">${chf(t.ttc, false)}</td></tr></tbody></table>`;
}

export function offerHtml(c: Company, a: Account | undefined, o: Offer) {
  return shell(
    `Offre ${o.number}`,
    `<div class="page">${header(c, a)}<h1>Offre ${esc(o.number)}</h1><div class="muted">Date : ${dateCH(o.date)} · Valable jusqu'au ${dateCH(o.validUntil)}</div>${linesTable(o)}
${o.notes ? `<p style="margin-top:8mm;white-space:pre-wrap">${esc(o.notes)}</p>` : ''}
<p class="muted" style="margin-top:8mm">Livraison dans le canton de Vaud, offerte dès CHF 36 de commande.</p>
<div class="foot" style="bottom:14mm">${esc(c.name)} · ${esc(companyAddress(c))} · UID ${esc(c.uid)}</div></div>`,
  );
}

export function invoiceHtml(c: Company, a: Account | undefined, inv: Invoice) {
  const tot = totals(inv.lines, inv.vat);
  const qb = buildQrBill(c, a, inv, tot.ttc);
  const specimen = qb.ibanStatus !== 'ok';
  const ibanTxt = isPlaceholderIban(c.iban) ? 'YOUR_SWISS_IBAN' : formatIban(c.iban);
  const cred = `${esc(ibanTxt)}<br>${esc(c.name)}<br>${esc(c.street)} ${esc(c.houseNo)}<br>${esc(c.zip)} ${esc(c.town)}`;
  const deb = a ? `${esc(a.nom)}${a.adresse ? '<br>' + esc(a.adresse) : ''}<br>${esc([a.npa, a.ville].filter(Boolean).join(' '))}` : '';
  const ref = qb.reference.replace(/(.{4})/g, '$1 ').trim();
  const outside = specimen
    ? `<div class="warn">${qb.ibanStatus === 'placeholder' ? 'SPÉCIMEN — IBAN non configuré (YOUR_SWISS_IBAN). QR non payable.' : 'SPÉCIMEN — IBAN invalide. QR non payable.'}</div>`
    : '';
  return shell(
    `Facture ${inv.number}`,
    `<div class="page">${header(c, a)}<h1>Facture ${esc(inv.number)}</h1>
<div class="muted">Date : ${dateCH(inv.date)} · Échéance : ${dateCH(inv.dueDate)}${inv.offerId ? ' · selon offre acceptée' : ''}</div>${linesTable(inv)}
${inv.notes ? `<p style="margin-top:6mm;white-space:pre-wrap">${esc(inv.notes)}</p>` : ''}
<p class="muted" style="margin-top:6mm">Paiement à ${c.paymentDays} jours, par QR-facture (TWINT / e-banking). Merci de votre confiance.</p>
${outside}
<div class="foot"><div>${esc(c.name)} · ${esc(companyAddress(c))} · UID ${esc(c.uid)}${inv.vat.apply ? '' : ' · TVA non applicable'}</div><div class="scan">Scannez pour payer (TWINT / e-banking)</div></div>
<div class="qr"><span class="scissors">✂</span><div class="rec"><span class="vcut">✂</span><div class="qh">Récépissé</div><div class="lb">Compte / Payable à</div>${cred}<div class="lb">Référence</div>${ref}
<div class="lb">Payable par</div>${deb || '—'}<div style="display:flex;gap:8mm;margin-top:6mm"><div><div class="lb">Monnaie</div>CHF</div><div><div class="lb">Montant</div>${chf(tot.ttc, false)}</div></div><div class="lb" style="text-align:right;margin-top:6mm">Point de dépôt</div></div>
<div class="pay" style="flex-wrap:wrap"><div class="qh" style="width:100%">Section paiement</div><div>${qrSvg(qb.payload, QR_PRINT_MM, specimen)}
<div style="display:flex;gap:8mm;margin-top:3mm"><div><div class="lb">Monnaie</div>CHF</div><div><div class="lb">Montant</div>${chf(tot.ttc, false)}</div></div></div>
<div style="line-height:1.4"><div class="lb">Compte / Payable à</div>${cred}<div class="lb">Référence</div>${ref}<div class="lb">Informations supplémentaires</div>${esc(qb.message)}<div class="lb">Payable par</div>${deb || '—'}</div></div></div></div>`,
  );
}

export function creditNoteHtml(c: Company, a: Account | undefined, note: CreditNote) {
  const tot = totals(note.lines, note.vat);
  const asInvoice = { ...note, status: 'cancelled' as const, dueDate: note.date, notes: note.notes };
  return shell(
    `Avoir ${note.number}`,
    `<div class="page">${header(c, a)}<h1>Avoir ${esc(note.number)}</h1>
<div class="muted">Date : ${dateCH(note.date)} · Annule la facture n° ${esc(note.invoiceNumber)}</div>${linesTable({ ...asInvoice, lines: note.lines, vat: note.vat })}
<p class="muted" style="margin-top:6mm">Montants de l’avoir : ${chf(tot.ttc)}. Ce document n’est pas une QR-facture.</p>
<div class="foot" style="bottom:14mm"><div>${esc(c.name)} · ${esc(companyAddress(c))} · UID ${esc(c.uid)}${note.vat.apply ? '' : ' · TVA non applicable'}</div></div></div>`,
  );
}

/** Lien mailto pré-rempli (ouvre le client mail de l'utilisateur ; rien n'est envoyé automatiquement). */
export function mailto(to: string, subject: string, body: string) {
  return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

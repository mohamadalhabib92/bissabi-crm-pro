import { formatIban, isPlaceholderIban } from './iban';
import { GREEN_LOGO_SVG, BRAND_GREEN } from './logo';
import { chf, dateCH } from './format';
import { buildQrBill, QR_PRINT_MM, qrSvg } from './qrbill';
import { isHoreca, totals, type Account, type Company, type Invoice, type Offer } from './model';

/** Numéro TVA imprimé seulement s'il a été saisi et n'est pas un placeholder. */
export function visibleVatNumber(c: Company): string | null {
  const v = (c.vatNumber ?? '').trim();
  if (!v || v.startsWith('YOUR_')) return null;
  return v;
}

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
@page{size:A4;margin:0}*{box-sizing:border-box}body{margin:0;font-family:Helvetica,Arial,sans-serif;color:#16211B;font-size:10pt}
.page{width:210mm;min-height:297mm;padding:16mm 18mm 0;position:relative}
.top{display:flex;justify-content:space-between;align-items:flex-start}.muted{color:#6B746E}.tag{font-size:8pt;letter-spacing:.5px;color:${BRAND_GREEN}}
h1{font-size:18pt;color:${BRAND_GREEN};margin:14mm 0 2mm;font-weight:600}table{width:100%;border-collapse:collapse;margin-top:6mm}
th{font-size:8.5pt;text-transform:uppercase;letter-spacing:.6px;color:#6B746E;text-align:left;border-bottom:1.2px solid ${BRAND_GREEN};padding:6px 4px}
td{padding:7px 4px;border-bottom:1px solid #E2E4DE}.r{text-align:right}.tot td{border:none;padding:3px 4px}.grand td{font-weight:700;font-size:12pt;color:${BRAND_GREEN};border-top:1.2px solid ${BRAND_GREEN}}
.addr{margin-top:10mm;margin-left:95mm;line-height:1.45}.foot{position:absolute;left:18mm;right:18mm;bottom:118mm;font-size:8pt;color:#6B746E;border-top:1px solid #E2E4DE;padding-top:3mm}
.scanbar{position:absolute;left:0;right:0;bottom:105mm;height:8mm;display:flex;align-items:center;justify-content:center;gap:3mm;font-size:9pt;font-weight:700;color:${BRAND_GREEN}}
.slip{position:absolute;left:0;right:0;bottom:0;height:105mm;display:flex;font-size:8pt;overflow:hidden}
.rec{width:62mm;height:105mm;padding:5mm;border-right:1px dashed #000;box-sizing:border-box}
.pay{width:148mm;height:105mm;padding:5mm;box-sizing:border-box;display:flex;gap:5mm}
.qrbox{width:${QR_PRINT_MM}mm;height:${QR_PRINT_MM}mm;flex:0 0 ${QR_PRINT_MM}mm}
.qh{font-weight:700;font-size:11pt;margin-bottom:2mm}
.lb{font-weight:700;font-size:6pt;margin-top:2mm}
.scissors{font-size:9pt;line-height:1}
.warn{background:#FCF1D9;color:#8A5A00;padding:2mm 3mm;border-radius:2mm;font-size:7.5pt;margin-top:2mm}
.specimen{position:absolute;left:8%;right:8%;top:38mm;text-align:center;font-size:22pt;font-weight:800;letter-spacing:4px;color:#8A5A00;opacity:.45;transform:rotate(-18deg)}
</style></head><body>${body}<script>window.onload=function(){setTimeout(function(){window.focus();window.print()},300)}</script></body></html>`;
}

function header(c: Company, a: Account | undefined) {
  return `<div class="top"><div>${GREEN_LOGO_SVG}<div class="tag" style="margin-top:2mm">${esc(c.tagline)}</div></div>
<div class="muted" style="text-align:right;line-height:1.5">${esc(c.name)}<br>${esc(companyAddress(c))}<br>UID ${esc(c.uid)}${visibleVatNumber(c) ? '<br>TVA ' + esc(visibleVatNumber(c)) : ''}${c.email ? '<br>' + esc(c.email) : ''}${c.phone ? '<br>' + esc(c.phone) : ''}</div></div>
<div class="addr">${a ? `<b>${esc(a.nom)}</b>${a.contact_nom ? '<br>' + esc(a.contact_nom) : ''}${a.adresse ? '<br>' + esc(a.adresse) : ''}<br>${esc([a.npa, a.ville].filter(Boolean).join(' '))}` : ''}</div>`;
}

function linesTable(doc: Offer | Invoice, sign = 1) {
  const t = totals(doc.lines, doc.vat);
  const rows = doc.lines
    .map((l) => `<tr><td>${esc(l.description)}</td><td class="r">${l.qty}</td><td class="r">${chf(sign * l.unitPrice, false)}</td><td class="r">${chf(sign * l.qty * l.unitPrice, false)}</td></tr>`)
    .join('');
  const vatRows = doc.vat.apply
    ? `<tr class="tot"><td colspan="3" class="r">TVA ${doc.vat.rate.toFixed(1)} %</td><td class="r">${chf(sign * t.tva, false)}</td></tr>`
    : `<tr class="tot"><td colspan="3" class="r muted">TVA non applicable</td><td class="r muted">—</td></tr>`;
  return `<table><thead><tr><th>Désignation</th><th class="r">Qté</th><th class="r">Prix unit. CHF</th><th class="r">Total CHF</th></tr></thead><tbody>${rows}
<tr class="tot"><td colspan="3" class="r" style="padding-top:8px">Total HT</td><td class="r" style="padding-top:8px">${chf(sign * t.ht, false)}</td></tr>${vatRows}
<tr class="grand"><td colspan="3" class="r">Total ${doc.vat.apply ? 'TTC' : ''} CHF</td><td class="r">${chf(sign * t.ttc, false)}</td></tr></tbody></table>`;
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
  const credit = inv.kind === 'credit';
  const t = totals(inv.lines, inv.vat);
  const sign = credit ? -1 : 1;
  const title = credit ? `Avoir ${inv.number}` : `Facture ${inv.number}`;
  const qb = buildQrBill(c, a, inv, t.ttc);
  const specimen = qb.ibanStatus !== 'ok';
  const ibanTxt = isPlaceholderIban(c.iban) ? 'YOUR_SWISS_IBAN' : formatIban(c.iban);
  const cred = `${esc(ibanTxt)}<br>${esc(c.name)}<br>${esc(c.street)} ${esc(c.houseNo)}<br>${esc(c.zip)} ${esc(c.town)}`;
  const deb = a ? `${esc(a.nom)}${a.adresse ? '<br>' + esc(a.adresse) : ''}<br>${esc([a.npa, a.ville].filter(Boolean).join(' '))}` : '';
  const ref = qb.reference.replace(/(.{4})/g, '$1 ').trim();
  const money = chf(sign * t.ttc, false);
  const slip = credit
    ? ''
    : `<div class="scanbar"><span class="scissors">✂</span> Scannez pour payer (TWINT / e-banking) <span class="scissors">✂</span></div>
<div class="slip">${specimen ? '<div class="specimen">SPÉCIMEN</div>' : ''}<div class="rec"><div class="qh">Récépissé</div><div class="lb">Compte / Payable à</div>${cred}<div class="lb">Référence</div>${ref}
<div class="lb">Payable par</div>${deb || '—'}<div style="display:flex;gap:6mm;margin-top:4mm"><div><div class="lb">Monnaie</div>CHF</div><div><div class="lb">Montant</div>${money}</div></div><div class="lb" style="text-align:right;margin-top:4mm">Point de dépôt</div></div>
<div class="pay"><div class="qrbox">${qrSvg(qb.payload, QR_PRINT_MM, specimen)}</div>
<div style="line-height:1.35;flex:1"><div class="qh">Section paiement</div>
<div style="display:flex;gap:6mm"><div><div class="lb">Monnaie</div>CHF</div><div><div class="lb">Montant</div>${money}</div></div>
<div class="lb">Compte / Payable à</div>${cred}<div class="lb">Référence</div>${ref}<div class="lb">Informations supplémentaires</div>${esc(qb.message)}<div class="lb">Payable par</div>${deb || '—'}
${specimen ? `<div class="warn">${qb.ibanStatus === 'placeholder' ? 'IBAN non configuré (YOUR_SWISS_IBAN) — QR non payable.' : 'IBAN invalide — QR non payable.'}</div>` : ''}</div></div>`;
  return shell(
    title,
    `<div class="page">${header(c, a)}<h1>${esc(title)}</h1>
<div class="muted">Date : ${dateCH(inv.date)}${credit ? '' : ` · Échéance : ${dateCH(inv.dueDate)}`}${inv.offerId ? ' · selon offre acceptée' : ''}${credit && inv.relatedId ? ' · avoir' : ''}</div>${linesTable(inv, sign)}
${inv.notes ? `<p style="margin-top:6mm;white-space:pre-wrap">${esc(inv.notes)}</p>` : ''}
<p class="muted" style="margin-top:6mm">${credit ? 'Ce document est un avoir. Il ne se paie pas : il compense la facture d’origine.' : `Paiement à ${c.paymentDays} jours, par QR-facture (TWINT / e-banking). Merci de votre confiance.`}</p>
<div class="foot">${esc(c.name)} · ${esc(companyAddress(c))} · UID ${esc(c.uid)}${inv.vat.apply ? '' : ' · TVA non applicable'}</div>
${slip}</div>`,
  );
}

/** Lien mailto pré-rempli (ouvre le client mail de l'utilisateur ; rien n'est envoyé automatiquement). */
export function mailto(to: string, subject: string, body: string) {
  return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

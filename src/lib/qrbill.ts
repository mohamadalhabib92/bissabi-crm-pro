import QRCode from 'qrcode';
import { compactIban, isPlaceholderIban, isQrIban, isValidIban, qrReference, scorReference } from './iban';
import type { Account, Company, Invoice } from './model';

/**
 * Swiss QR-bill — charge utile « SPC » (Swiss Payments Code, version 0200, adresses structurées « S »).
 * IBAN : uniquement celui saisi dans Réglages ; par défaut le placeholder YOUR_SWISS_IBAN → QR « SPÉCIMEN ».
 */
export type QrBillData = {
  payload: string;
  reference: string;
  referenceType: 'QRR' | 'SCOR' | 'NON';
  amount: number;
  ibanStatus: 'placeholder' | 'invalid' | 'ok';
  message: string;
};

const clip = (s: string | undefined, n: number) => (s ?? '').replace(/[\r\n]+/g, ' ').trim().slice(0, n);

/** Sépare « Rue du Lac 12 » → [« Rue du Lac », « 12 »]. */
export function splitStreet(s?: string): [string, string] {
  const m = /^(.*?)[,\s]+(\d+[a-zA-Z]?)$/.exec((s ?? '').trim());
  return m ? [m[1], m[2]] : [(s ?? '').trim(), ''];
}

export function buildQrBill(company: Company, account: Account | undefined, inv: Invoice, amount: number): QrBillData {
  const iban = compactIban(company.iban);
  const ibanStatus = isPlaceholderIban(iban) ? 'placeholder' : isValidIban(iban) ? 'ok' : 'invalid';
  const qr = ibanStatus === 'ok' && isQrIban(iban);
  const referenceType = qr ? 'QRR' : 'SCOR';
  const reference = qr ? qrReference(inv.number) : scorReference(inv.number);
  const message = clip(`Facture ${inv.number}`, 140);
  const debtor = account && account.adresse && account.npa && account.ville;
  const [dStreet, dNo] = splitStreet(account?.adresse);
  const lines = [
    'SPC', '0200', '1',
    iban,
    'S', clip(company.name, 70), clip(company.street, 70), clip(company.houseNo, 16), clip(company.zip, 16), clip(company.town, 35), company.country || 'CH',
    '', '', '', '', '', '', '',
    amount > 0 ? amount.toFixed(2) : '', 'CHF',
    ...(debtor ? ['S', clip(account!.nom, 70), clip(dStreet, 70), clip(dNo, 16), clip(account!.npa, 16), clip(account!.ville, 35), 'CH'] : ['', '', '', '', '', '', '']),
    referenceType, reference,
    message,
    'EPD',
  ];
  return { payload: lines.join('\r\n'), reference, referenceType, amount, ibanStatus, message };
}

/** Matrice QR (correction M) → chemin SVG (unités = modules). */
export function qrPath(payload: string): { size: number; d: string } {
  const qr = QRCode.create(payload, { errorCorrectionLevel: 'M' });
  const n = qr.modules.size;
  let d = '';
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (qr.modules.get(x, y)) d += `M${x} ${y}h1v1h-1z`;
  return { size: n, d };
}

/** SVG autonome (QR + croix suisse 7/46 de la largeur) pour PDF/HTML. */
export function qrSvg(payload: string, mm = 35, specimen = false): string {
  const { size, d } = qrPath(payload);
  const c = size * (7 / 46);
  const o = (size - c) / 2;
  const k = c / 32;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${mm}mm" height="${mm}mm" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges">
<rect width="${size}" height="${size}" fill="#fff"/><path d="${d}" fill="#000"/>
<rect x="${o}" y="${o}" width="${c}" height="${c}" fill="#fff"/><rect x="${o + 2 * k}" y="${o + 2 * k}" width="${28 * k}" height="${28 * k}" fill="#000"/>
<rect x="${o + 13 * k}" y="${o + 7 * k}" width="${6 * k}" height="${18 * k}" fill="#fff"/><rect x="${o + 7 * k}" y="${o + 13 * k}" width="${18 * k}" height="${6 * k}" fill="#fff"/>
${specimen ? `<g transform="rotate(-35 ${size / 2} ${size / 2})"><rect x="${-size * 0.2}" y="${size / 2 - size * 0.08}" width="${size * 1.4}" height="${size * 0.16}" fill="#C9A84C" opacity="0.92"/><text x="${size / 2}" y="${size / 2 + size * 0.045}" font-size="${size * 0.11}" font-family="Arial" font-weight="700" fill="#fff" text-anchor="middle">SPÉCIMEN</text></g>` : ''}
</svg>`;
}

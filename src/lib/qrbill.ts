import QRCode from 'qrcode';
import { theme } from '../ui/theme';
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

/** QR imprimé 46 × 46 mm (croix suisse 7 × 7 mm). L’aperçu écran peut être plus petit. */
export const QR_PRINT_MM = 46;
export const SWISS_CROSS_RATIO = 7 / 46;
export const RECEIPT_WIDTH_MM = 62;
export const PAYMENT_WIDTH_MM = 148;
export const PAYMENT_BAND_MM = 105;

const clip = (s: string | undefined, n: number) => (s ?? '').replace(/[\r\n]+/g, ' ').trim().slice(0, n);

export function swissCrossRect(size: number) {
  const c = size * SWISS_CROSS_RATIO;
  const o = (size - c) / 2;
  const k = c / 32;
  return { c, o, k };
}

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
  const message = clip(`Facture n° ${inv.number}`, 140);
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

/** Matrice QR (correction M), sans zone calme : les modules bruts. */
export function qrMatrix(payload: string): { size: number; dark: (x: number, y: number) => boolean } {
  const qr = QRCode.create(payload, { errorCorrectionLevel: 'M' });
  return { size: qr.modules.size, dark: (x, y) => !!qr.modules.get(x, y) };
}

/** Matrice QR (correction M) → chemin SVG (unités = modules). */
export function qrPath(payload: string): { size: number; d: string } {
  const { size, dark } = qrMatrix(payload);
  let d = '';
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (dark(x, y)) d += `M${x} ${y}h1v1h-1z`;
  return { size, d };
}

/** SVG autonome (QR 46 mm + croix suisse 7 mm) pour PDF/HTML. */
export function qrSvg(payload: string, mm = QR_PRINT_MM, specimen = false): string {
  const { size, d } = qrPath(payload);
  const { c, o, k } = swissCrossRect(size);
  const ink = theme.qrInk;
  const paper = theme.qrPaper;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${mm}mm" height="${mm}mm" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges">
<rect width="${size}" height="${size}" fill="${paper}"/><path d="${d}" fill="${ink}"/>
<rect x="${o}" y="${o}" width="${c}" height="${c}" fill="${paper}"/><rect x="${o + 2 * k}" y="${o + 2 * k}" width="${28 * k}" height="${28 * k}" fill="${ink}"/>
<rect x="${o + 13 * k}" y="${o + 7 * k}" width="${6 * k}" height="${18 * k}" fill="${paper}"/><rect x="${o + 7 * k}" y="${o + 13 * k}" width="${18 * k}" height="${6 * k}" fill="${paper}"/>
${specimen ? `<g transform="rotate(-35 ${size / 2} ${size / 2})"><rect x="${-size * 0.2}" y="${size / 2 - size * 0.08}" width="${size * 1.4}" height="${size * 0.16}" fill="${theme.accent}" opacity="0.92"/><text x="${size / 2}" y="${size / 2 + size * 0.045}" font-size="${size * 0.11}" font-family="Arial" font-weight="700" fill="${theme.text}" text-anchor="middle">SPÉCIMEN</text></g>` : ''}
</svg>`;
}

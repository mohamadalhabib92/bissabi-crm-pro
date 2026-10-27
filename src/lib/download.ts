import { Platform, Share } from 'react-native';

/** Export de fichier texte (CSV/JSON). Web : téléchargement ; mobile : feuille de partage. */
export async function downloadText(filename: string, content: string, mime = 'text/csv;charset=utf-8') {
  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    const bom = mime.startsWith('text/csv') ? '\uFEFF' : '';
    const blob = new Blob([bom + content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  }
  await Share.share({ title: filename, message: content });
}

export function csvEscape(v: unknown, sep = ';'): string {
  const s = v == null ? '' : String(v);
  return s.includes(sep) || s.includes('"') || s.includes('\n') ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export function toCSV(rows: unknown[][], sep = ';'): string {
  return rows.map((r) => r.map((c) => csvEscape(c, sep)).join(sep)).join('\n');
}

/** Parseur CSV simple (guillemets gérés). */
export function parseCSV(text: string, sep = ';'): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let q = false;
  const t = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) {
      if (c === '"' && t[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === sep) {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

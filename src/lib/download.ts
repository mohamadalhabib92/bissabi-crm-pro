import { Platform, Share } from 'react-native';
export { csvEscape, parseCSV, toCSV } from './csv';

/** Export de fichier texte (CSV/JSON). Web : téléchargement ; mobile : feuille de partage. */
/** @returns false si le partage a été annulé. */
export async function downloadText(filename: string, content: string, mime = 'text/csv;charset=utf-8'): Promise<boolean> {
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
    return true;
  }
  const res = await Share.share({ title: filename, message: content });
  return res.action !== Share.dismissedAction;
}

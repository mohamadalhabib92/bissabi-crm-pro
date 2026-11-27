import * as DocumentPicker from 'expo-document-picker';
import { isIosAppOnMac } from '@/lib/mac';
import { macLimitMessage } from '@/lib/macLimits';

export type MacPickBlock = { canceled: true; assets: null; macBlocked: string };

/** Sélecteur de fichiers. Sur Mac : aucun appel natif, message explicite, aucun import. */
export async function pickDocuments(options: DocumentPicker.DocumentPickerOptions): Promise<DocumentPicker.DocumentPickerResult | MacPickBlock> {
  if (isIosAppOnMac()) {
    return { canceled: true, assets: null, macBlocked: macLimitMessage('documentPicker') ?? '' };
  }
  return DocumentPicker.getDocumentAsync(options);
}

export function macPickBlock(result: DocumentPicker.DocumentPickerResult | MacPickBlock): string | null {
  return 'macBlocked' in result && result.macBlocked ? result.macBlocked : null;
}

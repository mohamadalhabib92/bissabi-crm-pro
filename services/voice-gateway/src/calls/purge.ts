import type { SupabaseClient } from '@supabase/supabase-js';
import { log } from '../log';

/** Clé d'objet dans le bucket privé `call-recordings`, sans le préfixe du bucket. */
export function recordingObjectKey(recordingPath: string): string {
  return recordingPath.trim().replace(/^storage:\s*/i, '').replace(/^call-recordings\//, '');
}

export type ExpiredRecording = { id: string; recording_path: string };

/**
 * Supprime les fichiers, puis seulement alors rend les ids à effacer en base.
 * Un échec de Storage laisse le chemin en place pour un nouvel essai.
 */
export async function deleteExpiredRecordingFiles(
  rows: ExpiredRecording[],
  remove: (keys: string[]) => Promise<void>,
): Promise<string[]> {
  if (!rows.length) return [];
  const keys = rows.map((row) => recordingObjectKey(row.recording_path));
  await remove(keys);
  return rows.map((row) => row.id);
}

export async function purgeExpiredRecordings(db: SupabaseClient): Promise<number> {
  const { data, error } = await db.from('tel_calls')
    .select('id, recording_path')
    .not('recording_path', 'is', null)
    .lt('recording_expires_at', new Date().toISOString());
  if (error) throw new Error(error.message);
  const rows = (data ?? []).filter((row): row is ExpiredRecording => typeof row.recording_path === 'string' && row.recording_path.length > 0);
  const cleared = await deleteExpiredRecordingFiles(rows, async (keys) => {
    const removed = await db.storage.from('call-recordings').remove(keys);
    if (removed.error) throw new Error(removed.error.message);
  });
  if (!cleared.length) return 0;
  const update = await db.from('tel_calls').update({
    recording_path: null,
    recording_key_ref: null,
    recording_sha256: null,
  }).in('id', cleared);
  if (update.error) throw new Error(update.error.message);
  log('info', 'enregistrements expirés supprimés', { count: cleared.length });
  return cleared.length;
}

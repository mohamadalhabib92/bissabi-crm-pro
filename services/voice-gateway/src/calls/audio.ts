/** v1 : aucun fichier audio. Le drapeau reste faux tant qu'un consentement explicite n'est pas enregistré. */
export function mayStoreAudio(opts: { recordingEnabled: boolean; consent: 'accorde' | 'refuse' | null }): boolean {
  return opts.recordingEnabled === true && opts.consent === 'accorde';
}

const APP_STAGES = new Set(['prospect', 'contacte', 'rdv_echantillon', 'essai', 'premiere_commande', 'client_actif']);

/** Les fiches déjà en base utilisent CLIENT / DEGUSTATION / CONTACTE. Les nouvelles fiches suivent le pipeline de l'app. */
export function nextStage(current: string | null | undefined, outcome: string): string | null {
  const legacy = !!current && !APP_STAGES.has(current);
  if (legacy) {
    if (outcome === 'rdv_pris' || outcome === 'echantillon') return 'DEGUSTATION';
    if (outcome === 'interesse' || outcome === 'a_rappeler' || outcome === 'catalogue') return 'CONTACTE';
    if (outcome === 'commande') return 'CLIENT';
    return null;
  }
  const map: Record<string, string> = {
    interesse: 'contacte',
    a_rappeler: 'contacte',
    catalogue: 'contacte',
    rdv_pris: 'rdv_echantillon',
    echantillon: 'rdv_echantillon',
    commande: 'premiere_commande',
  };
  return map[outcome] ?? null;
}

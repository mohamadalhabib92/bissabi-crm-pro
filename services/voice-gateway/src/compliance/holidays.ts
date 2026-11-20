/** Jours fériés Vaud + 1er août fédéral, alignés sur la migration (2026–2027). */
export type Holiday = { day: string; canton: string | null; label?: string };

export const VAUD_HOLIDAYS: Holiday[] = [
  { day: '2026-01-01', canton: 'VD', label: 'Nouvel An' },
  { day: '2026-01-02', canton: 'VD', label: 'Saint-Berchtold' },
  { day: '2026-04-03', canton: 'VD', label: 'Vendredi saint' },
  { day: '2026-04-06', canton: 'VD', label: 'Lundi de Pâques' },
  { day: '2026-05-14', canton: 'VD', label: 'Ascension' },
  { day: '2026-05-25', canton: 'VD', label: 'Lundi de Pentecôte' },
  { day: '2026-08-01', canton: null, label: 'Fête nationale' },
  { day: '2026-09-21', canton: 'VD', label: 'Lundi du Jeûne fédéral' },
  { day: '2026-12-25', canton: 'VD', label: 'Noël' },
  { day: '2027-01-01', canton: 'VD', label: 'Nouvel An' },
  { day: '2027-01-02', canton: 'VD', label: 'Saint-Berchtold' },
  { day: '2027-03-26', canton: 'VD', label: 'Vendredi saint' },
  { day: '2027-03-29', canton: 'VD', label: 'Lundi de Pâques' },
  { day: '2027-05-06', canton: 'VD', label: 'Ascension' },
  { day: '2027-05-17', canton: 'VD', label: 'Lundi de Pentecôte' },
  { day: '2027-08-01', canton: null, label: 'Fête nationale' },
  { day: '2027-09-20', canton: 'VD', label: 'Lundi du Jeûne fédéral' },
  { day: '2027-12-25', canton: 'VD', label: 'Noël' },
];

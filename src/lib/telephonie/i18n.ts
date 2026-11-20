export type TelLang = 'fr' | 'en' | 'ar' | 'de';

const FR = {
  title: 'Téléphonie IA',
  dashboard: 'Tableau de bord',
  journal: 'Journal',
  scripts: 'Scripts',
  campaigns: 'Campagnes',
  dnc: 'Ne pas appeler',
  knowledge: 'Connaissances',
  calls: 'Appels du jour',
  answerRate: 'Taux de décroché',
  conversion: 'Conversion',
  meetings: 'Rendez-vous',
  duration: 'Durée moyenne',
  cost: 'Coût par appel',
  signIn: 'Connexion',
  signOut: 'Déconnexion',
  email: 'E-mail',
  password: 'Mot de passe',
  notConfigured: 'Supabase n’est pas configuré. Les autres écrans du CRM restent sur cet appareil.',
  empty: 'Rien pour le moment.',
  save: 'Enregistrer',
  publish: 'Publier',
  pause: 'Mettre en pause',
  resume: 'Reprendre',
  importCsv: 'Importer le CSV',
  add: 'Ajouter',
  loading: 'Chargement…',
  transcript: 'Transcription',
  summary: 'Résumé',
  sentiment: 'Sentiment',
  outcome: 'Résultat',
  voice: 'Voix',
  provider: 'Moteur vocal',
  opening: 'Phrase d’ouverture',
  prompt: 'Prompt système',
  newVersion: 'Nouvelle version',
  sandbox: 'Bac à sable',
  create: 'Créer',
  search: 'Rechercher',
} as const;

type Key = keyof typeof FR;

const DICTS: Record<TelLang, Record<Key, string>> = {
  fr: FR,
  en: {
    title: 'AI telephony', dashboard: 'Dashboard', journal: 'Call log', scripts: 'Scripts', campaigns: 'Campaigns', dnc: 'Do not call', knowledge: 'Knowledge',
    calls: 'Calls today', answerRate: 'Answer rate', conversion: 'Conversion', meetings: 'Meetings', duration: 'Average duration', cost: 'Cost per call',
    signIn: 'Sign in', signOut: 'Sign out', email: 'Email', password: 'Password', notConfigured: 'Supabase is not configured. The rest of the CRM stays on this device.',
    empty: 'Nothing yet.', save: 'Save', publish: 'Publish', pause: 'Pause', resume: 'Resume', importCsv: 'Import CSV', add: 'Add', loading: 'Loading…',
    transcript: 'Transcript', summary: 'Summary', sentiment: 'Sentiment', outcome: 'Outcome', voice: 'Voice', provider: 'Voice engine', opening: 'Opening line',
    prompt: 'System prompt', newVersion: 'New version', sandbox: 'Sandbox', create: 'Create', search: 'Search',
  },
  ar: {
    title: 'الهاتف بالذكاء الاصطناعي', dashboard: 'لوحة اليوم', journal: 'سجل المكالمات', scripts: 'النصوص', campaigns: 'الحملات', dnc: 'عدم الاتصال', knowledge: 'المعرفة',
    calls: 'مكالمات اليوم', answerRate: 'نسبة الرد', conversion: 'التحويل', meetings: 'المواعيد', duration: 'متوسط المدة', cost: 'كلفة المكالمة',
    signIn: 'دخول', signOut: 'خروج', email: 'البريد', password: 'كلمة السر', notConfigured: 'سوبابيس غير مُعد. بقية التطبيق تبقى على هذا الجهاز.',
    empty: 'لا شيء بعد.', save: 'حفظ', publish: 'نشر', pause: 'إيقاف', resume: 'استئناف', importCsv: 'استيراد CSV', add: 'إضافة', loading: 'جارٍ التحميل…',
    transcript: 'التفريغ', summary: 'الملخص', sentiment: 'المزاج', outcome: 'النتيجة', voice: 'الصوت', provider: 'محرك الصوت', opening: 'جملة الافتتاح',
    prompt: 'تعليمات النظام', newVersion: 'نسخة جديدة', sandbox: 'وضع التجربة', create: 'إنشاء', search: 'بحث',
  },
  de: {
    title: 'KI-Telefonie', dashboard: 'Übersicht', journal: 'Journal', scripts: 'Skripte', campaigns: 'Kampagnen', dnc: 'Nicht anrufen', knowledge: 'Wissen',
    calls: 'Anrufe heute', answerRate: 'Annahmequote', conversion: 'Conversion', meetings: 'Termine', duration: 'Durchschnittsdauer', cost: 'Kosten pro Anruf',
    signIn: 'Anmelden', signOut: 'Abmelden', email: 'E-Mail', password: 'Passwort', notConfigured: 'Supabase ist nicht konfiguriert. Der Rest des CRM bleibt auf diesem Gerät.',
    empty: 'Noch nichts.', save: 'Speichern', publish: 'Veröffentlichen', pause: 'Pause', resume: 'Fortsetzen', importCsv: 'CSV importieren', add: 'Hinzufügen', loading: 'Laden…',
    transcript: 'Transkript', summary: 'Zusammenfassung', sentiment: 'Stimmung', outcome: 'Ergebnis', voice: 'Stimme', provider: 'Sprachmotor', opening: 'Eröffnungssatz',
    prompt: 'Systemprompt', newVersion: 'Neue Version', sandbox: 'Sandbox', create: 'Erstellen', search: 'Suchen',
  },
};

export function telTr(lang: TelLang, key: Key): string {
  return DICTS[lang][key] ?? FR[key];
}

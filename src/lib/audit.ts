import { uid } from './uid';

/** Journal append-only : création, émission, envoi, paiement, annulation, sauvegarde. */
export const AUDIT_ACTIONS = ['create', 'issue', 'send', 'pay', 'cancel', 'credit_note', 'backup', 'restore', 'migration', 'rollback', 'import'] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];
export type AuditEntity = 'invoice' | 'creditNote' | 'offer' | 'account' | 'expense' | 'store';

export type AuditEvent = {
  id: string;
  at: string;
  action: AuditAction;
  entity: AuditEntity;
  entityId?: string;
  number?: string;
  detail?: string;
};

export function appendAudit(log: AuditEvent[], event: Omit<AuditEvent, 'id' | 'at'> & { id?: string; at?: string }): AuditEvent[] {
  return [
    ...log,
    {
      id: event.id ?? uid('aud_'),
      at: event.at ?? new Date().toISOString(),
      action: event.action,
      entity: event.entity,
      entityId: event.entityId,
      number: event.number,
      detail: event.detail,
    },
  ];
}

export const AUDIT_LABEL: Record<AuditAction, string> = {
  create: 'Création',
  issue: 'Émission',
  send: 'Envoi',
  pay: 'Paiement',
  cancel: 'Annulation',
  credit_note: 'Avoir',
  backup: 'Sauvegarde',
  restore: 'Restauration',
  migration: 'Migration',
  rollback: 'Retour arrière',
  import: 'Import',
};

/** Journal append-only (création, émission, envoi, paiement, annulation). Jamais édité ni tronqué par l'UI. */

export type AuditAction = 'create' | 'issue' | 'send' | 'payment' | 'cancel' | 'credit' | 'migrate' | 'restore' | 'rollback';
export type AuditEntity = 'invoice' | 'offer' | 'account' | 'expense' | 'system';

export type AuditEvent = {
  id: string;
  at: string;
  action: AuditAction;
  entity: AuditEntity;
  entityId?: string;
  detail: string;
};

export function appendAudit(log: AuditEvent[], event: AuditEvent): AuditEvent[] {
  return [...log, event];
}

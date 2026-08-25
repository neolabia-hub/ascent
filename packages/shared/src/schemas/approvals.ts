import { z } from 'zod';

/**
 * Flujo de aprobaciones del Analista (CLAUDE.md 3.3): sus cambios sobre contenido publicado
 * generan una solicitud con justificacion; el Admin decide; el cambio se APLICA solo al aprobar.
 */

export const approvalActionSchema = z.enum(['PUBLISH', 'EDIT_PUBLISHED', 'CANCEL_OFFERING', 'OTHER']);

export const createApprovalSchema = z.object({
  entityType: z.string().min(2).max(60),
  entityId: z.string().uuid(),
  action: approvalActionSchema,
  payload: z.record(z.unknown()),
  justification: z.string().min(10, 'La justificacion es obligatoria (minimo 10 caracteres)').max(2000),
});
export type CreateApprovalInput = z.infer<typeof createApprovalSchema>;

export const decideApprovalSchema = z.object({
  decision: z.enum(['APPROVED', 'REJECTED']),
  decisionNote: z.string().max(2000).optional(),
});
export type DecideApprovalInput = z.infer<typeof decideApprovalSchema>;

export const listApprovalsQuerySchema = z.object({
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

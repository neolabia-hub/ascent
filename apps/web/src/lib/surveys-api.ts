import { apiFetch } from './api';
// Solo TIPOS: `import type` se borra al compilar y no mete zod en el navegador (ver
// `certificates-api.ts`, donde esta la regla escrita).
import type { SurveyQuestion } from '@neo-pulse/shared';

export type { SurveyQuestion };

export type SurveyKind = 'SATISFACTION' | 'EFFICACY';

export interface SurveyTemplate {
  id: string;
  name: string;
  kind: SurveyKind;
  questions: SurveyQuestion[];
  /** Solo en eficacia: a los cuantos dias se le pide al jefe. */
  scheduledDaysAfter: number | null;
  active: boolean;
  version: number;
}

export interface SurveyPayload {
  name: string;
  kind: SurveyKind;
  questions: SurveyQuestion[];
  scheduledDaysAfter: number | null;
  active: boolean;
}

export function listSurveys(kind?: SurveyKind): Promise<SurveyTemplate[]> {
  return apiFetch(`/survey-templates${kind ? `?kind=${kind}` : ''}`, { method: 'GET' });
}

export function getSurvey(id: string): Promise<SurveyTemplate> {
  return apiFetch(`/survey-templates/${id}`, { method: 'GET' });
}

export function createSurvey(body: Partial<SurveyPayload> & { name: string; kind: SurveyKind }): Promise<SurveyTemplate> {
  return apiFetch('/survey-templates', { method: 'POST', body });
}

export function saveSurvey(id: string, body: SurveyPayload): Promise<SurveyTemplate> {
  return apiFetch(`/survey-templates/${id}`, { method: 'PUT', body });
}

export function deleteSurvey(id: string): Promise<{ ok: true }> {
  return apiFetch(`/survey-templates/${id}`, { method: 'DELETE' });
}

/** La encuesta que le toca responder a alguien dentro de una formacion. */
export interface SurveyParaResponder {
  id: string;
  name: string;
  kind: SurveyKind;
  questions: SurveyQuestion[];
  /** Se responde UNA vez. Si ya esta, la pantalla lo dice en vez de dejar contestar otra vez. */
  answered: boolean;
}

export function getSurveyToAnswer(enrollmentId: string, templateId: string): Promise<SurveyParaResponder> {
  return apiFetch(`/me/enrollments/${enrollmentId}/surveys/${templateId}`, { method: 'GET' });
}

export function answerSurvey(
  enrollmentId: string,
  templateId: string,
  answers: Record<string, number | boolean | string>,
): Promise<{ ok: true; result: string | null }> {
  return apiFetch(`/me/enrollments/${enrollmentId}/surveys/${templateId}`, { method: 'POST', body: { answers } });
}

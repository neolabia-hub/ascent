import { API_URL, apiFetch, getAccessToken } from './api';

/*
  LOS TIPOS DE LA CONSTANCIA VIENEN DE `@neo-pulse/shared`, con `import type`.

  El resto del front declara sus propios tipos —`learner-api.ts`, `admin-api.ts`— y esa convencion
  nacio por una razon buena: importar del paquete compartido arrastraba zod al navegador, y zod es
  un validador que en el cliente no valida nada. Quien valida es el servidor.

  Pero `import type` NO existe en tiempo de ejecucion: TypeScript lo borra al compilar, asi que no
  entra ni un byte en el bundle. Lo que se gana es que la forma de la constancia —nueve campos con
  siete propiedades cada uno, mas las firmas— se declare UNA vez. Duplicarla a mano era pedir que
  algun dia el servidor renombrara `align` y el cliente siguiera compilando tan tranquilo hasta que
  a alguien le saliera el nombre descolocado en un PDF.

  REGLA: de este paquete solo se importan TIPOS. Un import de VALOR —un esquema de zod, una
  constante— si arrastraria la libreria entera al navegador.
*/
import type { CampoConstancia, CampoClave, CertificateFields, FirmanteConstancia } from '@neo-pulse/shared';

export type { CampoConstancia, CampoClave, CertificateFields, FirmanteConstancia };

/**
 * La colocacion de una plantilla nueva.
 *
 * Se repite aqui en vez de importarla porque es un VALOR y no un tipo: traerla de `shared` metería
 * zod en el navegador. Son nueve lineas, y el servidor tiene la suya —que es la que manda al
 * guardar—, asi que una discrepancia se corrige sola en el primer guardado.
 */
export const CAMPOS_POR_DEFECTO: CertificateFields = {
  nombre: { visible: true, x: 50, y: 44, size: 5, align: 'center', bold: true, color: '#101418' },
  documento: { visible: true, x: 50, y: 52, size: 2.4, align: 'center', bold: false, color: '#4b5563' },
  cargo: { visible: false, x: 50, y: 57, size: 2.2, align: 'center', bold: false, color: '#4b5563' },
  area: { visible: false, x: 50, y: 57, size: 2.2, align: 'center', bold: false, color: '#4b5563' },
  tipo: { visible: false, x: 50, y: 58, size: 2, align: 'center', bold: false, color: '#6b7280' },
  vence: { visible: false, x: 50, y: 78, size: 2.2, align: 'center', bold: false, color: '#4b5563' },
  formacion: { visible: true, x: 50, y: 62, size: 3.2, align: 'center', bold: true, color: '#101418' },
  horas: { visible: true, x: 50, y: 68, size: 2.2, align: 'center', bold: false, color: '#4b5563' },
  fecha: { visible: true, x: 50, y: 73, size: 2.2, align: 'center', bold: false, color: '#4b5563' },
  serial: { visible: true, x: 6, y: 94, size: 1.8, align: 'left', bold: false, color: '#6b7280' },
  codigo: { visible: false, x: 6, y: 97, size: 1.6, align: 'left', bold: false, color: '#6b7280' },
  nota: { visible: false, x: 94, y: 94, size: 1.8, align: 'right', bold: false, color: '#6b7280' },
  qr: { visible: true, x: 92, y: 90, size: 10, align: 'center', bold: false, color: '#101418' },
  modulos: { visible: false, x: 50, y: 84, size: 1.8, align: 'center', bold: false, color: '#4b5563' },
};

export interface CertificateRow {
  id: string;
  serialNumber: string;
  verificationCode: string;
  issuedAt: string;
  validUntil: string | null;
  revoked: boolean;
  activityName: string;
  hours: number | null;
  /** "Programa" cuando es la constancia de un programa completo; si no, el tipo de la formacion. */
  typeName: string | null;
}

export interface TemplateRow {
  id: string;
  name: string;
  backgroundKey: string | null;
  landscape: boolean;
  active: boolean;
  versionNumber: number;
  updatedAt: string;
}

export interface TemplateDetail extends TemplateRow {
  fields: CertificateFields;
  signers: FirmanteConstancia[];
}

export interface TemplatePayload {
  name: string;
  backgroundKey: string | null;
  landscape: boolean;
  fields: CertificateFields;
  signers: FirmanteConstancia[];
  active: boolean;
}

/**
 * LAS CONSTANCIAS DE OTRA PERSONA, para quien lleva el expediente formativo de la empresa.
 *
 * Existe porque la peticion real la hace la EMPRESA, no el aprendiz: "mandame el certificado de
 * alturas de Juan" llega un viernes, y Juan puede estar en carretera o haberse ido. El servidor lo
 * protege con `certificates:issue`, que es el permiso de quien administra el expediente.
 */
export function getCertificatesOf(userId: string): Promise<CertificateRow[]> {
  return apiFetch(`/certificates?userId=${userId}`, { method: 'GET' });
}

/** Revocar exige motivo y NO borra: la fila se conserva, marcada. Es evidencia. */
export function revokeCertificate(id: string, reason: string): Promise<{ ok: true }> {
  return apiFetch(`/certificates/${id}/revoke`, { method: 'POST', body: { reason } });
}

export function getMyCertificates(): Promise<CertificateRow[]> {
  return apiFetch('/me/certificados', { method: 'GET' });
}

export function listTemplates(): Promise<TemplateRow[]> {
  return apiFetch('/certificate-templates', { method: 'GET' });
}

export function getTemplate(id: string): Promise<TemplateDetail> {
  return apiFetch(`/certificate-templates/${id}`, { method: 'GET' });
}

export function createTemplate(body: TemplatePayload): Promise<TemplateDetail> {
  return apiFetch('/certificate-templates', { method: 'POST', body });
}

export function saveTemplate(id: string, body: TemplatePayload): Promise<TemplateDetail> {
  return apiFetch(`/certificate-templates/${id}`, { method: 'PUT', body });
}

export function deleteTemplate(id: string): Promise<{ ok: true }> {
  return apiFetch(`/certificate-templates/${id}`, { method: 'DELETE' });
}

/**
 * DESCARGA UN PDF que exige cabecera de autorizacion.
 *
 * No sirve un `<a href>` normal: el token vive en MEMORIA —nunca en `localStorage`, para que no lo
 * lea un script inyectado— asi que el navegador no lo adjunta solo al navegar. Se pide con `fetch`
 * llevando la cabecera, se convierte en un objeto local y se dispara la descarga desde ahi.
 *
 * El `revokeObjectURL` va con retraso: revocarlo de inmediato cancela la descarga en algunos
 * navegadores antes de que empiece a escribirse el fichero.
 */
export async function descargarPdf(ruta: string, nombreSugerido: string): Promise<void> {
  return descargarArchivo(ruta, nombreSugerido, 'No se pudo generar el PDF');
}

/** Lo mismo para cualquier archivo con cabecera: el xlsx del seguimiento pasa por aqui. */
export async function descargarArchivo(
  ruta: string,
  nombreSugerido: string,
  mensajeDeError = 'No se pudo descargar el archivo',
): Promise<void> {
  const respuesta = await fetch(`${API_URL}/v1${ruta}`, {
    credentials: 'include',
    headers: { Authorization: `Bearer ${getAccessToken() ?? ''}` },
  });
  if (!respuesta.ok) throw new Error(mensajeDeError);

  const blob = await respuesta.blob();
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombreSugerido;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Abre la vista previa de una PLANTILLA. Misma razon que arriba: hace falta la cabecera. */
export async function abrirVistaPrevia(templateId: string): Promise<void> {
  return abrirPdfEnPestana(`/certificate-templates/${templateId}/preview`, 'No se pudo generar la vista previa');
}

/**
 * ABRE UN PDF EN OTRA PESTAÑA, con la cabecera de autorizacion puesta.
 *
 * Es la excepcion razonable a la regla de "nada de ventanas nuevas": el visor de PDF del navegador
 * ya hace esto mejor que cualquier cosa que dibujemos, y un papel se MIRA antes de decidir si se
 * baja. Igual que `descargarPdf`, no sirve un `<a href>`: el token vive en MEMORIA —nunca en
 * `localStorage`— y el navegador no lo adjunta al navegar, asi que se pide con `fetch` llevando la
 * cabecera y se abre el objeto local.
 *
 * El `revokeObjectURL` va con un minuto de retraso: revocarlo antes deja la pestaña en blanco.
 */
export async function abrirPdfEnPestana(ruta: string, mensajeDeError = 'No se pudo abrir el PDF'): Promise<void> {
  const respuesta = await fetch(`${API_URL}/v1${ruta}`, {
    credentials: 'include',
    headers: { Authorization: `Bearer ${getAccessToken() ?? ''}` },
  });
  if (!respuesta.ok) throw new Error(mensajeDeError);
  const url = URL.createObjectURL(await respuesta.blob());
  window.open(url, '_blank', 'noopener');
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Lo que ve quien comprueba un papel, sin sesion. */
export interface VerificacionPublica {
  valido: boolean;
  estado: 'VIGENTE' | 'VENCIDA' | 'REVOCADA';
  serialNumber: string;
  issuedAt: string;
  validUntil: string | null;
  revokedReason: string | null;
  persona: { fullName: string; documentNumber: string };
  formacion: { name: string; hours: number | null };
  empresa: { displayName: string };
  resultado: { completedAt: string };
}

/**
 * Verifica una constancia SIN sesion. Por eso no usa `apiFetch`: ese adjunta el token y reintenta
 * renovandolo, y aqui no hay ninguno que renovar — quien comprueba es alguien de otra empresa.
 */
export async function verificarConstancia(codigo: string): Promise<VerificacionPublica | null> {
  const respuesta = await fetch(`${API_URL}/v1/public/constancias/${encodeURIComponent(codigo)}`);
  if (!respuesta.ok) return null;
  return (await respuesta.json()) as VerificacionPublica;
}

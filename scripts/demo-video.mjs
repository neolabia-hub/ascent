/**
 * Crea DOS formaciones con video para poder verlas desde el lado del aprendiz:
 *   - una con video ENLAZADO (YouTube),
 *   - otra con video SUBIDO (archivo local -> almacenamiento del tenant).
 *
 * Va por la API, no por Prisma, a proposito: recorre exactamente los mismos endpoints que usa la
 * interfaz (crear actividad, subir medio, agregar contenido, publicar, convocar, asignar). Si
 * algo esta roto para el administrador, aqui se rompe igual, y eso es justo lo que se quiere
 * comprobar.
 *
 * Uso: node scripts/demo-video.mjs "<ruta del mp4>"
 */
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

const API = process.env.API_URL ?? 'http://localhost:3002/v1';
const TENANT = 'transprensa';
const ADMIN = { identifier: '888888888', password: 'PruebaE2E2026*' };
const YOUTUBE_URL = 'https://www.youtube.com/watch?v=o3CodExRlbo';

const localVideo = process.argv[2];

let token = '';

async function api(path, { method = 'GET', body } = {}) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(`${method} ${path} -> ${response.status} ${JSON.stringify(data)}`);
  }
  return data;
}

/** Sube un archivo por el mismo endpoint que usa el selector de contenido. */
async function upload(path) {
  const bytes = readFileSync(path);
  const form = new FormData();
  form.append('file', new Blob([bytes], { type: 'video/mp4' }), basename(path));
  const response = await fetch(`${API}/media/upload?kind=video`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`upload -> ${response.status} ${JSON.stringify(data)}`);
  return data;
}

/**
 * Idempotente PASO A PASO, no "todo o nada".
 *
 * La primera version se saltaba la formacion entera si la actividad ya existia, y por eso un
 * fallo a mitad dejaba formaciones sin publicar y sin asignar: existian, pero no le aparecian a
 * nadie. Ahora cada paso comprueba lo suyo y completa lo que falte.
 */
async function buildActivity({ code, name, description, typeCode, content }) {
  const found = (await api(`/activities?q=${encodeURIComponent(code)}&pageSize=50`)).items.find(
    (row) => row.code === code,
  );

  let activityId = found?.id ?? null;
  if (!activityId) {
    const [types, processes] = await Promise.all([api('/catalogs/activity-types'), api('/catalogs/processes')]);
    const type = types.find((row) => row.code === typeCode);
    const process = processes.find((row) => row.code === 'SST') ?? processes[0];
    const created = await api('/activities', {
      method: 'POST',
      body: { code, name, description, activityTypeId: type.id, processId: process.id, modality: 'VIRTUAL' },
    });
    activityId = created.id;
    const draft = created.versions.find((row) => row.status === 'DRAFT') ?? created.versions[0];
    await api(`/activities/versions/${draft.id}/contents`, { method: 'POST', body: content });
    console.log(`  ${code}: actividad creada con su contenido`);
  }

  // 1. Publicar si sigue en borrador.
  let detail = await api(`/activities/${activityId}`);
  let published = detail.versions.find((row) => row.status === 'PUBLISHED');
  if (!published) {
    const draft = detail.versions.find((row) => row.status === 'DRAFT');
    if (draft) {
      const full = await api(`/activities/versions/${draft.id}`);
      if (full.contents.length === 0) {
        await api(`/activities/versions/${draft.id}/contents`, { method: 'POST', body: content });
      }
      await api(`/activities/versions/${draft.id}/publish`, {
        method: 'POST',
        body: { migrationPolicy: 'MOVE_NOT_STARTED', confirm: true },
      });
      console.log(`  ${code}: version publicada`);
      detail = await api(`/activities/${activityId}`);
      published = detail.versions.find((row) => row.status === 'PUBLISHED');
    }
  }

  // 2. Convocatoria permanente: es lo que permite empezarla por cuenta propia.
  const offerings = (await api(`/offerings?activityId=${activityId}`)).items;
  if (offerings.length === 0 && published) {
    const offering = await api('/offerings', {
      method: 'POST',
      body: { activityVersionId: published.id, kind: 'PERMANENT', modality: 'VIRTUAL', executedBy: 'PROPIOS' },
    });
    await api(`/offerings/${offering.id}/publish`, { method: 'POST', body: { confirm: true } });
    console.log(`  ${code}: convocatoria permanente publicada`);
  }

  // 3. Obligacion para todas las personas activas, para que salga en los pendientes de cualquiera.
  const assignments = await api(`/assignments?targetId=${activityId}`);
  if (assignments.total === 0) {
    const users = await api('/users?active=true&pageSize=100');
    const result = await api('/assignments', {
      method: 'POST',
      body: {
        targetType: 'ACTIVITY',
        targetId: activityId,
        userIds: users.items.map((row) => row.id),
        dueAt: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      },
    });
    console.log(`  ${code}: asignada a ${result.created} personas`);
  }

  console.log(`  ${code}: LISTA`);
  return activityId;
}

async function main() {
  const session = await api('/auth/login', {
    method: 'POST',
    body: { tenantSlug: TENANT, identifier: ADMIN.identifier, password: ADMIN.password },
  });
  token = session.accessToken;
  console.log('Sesion iniciada como administrador.');

  await buildActivity({
    code: 'DEMO_VIDEO_ENLACE',
    name: 'Seguridad vial: lo que no se ve',
    description: 'Video enlazado desde YouTube. Sirve para ver como se reproduce contenido que vive fuera.',
    typeCode: 'MICROLEARNING',
    content: {
      type: 'VIDEO',
      title: 'El video',
      isRequired: true,
      config: { externalUrl: YOUTUBE_URL, minWatchPct: 80 },
    },
  });

  if (!localVideo) {
    console.log('  (sin ruta de archivo: se omite la formacion con video subido)');
    return;
  }

  // El archivo solo se sube si la formacion todavia no existe: repetir la subida en cada corrida
  // dejaria copias huerfanas ocupando almacenamiento sin que nada las referencie.
  const already = (await api('/activities?q=DEMO_VIDEO_SUBIDO&pageSize=50')).items.find(
    (row) => row.code === 'DEMO_VIDEO_SUBIDO',
  );

  let packageId = null;
  if (!already) {
    const uploaded = await upload(localVideo);
    packageId = uploaded.id;
    console.log(`  archivo subido: ${uploaded.originalName} (${Math.round(uploaded.sizeBytes / 1024)} KB)`);
  }

  await buildActivity({
    code: 'DEMO_VIDEO_SUBIDO',
    name: 'Taller practico grabado',
    description: 'Video subido al almacenamiento de la empresa. Registra el porcentaje realmente visto.',
    typeCode: 'MICROLEARNING',
    content: {
      type: 'VIDEO',
      title: 'La grabacion del taller',
      isRequired: true,
      contentPackageId: packageId,
      config: { minWatchPct: 80 },
    },
  });
}

main().catch((error) => {
  console.error('FALLO:', error.message);
  process.exitCode = 1;
});

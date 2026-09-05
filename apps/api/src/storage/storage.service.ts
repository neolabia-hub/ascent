import { createReadStream, type ReadStream } from 'node:fs';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { Injectable, Logger } from '@nestjs/common';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl as presignS3Url } from '@aws-sdk/s3-request-presigner';

/**
 * Almacenamiento de medios con patron ADAPTER: el negocio nunca conoce el proveedor.
 * Desarrollo escribe en disco; produccion usara Cloudflare R2 (S3-compatible, sin egress).
 */
export interface StorageAdapter {
  put(key: string, body: Buffer, mimeType: string): Promise<void>;
  read(key: string): Promise<Buffer>;
  /** Tamano en bytes, o null si no existe. Necesario para responder rangos. */
  size(key: string): Promise<number | null>;
  /** Lectura por TROZOS. Un video no se puede servir de una sola pieza (ver media.controller). */
  stream(key: string, range?: { start: number; end: number }): ReadStream;
  getSignedUrl(key: string, expiresInSeconds: number): Promise<string>;
  delete(key: string): Promise<void>;
  readonly isLocal: boolean;
}

/** Desarrollo: archivos en disco, servidos por el controlador de medios. */
export class LocalStorageAdapter implements StorageAdapter {
  readonly isLocal = true;
  private readonly root: string;

  constructor(root: string) {
    this.root = resolve(root);
  }

  private pathFor(key: string): string {
    // El key se construye siempre en el servidor (buildKey), pero se normaliza igual para
    // que ninguna ruta pueda escapar del directorio raiz.
    const safe = key.replace(/\.\./g, '').replace(/^[/\\]+/, '');
    return join(this.root, safe);
  }

  async put(key: string, body: Buffer): Promise<void> {
    const path = this.pathFor(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, body);
  }

  read(key: string): Promise<Buffer> {
    return readFile(this.pathFor(key));
  }

  async size(key: string): Promise<number | null> {
    return stat(this.pathFor(key))
      .then((info) => info.size)
      .catch(() => null);
  }

  stream(key: string, range?: { start: number; end: number }): ReadStream {
    return createReadStream(this.pathFor(key), range);
  }

  async getSignedUrl(key: string): Promise<string> {
    // En local no hay firma: el acceso lo protege el guard de sesion del endpoint.
    return `/v1/media/file/${encodeURIComponent(key)}`;
  }

  async delete(key: string): Promise<void> {
    await unlink(this.pathFor(key)).catch(() => undefined);
  }
}

/**
 * PRODUCCION: CLOUDFLARE R2 (S3-compatible, egress cero).
 *
 * ─── LOS BYTES NO PASAN POR LA API ───
 *
 * Es la decision que hace que este adaptador valga la pena. En local, `/v1/media/file/:key` lee del
 * disco y empuja el archivo por la respuesta; hacer lo mismo contra R2 significaria que cada video
 * viaja DOS veces —de R2 al servidor y del servidor al telefono— y que el ancho de banda de la
 * maquina es el techo de cuanta gente puede ver una formacion a la vez. Justo lo que se eligio R2
 * para evitar.
 *
 * Asi que con R2 el controlador **redirige** a una URL prefirmada y el navegador descarga directo
 * del bucket. La firma propia (`signPath`) sigue mandando: es la que se comprueba ANTES de emitir
 * la de R2, asi que quien no tenga sesion valida nunca llega a ver una URL del bucket.
 *
 * Por eso `stream()` no esta implementado y falla con un mensaje explicito en vez de existir sin
 * usarse: si algun dia hiciera falta servir por trozos desde aqui, hay que decidirlo a proposito.
 *
 * ─── POR QUE `auto` Y `forcePathStyle` ───
 *
 * R2 no tiene regiones al estilo de AWS: espera `auto`. Y sirve por RUTA
 * (`<endpoint>/<bucket>/<clave>`) y no por subdominio de bucket; sin `forcePathStyle` el SDK
 * fabrica un host que en R2 no resuelve, y el error que sale —un DNS que falla— no se parece en
 * nada a la causa.
 */
export class R2StorageAdapter implements StorageAdapter {
  readonly isLocal = false;
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config: {
    accountId: string;
    accessKeyId: string;
    secretAccessKey: string;
    bucket: string;
  }) {
    this.bucket = config.bucket;
    this.client = new S3Client({
      region: 'auto',
      endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
      forcePathStyle: true,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  async put(key: string, body: Buffer, mimeType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        // El tipo se guarda EN EL OBJETO: cuando el navegador descarga directo del bucket, esta
        // cabecera es la unica que hay. Sin ella, un mp4 llega como binario y no se reproduce.
        ContentType: mimeType,
      }),
    );
  }

  async read(key: string): Promise<Buffer> {
    const salida = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    if (!salida.Body) throw new Error(`R2: objeto sin contenido (${key})`);
    // `transformToByteArray` viene del SDK v3 y evita montar el troceado a mano. Solo se usa para
    // lo que de verdad se procesa en el servidor —convertir una presentacion, leer un arte de
    // fondo—, nunca para servir un video.
    return Buffer.from(await salida.Body.transformToByteArray());
  }

  async size(key: string): Promise<number | null> {
    try {
      const salida = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return salida.ContentLength ?? null;
    } catch {
      // Un objeto que no esta y un error de red se ven igual desde aqui, y los dos significan lo
      // mismo para quien pregunta: no se puede servir. El detalle queda en el log del SDK.
      return null;
    }
  }

  stream(): ReadStream {
    throw new Error(
      'Con R2 los bytes no pasan por la API: el controlador redirige a la URL prefirmada. ' +
        'Si hace falta servir por trozos desde el servidor, es una decision a tomar, no un hueco que rellenar.',
    );
  }

  getSignedUrl(key: string, expiresInSeconds: number): Promise<string> {
    return presignS3Url(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), {
      expiresIn: expiresInSeconds,
    });
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly adapter: StorageAdapter;
  /**
   * Secreto de las firmas de medios. Reusa el pepper de refresco si no hay uno propio: en
   * desarrollo evita un paso de configuracion, y en produccion ambos son secretos del servidor.
   */
  private readonly mediaSecret =
    process.env.MEDIA_URL_SECRET ?? process.env.REFRESH_TOKEN_PEPPER ?? 'neo-pulse-dev-media-secret';

  constructor() {
    // El nombre de la variable viaja con el valor: el mensaje de error tiene que poder decir
    // R2_BUCKET_NAME, que es lo que se busca en el .env, y no "bucket".
    const r2 = {
      accountId: { env: 'R2_ACCOUNT_ID', valor: process.env.R2_ACCOUNT_ID ?? '' },
      accessKeyId: { env: 'R2_ACCESS_KEY_ID', valor: process.env.R2_ACCESS_KEY_ID ?? '' },
      secretAccessKey: { env: 'R2_SECRET_ACCESS_KEY', valor: process.env.R2_SECRET_ACCESS_KEY ?? '' },
      bucket: { env: 'R2_BUCKET_NAME', valor: process.env.R2_BUCKET_NAME ?? '' },
    };
    /*
      QUIEN DECIDE SI SE QUIERE R2 SON LAS CREDENCIALES, NO EL NOMBRE DEL BUCKET.

      Primera version de esto: "o estan las cuatro variables o ninguna". Sonaba prudente y tumbo el
      arranque en desarrollo, donde `R2_BUCKET_NAME` llevaba meses puesto —heredado de la plantilla—
      sin credenciales al lado. Un nombre de bucket no es una intencion de usar R2: es un dato
      inofensivo. Las CREDENCIALES si.

      Asi que: si hay alguna credencial, se quiere R2 y entonces se exigen las cuatro y se dice cual
      falta —con tres de cuatro, el fallo llegaria en la primera subida, en produccion y con alguien
      esperando delante—. Si no hay ninguna, disco local, y se avisa del bucket huerfano en vez de
      morir por el.
    */
    const credenciales = [r2.accountId, r2.accessKeyId, r2.secretAccessKey];
    const seQuiereR2 = credenciales.some((campo) => campo.valor !== '');
    const faltan = Object.values(r2).filter((campo) => campo.valor === '');

    if (seQuiereR2 && faltan.length > 0) {
      throw new Error(`Configuracion de R2 incompleta: falta ${faltan.map((c) => c.env).join(', ')}`);
    }

    if (faltan.length === 0) {
      this.adapter = new R2StorageAdapter({
        accountId: r2.accountId.valor,
        accessKeyId: r2.accessKeyId.valor,
        secretAccessKey: r2.secretAccessKey.valor,
        bucket: r2.bucket.valor,
      });
      this.logger.log(`Almacenamiento: Cloudflare R2 (bucket ${r2.bucket.valor})`);
    } else {
      const root = process.env.LOCAL_STORAGE_DIR ?? './storage-dev';
      this.adapter = new LocalStorageAdapter(root);
      this.logger.log(`Almacenamiento: disco local (${resolve(root)})`);
      if (r2.bucket.valor !== '') {
        this.logger.warn(
          `R2_BUCKET_NAME esta puesto ("${r2.bucket.valor}") pero no hay credenciales: se ignora y se usa disco local.`,
        );
      }
    }
  }

  get isLocal(): boolean {
    return this.adapter.isLocal;
  }

  put(key: string, body: Buffer, mimeType: string): Promise<void> {
    return this.adapter.put(key, body, mimeType);
  }

  read(key: string): Promise<Buffer> {
    return this.adapter.read(key);
  }

  size(key: string): Promise<number | null> {
    return this.adapter.size(key);
  }

  stream(key: string, range?: { start: number; end: number }): ReadStream {
    return this.adapter.stream(key, range);
  }

  getSignedUrl(key: string, expiresInSeconds = 3600): Promise<string> {
    return this.adapter.getSignedUrl(key, expiresInSeconds);
  }

  /**
   * FIRMA DE ACCESO A UN ARCHIVO.
   *
   * Existe porque una etiqueta `<img>`, `<video>` o un `<iframe>` no puede mandar la cabecera de
   * autorizacion. La alternativa —abrir el endpoint— dejaria los archivos de una empresa al
   * alcance de cualquiera que adivinara una clave.
   *
   * La firma ata TRES cosas: la clave exacta, el momento de caducidad y el secreto del servidor.
   * Cambiar cualquiera de las dos primeras invalida la tercera, asi que no se puede reutilizar
   * una firma para otro archivo ni estirarle la vida.
   */
  signPath(key: string, expiresInSeconds = 3600): string {
    const expiresAt = Date.now() + expiresInSeconds * 1000;
    const signature = this.sign(key, String(expiresAt));
    return `/v1/media/file/${encodeURIComponent(key)}?e=${expiresAt}&t=${signature}`;
  }

  verifySignature(key: string, expiresAt: string | undefined, signature: string | undefined): boolean {
    if (!expiresAt || !signature) return false;
    const expiry = Number(expiresAt);
    if (!Number.isFinite(expiry) || expiry < Date.now()) return false;

    const expected = this.sign(key, expiresAt);
    // Comparacion de tiempo constante: una comparacion normal filtra el secreto byte a byte.
    const a = Buffer.from(expected);
    const b = Buffer.from(signature);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  private sign(key: string, expiresAt: string): string {
    return createHmac('sha256', this.mediaSecret).update(`${key}:${expiresAt}`).digest('hex');
  }

  delete(key: string): Promise<void> {
    return this.adapter.delete(key);
  }

  /** Clave estable y unica, siempre bajo el prefijo del tenant (aislamiento tambien en storage). */
  buildKey(tenantId: string, kind: string, originalName: string): string {
    const safeName = originalName
      .toLowerCase()
      .replace(/[^a-z0-9._-]/g, '-')
      .replace(/-+/g, '-')
      .slice(-80);
    const safeKind = kind.replace(/[^a-z0-9-]/gi, '').toLowerCase() || 'media';
    return `${tenantId}/${safeKind}/${randomUUID()}-${safeName}`;
  }
}

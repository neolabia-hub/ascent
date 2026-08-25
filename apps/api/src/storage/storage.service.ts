import { randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { Injectable, Logger } from '@nestjs/common';

/**
 * Almacenamiento de medios con patron ADAPTER: el negocio nunca conoce el proveedor.
 * Desarrollo escribe en disco; produccion usara Cloudflare R2 (S3-compatible, sin egress).
 */
export interface StorageAdapter {
  put(key: string, body: Buffer, mimeType: string): Promise<void>;
  read(key: string): Promise<Buffer>;
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

  async getSignedUrl(key: string): Promise<string> {
    // En local no hay firma: el acceso lo protege el guard de sesion del endpoint.
    return `/v1/media/file/${encodeURIComponent(key)}`;
  }

  async delete(key: string): Promise<void> {
    await unlink(this.pathFor(key)).catch(() => undefined);
  }
}

/**
 * Produccion: Cloudflare R2. Pendiente de cablear al desplegar; se implementa con
 * @aws-sdk/client-s3 (PutObjectCommand/GetObjectCommand/DeleteObjectCommand) y
 * @aws-sdk/s3-request-presigner (getSignedUrl, expiracion 1 hora). Se deja explicito para que
 * el fallo sea evidente si alguien despliega sin completar este paso.
 */
export class R2StorageAdapter implements StorageAdapter {
  readonly isLocal = false;

  private notImplemented(): never {
    throw new Error('Adaptador R2 pendiente: se cablea al desplegar (ver docs/RUNBOOK.md).');
  }

  put(): Promise<void> {
    this.notImplemented();
  }
  read(): Promise<Buffer> {
    this.notImplemented();
  }
  getSignedUrl(): Promise<string> {
    this.notImplemented();
  }
  delete(): Promise<void> {
    this.notImplemented();
  }
}

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly adapter: StorageAdapter;

  constructor() {
    if (process.env.R2_BUCKET_NAME && process.env.R2_ACCESS_KEY_ID) {
      this.adapter = new R2StorageAdapter();
      this.logger.log('Almacenamiento: Cloudflare R2');
    } else {
      const root = process.env.LOCAL_STORAGE_DIR ?? './storage-dev';
      this.adapter = new LocalStorageAdapter(root);
      this.logger.log(`Almacenamiento: disco local (${resolve(root)})`);
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

  getSignedUrl(key: string, expiresInSeconds = 3600): Promise<string> {
    return this.adapter.getSignedUrl(key, expiresInSeconds);
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

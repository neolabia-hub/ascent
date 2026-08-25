/**
 * Deteccion de tipo por FIRMA BINARIA (magic bytes), no por extension ni por el mimetype que
 * envia el cliente: ambos son texto que cualquiera puede falsificar. Requisito de seguridad del
 * proyecto (CLAUDE.md seccion 11).
 */

export interface DetectedType {
  mimeType: string;
  /** Categoria con la que se clasifica el paquete de contenido. */
  family: 'IMAGE' | 'VIDEO' | 'DOCUMENT' | 'ARCHIVE';
}

function startsWith(buffer: Buffer, bytes: number[], offset = 0): boolean {
  if (buffer.length < offset + bytes.length) return false;
  return bytes.every((byte, index) => buffer[offset + index] === byte);
}

export function detectType(buffer: Buffer): DetectedType | null {
  if (startsWith(buffer, [0xff, 0xd8, 0xff])) return { mimeType: 'image/jpeg', family: 'IMAGE' };
  if (startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return { mimeType: 'image/png', family: 'IMAGE' };
  }
  if (startsWith(buffer, [0x47, 0x49, 0x46, 0x38])) return { mimeType: 'image/gif', family: 'IMAGE' };
  // WEBP: "RIFF" .... "WEBP"
  if (startsWith(buffer, [0x52, 0x49, 0x46, 0x46]) && startsWith(buffer, [0x57, 0x45, 0x42, 0x50], 8)) {
    return { mimeType: 'image/webp', family: 'IMAGE' };
  }
  if (startsWith(buffer, [0x25, 0x50, 0x44, 0x46])) return { mimeType: 'application/pdf', family: 'DOCUMENT' };
  // MP4 y derivados: caja "ftyp" en el offset 4.
  if (startsWith(buffer, [0x66, 0x74, 0x79, 0x70], 4)) return { mimeType: 'video/mp4', family: 'VIDEO' };
  // ZIP y todo lo que se empaqueta como ZIP: xlsx, docx, pptx y paquetes SCORM.
  if (startsWith(buffer, [0x50, 0x4b, 0x03, 0x04]) || startsWith(buffer, [0x50, 0x4b, 0x05, 0x06])) {
    return { mimeType: 'application/zip', family: 'ARCHIVE' };
  }
  return null;
}

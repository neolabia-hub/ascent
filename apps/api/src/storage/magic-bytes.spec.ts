import { detectType } from './magic-bytes.js';

/** Construye un buffer con la firma en el offset indicado y relleno alrededor. */
function withSignature(bytes: number[], offset = 0, size = 64): Buffer {
  const buffer = Buffer.alloc(size, 0);
  bytes.forEach((byte, index) => {
    buffer[offset + index] = byte;
  });
  return buffer;
}

describe('detectType (validacion por firma binaria)', () => {
  it('reconoce JPEG, PNG, GIF y WEBP como imagenes', () => {
    expect(detectType(withSignature([0xff, 0xd8, 0xff]))).toEqual({ mimeType: 'image/jpeg', family: 'IMAGE' });
    expect(detectType(withSignature([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toEqual({
      mimeType: 'image/png',
      family: 'IMAGE',
    });
    expect(detectType(withSignature([0x47, 0x49, 0x46, 0x38]))).toEqual({ mimeType: 'image/gif', family: 'IMAGE' });

    const webp = withSignature([0x52, 0x49, 0x46, 0x46]);
    [0x57, 0x45, 0x42, 0x50].forEach((byte, index) => {
      webp[8 + index] = byte;
    });
    expect(detectType(webp)).toEqual({ mimeType: 'image/webp', family: 'IMAGE' });
  });

  it('reconoce PDF y MP4', () => {
    expect(detectType(withSignature([0x25, 0x50, 0x44, 0x46]))).toEqual({ mimeType: 'application/pdf', family: 'DOCUMENT' });
    expect(detectType(withSignature([0x66, 0x74, 0x79, 0x70], 4))).toEqual({ mimeType: 'video/mp4', family: 'VIDEO' });
  });

  it('reconoce ZIP y sus derivados (xlsx, docx, paquetes SCORM)', () => {
    expect(detectType(withSignature([0x50, 0x4b, 0x03, 0x04]))).toEqual({ mimeType: 'application/zip', family: 'ARCHIVE' });
    expect(detectType(withSignature([0x50, 0x4b, 0x05, 0x06]))).toEqual({ mimeType: 'application/zip', family: 'ARCHIVE' });
  });

  it('RECHAZA un ejecutable disfrazado de imagen', () => {
    // MZ: cabecera de ejecutable de Windows. Aunque el cliente diga "image/png", no pasa.
    expect(detectType(withSignature([0x4d, 0x5a, 0x90, 0x00]))).toBeNull();
  });

  it('RECHAZA texto plano y scripts', () => {
    expect(detectType(Buffer.from('<?php system($_GET["c"]); ?>', 'utf8'))).toBeNull();
    expect(detectType(Buffer.from('#!/bin/sh\nrm -rf /', 'utf8'))).toBeNull();
  });

  it('RECHAZA un buffer vacio o demasiado corto', () => {
    expect(detectType(Buffer.alloc(0))).toBeNull();
    expect(detectType(Buffer.from([0xff]))).toBeNull();
  });
});

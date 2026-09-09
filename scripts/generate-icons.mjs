/**
 * Genera los iconos de la PWA (apps/web/public/icons).
 *
 * Se dibujan por codigo y no se guardan como binarios opacos en el repo por dos razones: se
 * pueden regenerar en cualquier tamaño que pida una plataforma nueva, y la revision de un cambio
 * de icono es un diff legible en vez de "cambio un PNG".
 *
 * El icono es de la PLATAFORMA (NEO PULSE), no del tenant: es lo que queda en la pantalla de
 * inicio del telefono, donde no hay contexto de empresa. Por eso usa los neutros de la
 * plataforma y no --brand-primary.
 *
 * Uso: node scripts/generate-icons.mjs
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'apps', 'web', 'public', 'icons');

const INK_900 = [0x10, 0x14, 0x18];
const ACCENT = [0xe8, 0x73, 0x4a];
const WHITE = [0xff, 0xff, 0xff];

/** El "pulso" de la marca: una linea de electrocardiograma en coordenadas 0..1. */
const PULSE = [
  [0.08, 0.5],
  [0.3, 0.5],
  [0.38, 0.26],
  [0.5, 0.74],
  [0.6, 0.42],
  [0.68, 0.5],
  [0.92, 0.5],
];

function createCanvas(size, background) {
  const pixels = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i += 1) {
    pixels[i * 4] = background[0];
    pixels[i * 4 + 1] = background[1];
    pixels[i * 4 + 2] = background[2];
    pixels[i * 4 + 3] = 255;
  }
  return pixels;
}

function paint(pixels, size, x, y, color, alpha) {
  if (x < 0 || y < 0 || x >= size || y >= size || alpha <= 0) return;
  const index = (Math.round(y) * size + Math.round(x)) * 4;
  const a = Math.min(1, alpha);
  for (let channel = 0; channel < 3; channel += 1) {
    pixels[index + channel] = Math.round(pixels[index + channel] * (1 - a) + color[channel] * a);
  }
}

/** Linea gruesa con bordes suavizados: sin antialias el trazo se ve escalonado a 192px. */
function drawLine(pixels, size, from, to, color, thickness) {
  const half = thickness / 2;
  const minX = Math.floor(Math.min(from[0], to[0]) - half - 1);
  const maxX = Math.ceil(Math.max(from[0], to[0]) + half + 1);
  const minY = Math.floor(Math.min(from[1], to[1]) - half - 1);
  const maxY = Math.ceil(Math.max(from[1], to[1]) + half + 1);
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const lengthSquared = dx * dx + dy * dy;

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((x - from[0]) * dx + (y - from[1]) * dy) / lengthSquared));
      const distance = Math.hypot(x - (from[0] + t * dx), y - (from[1] + t * dy));
      paint(pixels, size, x, y, color, half - distance + 0.5);
    }
  }
}

/** Esquinas redondeadas: el icono no maskable se recorta solo en algunas plataformas. */
function roundCorners(pixels, size, radius) {
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const cx = x < radius ? radius : x > size - radius ? size - radius : x;
      const cy = y < radius ? radius : y > size - radius ? size - radius : y;
      const distance = Math.hypot(x - cx, y - cy);
      if (distance > radius) {
        pixels[(y * size + x) * 4 + 3] = 0;
      }
    }
  }
}

function encodePng(pixels, size) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * (size * 4 + 1)] = 0; // filtro "none"
    Buffer.from(pixels.buffer, y * size * 4, size * 4).copy(raw, y * (size * 4 + 1) + 1);
  }

  const chunk = (type, data) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bits por canal
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * `maskable` deja que Android recorte el icono a la forma que quiera su lanzador: el dibujo se
 * encoge al 60% central (la "zona segura" del estandar) para que ningun recorte lo mutile.
 */
function render(size, { maskable = false, background = INK_900, ink = ACCENT } = {}) {
  const pixels = createCanvas(size, background);
  const scale = maskable ? 0.6 : 0.84;
  const offset = (1 - scale) / 2;
  const points = PULSE.map(([x, y]) => [(offset + x * scale) * size, (offset + y * scale) * size]);

  const thickness = Math.max(3, size * (maskable ? 0.075 : 0.09));
  for (let i = 0; i < points.length - 1; i += 1) {
    drawLine(pixels, size, points[i], points[i + 1], ink, thickness);
  }
  // El punto del latido, en la cresta: es lo que hace que se lea como pulso y no como una zeta.
  drawLine(pixels, size, points[2], points[2], WHITE, thickness * 1.05);

  if (!maskable) roundCorners(pixels, size, size * 0.22);
  return encodePng(pixels, size);
}

mkdirSync(OUT_DIR, { recursive: true });
const files = [
  ['icon-192.png', render(192)],
  ['icon-512.png', render(512)],
  ['icon-maskable-512.png', render(512, { maskable: true })],
  ['apple-touch-icon.png', render(180, { maskable: true })],
];
for (const [name, data] of files) {
  writeFileSync(join(OUT_DIR, name), data);
  console.log(`${name} ${data.length} bytes`);
}

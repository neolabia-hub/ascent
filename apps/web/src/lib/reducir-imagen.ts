/**
 * REDUCIR UNA IMAGEN ANTES DE SUBIRLA (2026-09-30).
 *
 * El logo de produccion era un PNG de 5812 x 1388 y 6,1 MB: tardaba 12 segundos en bajar y se veia
 * pintarse por partes en cada pantalla. Para un logo que se enseña a 44 px, o una foto de perfil a 88,
 * con una fraccion basta y sobra.
 *
 * Se hace en el NAVEGADOR, con un canvas, y no en el servidor: no hay que instalar ninguna libreria de
 * imagen nativa en la imagen de Docker, y el archivo que viaja ya es el pequeño.
 *
 * - Solo se tocan PNG, JPEG y WebP. Un SVG ya es pequeño y se escala solo; un GIF animado se romperia.
 * - Solo si es MAS GRANDE que el maximo: una imagen pequeña se sube tal cual, sin perder nada.
 * - El PNG se conserva PNG (un logo suele tener transparencia); lo demas pasa a WebP de buena calidad.
 * - Si algo falla —un navegador viejo, una imagen corrupta— se sube la original: reducir es una mejora,
 *   no una condicion para poder subir.
 */
const MAXIMO_POR_TIPO: Record<string, number> = {
  logo: 800,
  avatar: 512,
  cover: 1600,
};

/**
 * CALIDAD: NINGUNA IMAGEN PIERDE CALIDAD VISIBLE (2026-10-01, pedido del cliente: «menos el logo, la
 * portada y el usuario»). La portada va en WebP SIN PERDIDA (1.0): identica pixel a pixel, solo mas
 * compacta que el PNG. La foto de usuario, en WebP a 0,95, que a la vista no se distingue. El logo
 * se queda en PNG, que ya es sin perdida.
 */
const CALIDAD: Record<string, number> = { cover: 1, avatar: 0.95, logo: 1 };

/**
 * LA PORTADA SIEMPRE EN WEBP, aunque llegue PNG y aunque ya sea pequeña (2026-10-01). Es una
 * ilustracion o una foto que se pinta en tarjetas: en WebP sin perdida pesa menos que el PNG con la
 * misma nitidez exacta, y conserva la transparencia. El logo si se queda en PNG: va en el membrete y en
 * documentos.
 */
const SIEMPRE_WEBP = new Set(['cover']);

export async function reducirImagen(file: File, kind: string): Promise<File> {
  const maximo = MAXIMO_POR_TIPO[kind];
  if (!maximo || !/^image\/(png|jpeg|webp)$/.test(file.type)) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const escala = Math.min(1, maximo / Math.max(bitmap.width, bitmap.height));
    if (escala === 1 && !SIEMPRE_WEBP.has(kind)) {
      bitmap.close();
      return file;
    }
    const ancho = Math.round(bitmap.width * escala);
    const alto = Math.round(bitmap.height * escala);
    const canvas = document.createElement('canvas');
    canvas.width = ancho;
    canvas.height = alto;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, ancho, alto);
    bitmap.close();
    const tipo = file.type === 'image/png' && !SIEMPRE_WEBP.has(kind) ? 'image/png' : 'image/webp';
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, tipo, CALIDAD[kind] ?? 0.95));
    if (!blob || blob.size >= file.size) return file;
    const extension = tipo === 'image/png' ? 'png' : 'webp';
    const nombre = file.name.replace(/\.[^.]+$/, '') + `.${extension}`;
    return new File([blob], nombre, { type: tipo });
  } catch {
    return file;
  }
}

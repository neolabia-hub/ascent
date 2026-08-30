/**
 * DONDE VIVE CADA DIAPOSITIVA, y como se decide si se puede servir.
 *
 * Las diapositivas no son paquetes propios: son derivadas del mismo archivo que subio alguien, y
 * cuelgan de la clave del original (`<clave>.slides/NNN.webp`). Eso hace que se vea de un vistazo
 * a que presentacion pertenece cada imagen y que borrar la carpeta se las lleve todas.
 *
 * El precio de esa comodidad es que la ruta de servir archivos deja de poder buscar la clave tal
 * cual en la base de datos, y hay que decidir a mano si una clave inventada bajo esa carpeta se
 * sirve o no. Esa decision es una FRONTERA DE SEGURIDAD, y por eso vive aqui, pura y probada, en
 * vez de suelta dentro del controlador.
 */

/** Separa la clave del original de la de cada diapositiva. */
export const SLIDES_SEGMENT = '.slides/';

/** Donde se guarda la diapositiva N de una presentacion. Se rellena a tres cifras para que el
 *  listado del almacenamiento salga en orden (`002` antes que `010`). */
export function slideKey(sourceKey: string, index: number): string {
  return `${sourceKey}${SLIDES_SEGMENT}${String(index).padStart(3, '0')}.webp`;
}

/**
 * De que presentacion es esta clave, o `null` si no es la de una diapositiva.
 *
 * Se corta por la PRIMERA aparicion del separador: si el nombre del original lo llevara dentro,
 * cortar por la ultima devolveria un padre que no existe y la imagen dejaria de verse.
 */
export function parentPresentationKey(storageKey: string): string | null {
  const separator = storageKey.indexOf(SLIDES_SEGMENT);
  if (separator <= 0) return null;
  return storageKey.slice(0, separator);
}

/**
 * Si esa imagen figura DE VERDAD en el manifiesto de la presentacion.
 *
 * No basta con que el padre exista: sin esta comprobacion, cualquier clave bajo la carpeta de una
 * presentacion valida se serviria, incluida una que apunte a otra cosa que alguien haya dejado
 * ahi. Se compara la clave completa, no el numero.
 */
export function manifestHasSlide(manifest: unknown, storageKey: string): boolean {
  const slides = (manifest as { slides?: unknown } | null)?.slides;
  if (!Array.isArray(slides)) return false;
  return slides.some((slide) => (slide as { key?: unknown } | null)?.key === storageKey);
}

/**
 * Nombre seguro para el archivo temporal que recibe LibreOffice.
 *
 * Lo recibe como ARGUMENTO de linea de comandos: un nombre con comillas, espacios o rutas
 * relativas es la via de entrada obvia. Se deja solo lo imprimible y sin separadores de ruta, y
 * se corta por el final para conservar la extension, que es lo que decide la conversion.
 */
export function safeTempName(originalName: string): string {
  const cleaned = originalName
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .slice(-80);
  return cleaned.length > 4 ? cleaned : `entrada-${cleaned}`;
}

'use client';

import { useState, type ReactNode } from 'react';
import { TablePagination } from './table';

/** Quince: lo que cabe sin que la accion que cierra la pantalla se salga de la vista. */
export const POR_PAGINA = 15;

/**
 * PAGINAR UNA LISTA QUE YA ESTA EN MEMORIA.
 *
 * ─── POR QUE UNA PIEZA Y NO TRES LINEAS EN CADA PANTALLA ───
 *
 * El cliente lo pidio para TODAS las tablas que puedan crecer —*"siempre"*—, y son ocho pantallas.
 * Escrito a mano en cada una, la tercera se equivoca en el acotado y la quinta pagina desde 1 en vez
 * de desde 0. Y sobre todo: las tres reglas de abajo hay que acertarlas en las ocho.
 *
 * ─── LAS TRES REGLAS QUE ENCIERRA ───
 *
 *   1. **La pagina se ACOTA, no se reinicia**, cuando la lista encoge al filtrar. Volver al
 *      principio le quita el sitio a quien estaba en la pagina 3; pero quedarse en una pagina que ya
 *      no existe enseña una tabla vacia que parece un fallo del sistema.
 *   2. **El paginador desaparece** cuando todo cabe en una pagina. Un "1-8 de 8" con las dos flechas
 *      apagadas es ruido.
 *   3. **Paginar es MIRAR.** En una tabla que ademas se GUARDA —la lista de asistencia— lo que se
 *      manda al servidor es la lista entera, nunca la pagina: mandar lo visible dejaria sin marcar a
 *      quien estuviera en la pagina 2, y eso se descubre semanas despues en una auditoria.
 *
 * ─── COMO SE USA ───
 *
 *   const { visibles, paginador } = usePaginacion(filasFiltradas);
 *   ...
 *   {visibles.map(...)}
 *   {paginador}
 *
 * `reiniciar()` existe para cuando la pantalla cambia de contenido de verdad —otra pestaña, otra
 * consulta al servidor— y no para cuando solo se filtra, que es lo que resuelve la regla 1.
 */
export function usePaginacion<T>(
  filas: T[],
  porPagina: number = POR_PAGINA,
): { visibles: T[]; paginador: ReactNode; pagina: number; reiniciar: () => void } {
  const [pagina, setPagina] = useState(0);

  const ultima = Math.max(0, Math.ceil(filas.length / porPagina) - 1);
  const actual = Math.min(pagina, ultima);
  const desde = actual * porPagina;
  const visibles = filas.slice(desde, desde + porPagina);

  return {
    visibles,
    pagina: actual,
    reiniciar: () => setPagina(0),
    paginador:
      filas.length > porPagina ? (
        <TablePagination
          from={desde + 1}
          to={Math.min(desde + porPagina, filas.length)}
          total={filas.length}
          canPrevious={actual > 0}
          canNext={desde + porPagina < filas.length}
          onPrevious={() => setPagina(Math.max(0, actual - 1))}
          onNext={() => setPagina(actual + 1)}
        />
      ) : null,
  };
}

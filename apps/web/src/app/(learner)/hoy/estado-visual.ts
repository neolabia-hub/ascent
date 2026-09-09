import type { PendingItem } from '@/lib/learner-api';

export interface EstadoVisual {
  /** Clases del distintivo sobre superficie clara (tarjeta). */
  chip: string;
  /** Clases del distintivo sobre la portada (heroe): fondo oscuro, texto claro. */
  chipSobreFoto: string;
  /** Si el estado merece que la tarjeta lleve un filo de color a la izquierda. */
  filo: string | null;
}

/**
 * COMO SE PINTA CADA ESTADO. Traduce, no decide: quien decide es el servidor (Decision #101).
 *
 * ─── SE FUE EL ROJO (Decision #102) ───
 *
 * Lo vencido se pintaba en --danger, rojo pleno, con la palabra "VENCIDA" en mayusculas. El
 * cliente lo rechazo —*"ese color rojo no me gusta nada"*— y tenia razon por tres motivos que
 * conviene dejar escritos, porque la tentacion de devolverlo va a volver:
 *
 * 1. **El rojo del sistema significa DESTRUCTIVO** —borrar, revocar, un error que rompio algo—.
 *    Una formacion a la que se le paso la fecha no rompio nada: se hace y ya. Gastarlo aqui deja
 *    sin color al unico sitio donde de verdad hace falta.
 * 2. **En esta pantalla lo atrasado NO es la excepcion, es medio catalogo.** Un color de alarma
 *    que sale en la mitad de las tarjetas deja de alarmar y solo consigue que la pantalla se vea
 *    hostil. Si todo grita, nada avisa.
 * 3. **Le grita a quien menos culpa tiene.** Quien abre esto a las seis de la mañana es el que si
 *    entro; los que no entraron no estan mirando.
 *
 * En su lugar, ambar (--warn) y una frase con el numero de dias. Avisa igual y no acusa.
 *
 * ESPERANDO se queda en NEUTRO a proposito, sin color de aviso ninguno: no es un retraso de esta
 * persona, es que la empresa no la ha convocado. Pintarlo de ambar seria el mismo error mas suave.
 */
export function estadoVisual(item: PendingItem): EstadoVisual {
  switch (item.state) {
    case 'EN_CURSO':
      return {
        chip: 'bg-primary-soft text-primary',
        chipSobreFoto: 'bg-white/20 text-white',
        filo: 'var(--brand-primary)',
      };
    case 'ATRASADA':
      return { chip: 'bg-warn-soft text-warn', chipSobreFoto: 'bg-warn text-white', filo: 'var(--warn)' };
    case 'PRONTO':
      return { chip: 'bg-warn-soft text-warn', chipSobreFoto: 'bg-white/20 text-white', filo: null };
    case 'ESPERANDO':
      return { chip: 'bg-paper text-ink-500', chipSobreFoto: 'bg-white/15 text-white/80', filo: null };
    default:
      return { chip: 'bg-paper text-ink-500', chipSobreFoto: 'bg-white/15 text-white', filo: null };
  }
}

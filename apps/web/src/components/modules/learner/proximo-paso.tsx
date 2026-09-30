'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getPending, getTodayReview, type MyProgress, type PendingItem } from '@/lib/learner-api';

/**
 * EL PROXIMO PASO: lo que tiene sentido invitar a hacer AHORA (2026-09-30).
 *
 * El cliente lo pidio sobre el bloque de la racha: *"que invite a terminar lo que le falta, o si no
 * le falta, a que siga para mas puntos"*. Un contador de dias y de puntos informa, pero no dice que
 * hacer con eso; esto si, y siempre una sola cosa —la mas urgente—, porque tres sugerencias a la vez
 * no son una invitacion, son una lista.
 *
 * El orden es el de la urgencia real:
 *
 *   1. Lo ATRASADO: es lo que ya se le esta reclamando.
 *   2. Lo que tiene A MEDIAS, empezando por lo mas avanzado: terminar algo al 80% es lo mas cerca
 *      que esta de sumar puntos.
 *   3. Cualquier otra cosa pendiente que pueda empezar ya, la que antes venza.
 *   4. El REPASO de hoy, si hay: suma puntos y es corto.
 *   5. Si no le falta nada, cuidar la racha si esta en riesgo; y si tampoco, explorar.
 *
 * Solo cuenta lo ACCIONABLE (Decision #101): invitar a algo que todavia no se puede empezar
 * —«espera a que te convoquen»— es invitar a chocar con una puerta cerrada.
 */
export interface ProximoPaso {
  titulo: string;
  detalle: string;
  accion: string;
  /** La invitacion en una linea, para donde no cabe la frase: «Continuar: Seguridad vial». */
  corto: string;
  href: string;
  /** Si hay algo reclamado: la pieza lo pinta con mas urgencia. */
  urgente: boolean;
}

/** La fecha civil de hoy en Colombia, que es contra la que el servidor cuenta la racha. */
function hoyEnBogota(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
}

export function decidirProximoPaso(
  pendientes: PendingItem[],
  repasoDeHoy: number,
  progress: MyProgress | null,
): ProximoPaso {
  const racha = progress?.currentStreak ?? 0;
  const rachaEnRiesgo = racha > 0 && progress?.lastActivityDate !== hoyEnBogota();
  const cuidaLaRacha = rachaEnRiesgo ? ` Y mantienes tu racha de ${racha} ${racha === 1 ? 'día' : 'días'}.` : '';

  const posibles = pendientes.filter((p) => p.actionable);
  const atrasadas = posibles.filter((p) => p.state === 'ATRASADA');
  const aMedias = posibles
    .filter((p) => p.state === 'EN_CURSO')
    .sort((a, b) => (b.progressPct ?? 0) - (a.progressPct ?? 0));
  const porFecha = [...posibles].sort(
    (a, b) => (a.dueAt ? Date.parse(a.dueAt) : Infinity) - (b.dueAt ? Date.parse(b.dueAt) : Infinity),
  );
  const primera = atrasadas[0] ?? aMedias[0] ?? porFecha[0];

  if (primera) {
    const puntos = primera.pointsOnComplete > 0 ? ` y suma ${primera.pointsOnComplete} pts` : '';
    const titulo =
      atrasadas.length > 0
        ? atrasadas.length === 1
          ? 'Tienes 1 formación atrasada'
          : `Tienes ${atrasadas.length} formaciones atrasadas`
        : primera.state === 'EN_CURSO' && primera.progressPct !== null
          ? `Vas en el ${primera.progressPct}%`
          : posibles.length === 1
            ? 'Te falta 1 formación'
            : `Te faltan ${posibles.length} formaciones`;
    return {
      titulo,
      detalle: `Termina «${primera.title}»${puntos}.${cuidaLaRacha}`,
      accion: primera.started ? 'Continuar' : 'Empezar',
      corto: `${primera.started ? 'Continuar' : 'Empezar'}: ${primera.title}`,
      href: `/formacion/${primera.activityId}`,
      urgente: atrasadas.length > 0,
    };
  }

  if (repasoDeHoy > 0) {
    return {
      titulo: `Tu repaso de hoy: ${repasoDeHoy} ${repasoDeHoy === 1 ? 'pregunta' : 'preguntas'}`,
      detalle: `Son un par de minutos y suman puntos.${cuidaLaRacha}`,
      accion: 'Repasar',
      corto: 'Hacer el repaso de hoy',
      href: '/repaso',
      urgente: false,
    };
  }

  if (rachaEnRiesgo) {
    return {
      titulo: 'No pierdas tu racha',
      detalle: `Llevas ${racha} ${racha === 1 ? 'día' : 'días'} seguidos. Una lección hoy la mantiene.`,
      accion: 'Buscar una lección',
      corto: 'Mantén tu racha hoy',
      href: '/mi-formacion',
      urgente: false,
    };
  }

  return {
    titulo: 'Estás al día',
    detalle: 'No te falta nada. Sigue aprendiendo por tu cuenta: cada formación que terminas suma puntos.',
    accion: 'Explorar formaciones',
    corto: 'Sigue sumando puntos',
    href: '/mi-formacion',
    urgente: false,
  };
}

/**
 * Lo pide y lo decide. Se relee al cambiar de pantalla, igual que el progreso: al volver de una
 * leccion terminada, la invitacion tiene que ser la siguiente, no la que acaba de cumplir.
 *
 * `null` mientras carga o si falla: es una invitacion, no un dato que alguien necesite para
 * trabajar, y un error aqui seria mas ruido que ausencia.
 */
export function useProximoPaso(progress: MyProgress | null): ProximoPaso | null {
  const pathname = usePathname();
  const [datos, setDatos] = useState<{ pendientes: PendingItem[]; repaso: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      getPending().catch(() => ({ items: [] as PendingItem[] })),
      getTodayReview().catch(() => ({ total: 0 })),
    ]).then(([pending, review]) => {
      if (!cancelled) setDatos({ pendientes: pending.items, repaso: review.total });
    });
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  if (!datos) return null;
  return decidirProximoPaso(datos.pendientes, datos.repaso, progress);
}

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { GraduationCap, LayoutGrid } from 'lucide-react';
import { useEffect, useState } from 'react';
import { getPending } from '@/lib/learner-api';
import { ADMIN_HOME, LEARNER_HOME } from '@/lib/landing';
import { cn } from '@/components/ui/cn';

/**
 * EL CONMUTADOR DE ESPACIO — de administrar a formarse y de vuelta.
 *
 * El problema real: las formaciones son para TODOS, tambien para quien las administra. El jefe de
 * SGI hace su reinduccion como cualquiera. Pero las dos superficies del producto estaban
 * incomunicadas: no habia un solo enlace del panel a la formacion propia, asi que quien gestiona
 * no podia hacer la suya ni sabia que la tenia.
 *
 * POR QUE UNA SOLA CUENTA Y NO DOS (Decision #65). Una persona es una cedula: `users` tiene
 * unicidad por (tenant, documento). Una segunda cuenta "de aprendiz" obligaria a inventar un
 * documento, y entonces la matriz de competencia la cuenta dos veces, el denominador de cobertura
 * del plan se infla y la constancia sale con un documento que no existe — el papel que mira el
 * auditor. No es incomodo: corrompe el indicador y la evidencia.
 *
 * POR QUE UN BOTON Y NO UNA PREGUNTA EN EL LOGIN. Preguntar "¿entras como analista o como
 * aprendiz?" interroga a la persona en el momento en que menos sabe —antes de ver nada— y rompe
 * los enlaces de correo: un aviso de formacion vencida apunta al reproductor, y un login que
 * pregunta el rol ya no lleva donde dice. Esto NO cambia permisos: son los mismos siempre. Cambia
 * de sitio, como cualquier enlace.
 *
 * EL CONTADOR ES DE PENDIENTES, NO DE AVISOS, y esa diferencia es el motivo de que exista. Un
 * aviso se apaga al leerlo; una formacion pendiente sigue ahi aunque leas el correo diez veces. Si
 * el numero contara avisos, bajaria a cero sin que nadie se hubiera capacitado. La campana ya
 * cuenta lo leido; esto cuenta lo que falta por HACER, y se pone rojo cuando algo esta vencido.
 */
export function SpaceSwitcher({ to }: { to: 'learner' | 'admin' }) {
  const pathname = usePathname();
  const [pending, setPending] = useState<{ total: number; overdue: number } | null>(null);

  useEffect(() => {
    if (to !== 'learner') return;
    let cancelled = false;
    getPending()
      .then((result) => {
        if (cancelled) return;
        setPending({
          total: result.items.length,
          overdue: result.items.filter((item) => item.overdue).length,
        });
      })
      .catch(() => {
        // Sin contador el boton sigue llevando donde tiene que llevar. Un fallo al contar no
        // puede dejar a nadie sin camino a su propia formacion.
      });
    return () => {
      cancelled = true;
    };
    // Se relee al cambiar de pantalla: se acaba de aprobar algo y el numero tiene que bajar.
  }, [to, pathname]);

  const href = to === 'learner' ? LEARNER_HOME : ADMIN_HOME;
  const label = to === 'learner' ? 'Mi formacion' : 'Administracion';
  const Icon = to === 'learner' ? GraduationCap : LayoutGrid;

  const total = pending?.total ?? 0;
  const overdue = pending?.overdue ?? 0;
  const urgente = overdue > 0;

  const descripcion =
    to === 'admin'
      ? 'Ir al panel de administracion'
      : total === 0
        ? 'Mi formacion: no tienes nada pendiente'
        : urgente
          ? `Mi formacion: ${total} pendiente${total === 1 ? '' : 's'}, ${overdue} vencida${overdue === 1 ? '' : 's'}`
          : `Mi formacion: ${total} pendiente${total === 1 ? '' : 's'}`;

  return (
    <Link
      href={href}
      aria-label={descripcion}
      title={descripcion}
      className={cn(
        'focus-ring group flex h-9 items-center gap-2 rounded-full border pl-1.5 pr-1.5 text-sm transition-all duration-150 ease-pulse sm:pr-3',
        'shadow-btn hover:-translate-y-px hover:shadow-btn-hover active:translate-y-0 active:shadow-btn-active',
        // Con algo VENCIDO el boton NO se pinta entero de rojo. Se probo y quedaba al lado de la
        // campana de avisos, que tambien lleva su punto rojo: dos bloques del mismo color pegados
        // se leen como el mismo dato, y son justo lo contrario —uno es lo leido, otro lo que
        // falta por hacer—. El rojo se concentra en el CONTADOR y el borde solo lo insinua.
        urgente
          ? 'border-danger/40 bg-surface text-ink-900'
          : 'border-line bg-surface text-ink-700 hover:border-line-strong hover:text-ink-900',
      )}
    >
      {/*
        El icono va en su propia pastilla con el color de marca del tenant: es lo que hace que el
        control se lea como un LUGAR al que ir y no como un boton mas de la barra.
      */}
      <span
        className={cn(
          'flex h-6 w-6 items-center justify-center rounded-full transition-colors duration-150',
          urgente ? 'bg-danger-soft text-danger' : 'bg-primary-soft text-primary group-hover:bg-primary group-hover:text-white',
        )}
      >
        <Icon className="h-[15px] w-[15px]" strokeWidth={2} aria-hidden="true" />
      </span>

      <span className="hidden font-medium sm:inline">{label}</span>

      {/*
        UN NUMERO SOLO CUANDO HAY ALGO VENCIDO, y un punto cuando solo hay pendientes.
        Se probo con numero siempre y quedaba pegado al numero de la campana: dos cifras rojas
        juntas se leen como el mismo dato, y el cliente pregunto —con razon— si no sobraba una. No
        sobra, pero tienen pesos distintos y la pantalla tiene que decirlo: la campana cuenta lo
        que no has LEIDO, esto cuenta lo que no has HECHO. Tener formacion pendiente es lo normal;
        tenerla vencida es lo que hay que mirar hoy, y solo eso merece una cifra.
      */}
      {to === 'learner' && urgente ? (
        <span className="ml-0.5 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-danger px-1.5 text-[11px] font-semibold tabular-nums text-white animate-card-in">
          {overdue > 9 ? '9+' : overdue}
        </span>
      ) : to === 'learner' && total > 0 ? (
        <span className="ml-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary animate-card-in" aria-hidden="true" />
      ) : null}
    </Link>
  );
}

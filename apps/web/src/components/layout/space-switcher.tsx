'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { GraduationCap, LayoutGrid } from 'lucide-react';
import { useEffect, useState } from 'react';
import { getPending } from '@/lib/learner-api';
import { ADMIN_HOME, LEARNER_HOME } from '@/lib/landing';

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
 * ─────────────────────────────────────────────────────────────────────────────
 * DECIA A DONDE VAS, Y AHORA DICE DONDE ESTAS (Decision #92).
 *
 * Lo destapo el cliente: *"el conmutador es confuso; en la interfaz de aprendiz dice
 * Administracion para ir alla, pero los usuarios no entenderan; debe decir donde esta"*. El
 * diagnostico era correcto, aunque la solucion literal —poner "Mi formacion" en un control que
 * lleva a Administracion— seria peor: un rotulo que nombra un sitio y te lleva a otro.
 *
 * El fallo de fondo era que UN rotulo intentaba decir dos cosas: donde estas y a donde irias. Asi
 * que ahora son dos, y el control se abre para ensenarlas:
 *
 *   PLEGADO     dos iconos, nada mas. Ocupa lo que una campana.
 *   DESPLEGADO  al pasar por encima o al enfocarlo con el teclado se abre a lo ancho: el espacio
 *               actual sale marcado y SIN enlace, y el otro como el sitio al que ir.
 *
 * Asi nadie deduce nada: se ve donde esta, se ve que hay otro sitio, y lo unico que se puede
 * pulsar es lo unico que hace algo.
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
        // Sin contador el control sigue llevando donde tiene que llevar. Un fallo al contar no
        // puede dejar a nadie sin camino a su propia formacion.
      });
    return () => {
      cancelled = true;
    };
    // Se relee al cambiar de pantalla: se acaba de aprobar algo y el numero tiene que bajar.
  }, [to, pathname]);

  // `to` es el DESTINO, asi que el espacio actual es el otro.
  const IconoActual = to === 'learner' ? LayoutGrid : GraduationCap;
  const IconoDestino = to === 'learner' ? GraduationCap : LayoutGrid;
  const nombreActual = to === 'learner' ? 'Administracion' : 'Mi formacion';
  const nombreDestino = to === 'learner' ? 'Mi formacion' : 'Administracion';
  const href = to === 'learner' ? LEARNER_HOME : ADMIN_HOME;

  const total = pending?.total ?? 0;
  const overdue = pending?.overdue ?? 0;
  const urgente = overdue > 0;

  /*
    EL NOMBRE ACCESIBLE DEL ENLACE DICE LA ACCION, no donde estas: quien navega con lector de
    pantalla oye "enlace: ir al panel de administracion" y con eso sabe que pasa al pulsarlo. El
    "estas en X" es contexto y va en el tooltip, que es donde el contexto ayuda sin estorbar.
  */
  const accion = to === 'admin' ? 'Ir al panel de administracion' : 'Ir a mi formacion';
  const detalle =
    to === 'admin'
      ? ''
      : total === 0
        ? ': no tienes nada pendiente'
        : urgente
          ? `: ${total} pendiente${total === 1 ? '' : 's'}, ${overdue} vencida${overdue === 1 ? '' : 's'}`
          : `: ${total} pendiente${total === 1 ? '' : 's'}`;
  const accesible = `${accion}${detalle}`;
  const descripcion = `Estas en ${nombreActual}. ${accesible}`;

  return (
    /*
      SE ABRE A LO ANCHO al pasar por encima o al enfocar con el teclado. La animacion es de
      `grid-template-columns` de 0fr a 1fr, que es lo unico que deja animar la aparicion de un
      texto de ancho DESCONOCIDO: con `width` habria que fijar un numero y un rotulo mas largo
      —o traducido— se cortaria.
    */
    <div
      className="group/sw flex h-10 items-center rounded-full border border-line bg-surface p-1 shadow-card transition-all duration-200 ease-pulse focus-within:-translate-y-px focus-within:border-line-strong hover:-translate-y-px hover:border-line-strong hover:shadow-card-hover"
      title={descripcion}
    >
      {/* DONDE ESTAS: marcado y sin enlace, porque no lleva a ninguna parte. */}
      <span
        className="flex h-8 shrink-0 items-center gap-1.5 rounded-full px-2"
        style={{ backgroundColor: 'var(--primary-soft)' }}
      >
        <IconoActual
          className="h-[17px] w-[17px] shrink-0"
          strokeWidth={2}
          style={{ color: 'var(--brand-primary)' }}
          aria-hidden="true"
        />
        <span className="grid grid-cols-[0fr] overflow-hidden transition-[grid-template-columns] duration-200 ease-pulse group-focus-within/sw:grid-cols-[1fr] group-hover/sw:grid-cols-[1fr]">
          <span className="min-w-0 overflow-hidden whitespace-nowrap text-xs font-semibold text-ink-900">
            {nombreActual}
          </span>
        </span>
      </span>

      {/* A DONDE PUEDES IR: lo unico pulsable. */}
      <Link
        href={href}
        aria-label={accesible}
        title={descripcion}
        className="focus-ring relative flex h-8 shrink-0 items-center gap-1.5 rounded-full px-2 text-ink-500 transition-colors duration-150 hover:bg-paper hover:text-ink-900"
      >
        <IconoDestino className="h-[17px] w-[17px] shrink-0" strokeWidth={1.75} aria-hidden="true" />
        <span className="grid grid-cols-[0fr] overflow-hidden transition-[grid-template-columns] duration-200 ease-pulse group-focus-within/sw:grid-cols-[1fr] group-hover/sw:grid-cols-[1fr]">
          <span className="min-w-0 overflow-hidden whitespace-nowrap text-xs font-medium">{nombreDestino}</span>
        </span>

        {/*
          UN NUMERO SOLO CUANDO HAY ALGO VENCIDO, y un punto cuando solo hay pendientes. Tener
          formacion pendiente es lo normal; tenerla vencida es lo que hay que mirar hoy, y solo
          eso merece una cifra.
        */}
        {to === 'learner' && urgente ? (
          <span className="animate-card-in absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold tabular-nums text-white">
            {overdue > 9 ? '9+' : overdue}
          </span>
        ) : to === 'learner' && total > 0 ? (
          <span
            className="animate-card-in absolute right-0.5 top-1 h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: 'var(--brand-primary)' }}
            aria-hidden="true"
          />
        ) : null}
      </Link>
    </div>
  );
}

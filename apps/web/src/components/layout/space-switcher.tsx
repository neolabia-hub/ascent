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
 * El fallo de fondo era que UN rotulo intentaba decir dos cosas: donde estas y a donde irias.
 *
 * Se probo partiendolo en dos celdas —el espacio actual marcado y el destino al lado como enlace—
 * y salio un control de dos rotulos para una accion sola: mas ancho, mas ruido y dos sitios donde
 * mirar. Asi que ahora es un CONMUTADOR de verdad (Decision #106), como el de claro/oscuro:
 *
 *   PLEGADO     el icono de DONDE ESTAS. Ocupa lo que una campana.
 *   DESPLEGADO  al pasar o al enfocarlo se abre a lo ancho y lo dice con todas las letras.
 *   AL PULSAR   cambia al otro espacio.
 *
 * Lo que se VE es el estado y lo que se OYE es la accion: el nombre accesible del enlace dice "ir
 * a mi formacion", que es lo que pasa al pulsarlo. Un solo rotulo visible no puede decir las dos
 * cosas, asi que la que se ve orienta y la que se oye actua.
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
  const nombreActual = to === 'learner' ? 'Administracion' : 'Mi aprendizaje';
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
      UN SOLO BLOQUE, y lo que dice es DONDE ESTAS (Decision #106).

      Antes eran dos: el espacio actual marcado y, al lado, el destino como enlace. Se hizo asi
      para que nadie tuviera que deducir nada, y salio un control de dos celdas y dos rotulos para
      una accion sola — mas ancho, mas ruido y dos sitios donde mirar.

      Ahora es un CONMUTADOR de verdad, como el de claro/oscuro: ensena el estado en el que esta y
      al pulsarlo pasa al otro. Plegado es un icono, y al pasar por encima o al enfocarlo con el
      teclado se abre a lo ancho para decir donde estas con todas las letras.

      EL NOMBRE ACCESIBLE DICE LA ACCION, no el estado: quien navega escuchando oye "ir a mi
      formacion" —que es lo que pasa al pulsar— mientras la pantalla ensena "Administracion", que
      es donde esta. Un solo rotulo visible no puede decir las dos cosas, asi que la que se ve es
      la que orienta y la que se oye es la que actua. El tooltip las junta para quien use raton.

      La animacion es de `grid-template-columns` de 0fr a 1fr, que es lo unico que deja animar la
      aparicion de un texto de ancho DESCONOCIDO: con `width` habria que fijar un numero y un
      rotulo mas largo —o traducido— se cortaria.
    */
    <Link
      href={href}
      aria-label={accesible}
      title={descripcion}
      className="group/sw focus-ring flex h-10 items-center rounded-full border border-line p-1 shadow-card transition-all duration-200 ease-pulse hover:-translate-y-px hover:border-line-strong hover:shadow-card-hover focus-visible:-translate-y-px"
      // Mismo tono de reposo que la campana y la cuenta: los tres son una familia (Decision #108).
      style={{ backgroundColor: 'color-mix(in srgb, var(--brand-primary) 5%, var(--surface))' }}
    >
      {/*
        LA PASTILLA DE "DONDE ESTAS" VA NEUTRA, no con el color de la empresa (2026-09-02).

        Cuando `--brand-primary-soft` empezo a pintar de verdad, esto se lleno de azul dentro de un
        control que ya es azul palido por fuera: dos tonos de lo mismo, uno encima de otro, para
        marcar algo que no es una accion sino donde estas. Con el papel del producto se distingue
        igual —es mas claro que el fondo del control— y el color se reserva para lo que si se pulsa.
      */}
      <span
        className="relative flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-paper px-2"
      >
        <IconoActual
          className="h-[17px] w-[17px] shrink-0"
          strokeWidth={2}
          style={{ color: 'var(--brand-primary)' }}
          aria-hidden="true"
        />
        <span className="grid grid-cols-[0fr] overflow-hidden transition-[grid-template-columns] duration-200 ease-pulse group-focus-visible/sw:grid-cols-[1fr] group-hover/sw:grid-cols-[1fr]">
          <span className="min-w-0 overflow-hidden whitespace-nowrap text-xs font-semibold text-ink-900">
            {nombreActual}
          </span>
        </span>

        {/*
          UN NUMERO SOLO CUANDO HAY ALGO ATRASADO, y un punto cuando solo hay pendientes. Tener
          formacion pendiente es lo normal; tenerla atrasada es lo que hay que mirar hoy, y solo
          eso merece una cifra.

          Va sobre el icono del espacio ACTUAL porque ya no hay otro sitio donde ponerlo, y sigue
          contando lo del ESPACIO DEL APRENDIZ —que es lo que este control ofrece cuando se esta
          en el panel—.
        */}
        {to === 'learner' && urgente ? (
          <span
            className="animate-card-in absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-semibold tabular-nums text-white"
            // Ambar y no rojo (Decision #102): el rojo del sistema significa destructivo, y a una
            // formacion pasada de fecha se la hace y ya.
            style={{ backgroundColor: 'var(--warn)' }}
          >
            {overdue > 9 ? '9+' : overdue}
          </span>
        ) : to === 'learner' && total > 0 ? (
          <span
            className="animate-card-in absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: 'var(--brand-primary)' }}
            aria-hidden="true"
          />
        ) : null}
      </span>
    </Link>
  );
}

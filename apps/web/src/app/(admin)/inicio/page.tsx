'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowRight, CalendarClock, CheckSquare, Clock, TrendingDown } from 'lucide-react';
import { me, type MeResponse } from '@/lib/api';
import { listApprovals } from '@/lib/admin-api';
import { getAnalitica, getVencimientos, type Analitica, type Vencimientos } from '@/lib/analytics-api';
import { getRachaCumplimiento, type ResumenEjecucion } from '@/lib/reports-api';
import { BarraEjecucion } from '@/components/modules/admin/barra-ejecucion';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/components/ui/cn';
import { useCan } from '@/components/providers/session-provider';

/**
 * LO PRIMERO QUE VE QUIEN ADMINISTRA (Decision #129).
 *
 * ─── QUE HABIA ANTES ───
 *
 * Tres tarjetas con un guion y la leyenda "Disponible en el Sprint de reportes". La pantalla de
 * entrada del producto no contaba nada, asi que la primera accion de todo el mundo era irse a otra.
 *
 * ─── LA REGLA: SOLO LO QUE PIDE UNA DECISION ───
 *
 * No es un tablero de indicadores bonitos. Cada bloque responde a una pregunta que cambia lo que se
 * hace hoy, y en este orden:
 *
 *   1. ¿Hay algo cayendose AHORA?   -> lo vencido, lo atrasado, lo que espera aprobacion
 *   2. ¿Como vamos?                 -> el avance, con su desglose
 *   3. ¿Donde esta el problema?     -> las peores areas y regionales
 *   4. ¿Que se viene?               -> lo que vence en 30 y 90 dias
 *
 * Un numero que no lleva a una accion no entra aqui, por interesante que sea.
 *
 * ─── TODO ENLAZA AL SITIO EXACTO ───
 *
 * "12 atrasadas" sin poder abrirlo obliga a ir a Seguimiento y filtrar a mano, y entonces no se
 * abre. Cada cifra lleva a la pantalla que la explica.
 *
 * ─── NO HAY ENDPOINT NUEVO ───
 *
 * Se compone de lo que ya existe (`/reportes/analitica`, `/reportes/vencimientos`, `/approvals`).
 * Es deliberado: un resumen calculado aparte acabaria diciendo un numero distinto al de la pantalla
 * que lo explica, y entonces no se podria confiar en ninguno de los dos.
 */
export default function InicioPage() {
  const puedeVerReportes = useCan()('reports:read_scope');
  const puedeAprobar = useCan()('approvals:decide');

  const [perfil, setPerfil] = useState<MeResponse | null>(null);
  const [analitica, setAnalitica] = useState<Analitica | null>(null);
  const [vencimientos, setVencimientos] = useState<Vencimientos | null>(null);
  const [pendientes, setPendientes] = useState<number | null>(null);
  const [diasSinVencidos, setDiasSinVencidos] = useState<number | null>(null);

  useEffect(() => {
    let cancelado = false;
    void me()
      .then((valor) => {
        if (!cancelado) setPerfil(valor);
      })
      .catch(() => undefined);
    return () => {
      cancelado = true;
    };
  }, []);

  useEffect(() => {
    if (!puedeVerReportes) return;
    /*
      Cada bloque carga POR SU CUENTA y falla por su cuenta. Si la analitica tarda o se cae, los
      vencimientos y las aprobaciones siguen saliendo: una pantalla de entrada en blanco porque una
      consulta fallo es peor que una a la que le falta un bloque.
    */
    void getAnalitica()
      .then(setAnalitica)
      .catch(() => undefined);
    void getVencimientos(12)
      .then(setVencimientos)
      .catch(() => undefined);
    /*
      LA RACHA (`PENDIENTES` 8.3), Y POR QUE SI ES UN ENDPOINT NUEVO A PESAR DE LA REGLA DE ARRIBA.
      No es un resumen alternativo de lo vencido —eso seguiria siendo prerrogativa de Vencimientos,
      y esta pantalla lo consume de ahi como todo lo demas—: es "cuantos dias SEGUIDOS lleva en
      cero", que no se puede derivar de una foto de hoy. Lo calcula un worker diario y se lee tal
      cual, sin volver a sumar nada aqui.
    */
    void getRachaCumplimiento()
      .then((racha) => setDiasSinVencidos(racha.currentDays))
      .catch(() => undefined);
  }, [puedeVerReportes]);

  useEffect(() => {
    if (!puedeAprobar) return;
    void listApprovals('PENDING', 1)
      .then((pagina) => setPendientes(pagina.total))
      .catch(() => undefined);
  }, [puedeAprobar]);

  const resumen = analitica?.resumen;
  const cortes = analitica?.dimensiones ?? [];
  const porArea = cortes.find((corte) => corte.dimension === 'area');
  const porRegional = cortes.find((corte) => corte.dimension === 'regional');

  /*
    LAS DOS SERIES, CONTADAS AQUI Y NO PEDIDAS APARTE. El informe ya trae la lista; contar sobre ella
    es gratis y garantiza que Inicio y Vencimientos digan el mismo numero — que es justo lo que se
    rompe cuando cada pantalla se calcula lo suyo.
  */
  const reprogramar = (vencimientos?.items ?? []).filter((fila) => fila.clase === 'REPROGRAMAR').length;
  const perseguir = (vencimientos?.items ?? []).filter((fila) => fila.clase === 'PERSEGUIR').length;

  /*
    EL TITULAR DE HOY. `null` mientras no se sabe —con permiso para verlos y las cifras todavia sin
    llegar—, para no afirmar "todo al dia" un segundo antes de que aparezcan tres vencidas.

    Quien no tiene permiso para ver informes no se queda sin titulo: para esa persona el estado de la
    empresa no es el asunto, asi que se le da la bienvenida y ya.
  */
  const vencido = puedeVerReportes ? vencimientos?.resumen.vencido : 0;
  const atrasadas = puedeVerReportes ? resumen?.atrasadas : 0;
  const porAprobar = puedeAprobar ? pendientes : 0;
  const cargando =
    (puedeVerReportes && (vencido === undefined || atrasadas === undefined)) ||
    (puedeAprobar && porAprobar === null);
  const plural = (n: number, una: string, varias: string) => (n === 1 ? una : varias);
  const titular = cargando
    ? null
    : (vencido ?? 0) > 0
      ? `${vencido} ${plural(vencido ?? 0, 'acreditación vencida', 'acreditaciones vencidas')}`
      : (atrasadas ?? 0) > 0
        ? `${atrasadas} ${plural(atrasadas ?? 0, 'obligación se quedó atrás', 'obligaciones se quedaron atrás')}`
        : (porAprobar ?? 0) > 0
          ? `${porAprobar} ${plural(porAprobar ?? 0, 'decisión espera', 'decisiones esperan')} tu aprobación`
          : !puedeVerReportes && perfil
            ? `Hola, ${perfil.fullName.split(' ')[0]}`
            : /*
                EL LOGRO, NO SOLO LA AUSENCIA DE PROBLEMA (`PENDIENTES` 8.3, ofrecido al cliente el
                2026-09-09). "Todo al día" es neutro y no dice nada la vez 40; nombrar la racha si.
                Minimo 2 dias: con 1 no hay racha que contar, es simplemente que hoy esta en cero —
                que es exactamente lo que ya dice "Todo al día".
              */
              (diasSinVencidos ?? 0) >= 2
              ? `Nadie tiene nada vencido: ${diasSinVencidos} días seguidos`
              : 'Todo al día';

  return (
    <div className="space-y-8">
      <div>
        {/*
          AQUI YA NO SE SALUDA (2026-09-09, lo vio el cliente): la barra de arriba dice «Buenos días,
          Miguel» en TODAS las pantallas, asi que en Inicio el saludo salia dos veces con las mismas
          palabras y a dos centimetros. Repetir no es dar la bienvenida, es ocupar el titulo.

          Lo que va en su sitio es LO QUE PASA HOY. Es el titular que contesta «¿en que voy?» antes de
          leer una sola tarjeta, y cambia solo —cada dia dice otra cosa porque la empresa esta en otro
          punto—, que es de donde sale de verdad la sensacion de que el sistema esta vivo: de decir
          algo cierto y distinto, no de tutear.

          El orden es el mismo de las tarjetas de abajo y no es alfabetico: lo vencido ya se cayo, lo
          atrasado todavia se puede recuperar, y una aprobacion espera a una persona. Se nombra UNA
          sola cosa —la primera que importa— porque un titular con tres cifras no es un titular.
        */}
        {titular ? (
          <h1 className="font-display text-[28px] font-semibold text-ink-900">{titular}</h1>
        ) : (
          <Skeleton className="h-8 w-64" />
        )}
        <p className="mt-1 text-sm text-ink-500">Esto es lo que pide una decisión hoy.</p>
      </div>

      {/* 1. LO QUE SE ESTA CAYENDO AHORA. Va primero porque es lo unico que no puede esperar. */}
      <section>
        <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-500">Necesita atencion</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {/*
            LO VENCIDO ES LO PRIMERO QUE SE VE, y desde el 2026-09-08 lleva DIRECTO a su pestaña.
            Antes caia en Seguimiento con la lista de ejecucion delante, asi que decir «3 vencidas» y
            no poder abrirlas de un clic dejaba el aviso en decoracion.
          */}
          <Alerta
            icono={AlertTriangle}
            valor={puedeVerReportes ? vencimientos?.resumen.vencido : 0}
            etiqueta="Ya vencido"
            nota="Acreditaciones y plazos que ya se cayeron"
            href="/reportes?vista=vencimientos"
            urgente
          />
          <Alerta
            icono={TrendingDown}
            valor={puedeVerReportes ? resumen?.atrasadas : 0}
            etiqueta="Atrasadas"
            nota="Pudieron entrar y no entraron"
            href="/reportes"
            urgente
          />
          {/*
            ESPERANDO CONVOCATORIA NO ES CULPA DE NADIE, y por eso no se enciende aunque la cifra sea
            enorme: nadie les abrio la puerta. Perseguir a esa gente es perder el tiempo; lo que
            falta es programar la jornada.
          */}
          <Alerta
            icono={Clock}
            valor={puedeVerReportes ? resumen?.esperando : 0}
            etiqueta="Esperando convocatoria"
            nota="No pueden avanzar: falta programar"
            href="/convocatorias"
          />
          <Alerta
            icono={CheckSquare}
            valor={puedeAprobar ? (pendientes ?? undefined) : 0}
            etiqueta="Por aprobar"
            nota="Esperan una decision"
            href="/aprobaciones"
          />
        </div>
      </section>

      {/* 2. COMO VAMOS. */}
      {puedeVerReportes ? (
        <section className="card p-5">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-500">
                Obligaciones cumplidas
              </p>
              {resumen ? (
                <p className="mt-1 font-display text-[32px] font-bold leading-none tabular-nums text-ink-900">
                  {resumen.avancePct}%
                </p>
              ) : (
                <Skeleton className="mt-1 h-8 w-24" />
              )}
              <p className="mt-1 text-xs text-ink-500">
                Toda la formacion viva. El plan tiene sus propios indicadores.
              </p>
            </div>
            {resumen ? (
              <p className="text-sm text-ink-500">
                {resumen.terminadas} de {resumen.total}
              </p>
            ) : null}
          </div>
          {resumen ? (
            <div className="mt-4">
              <BarraEjecucion resumen={resumen} />
            </div>
          ) : (
            <Skeleton className="mt-4 h-3 w-full" />
          )}
          <Enlace href="/reportes">Ver el seguimiento completo</Enlace>
        </section>
      ) : null}

      {/* 3. DONDE ESTA EL PROBLEMA: solo lo peor. La lista entera vive en Analitica. */}
      {puedeVerReportes && ((porArea?.grupos.length ?? 0) > 0 || (porRegional?.grupos.length ?? 0) > 0) ? (
        <section>
          <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-500">
            Donde esta el problema
          </h2>
          <div className="grid gap-4 lg:grid-cols-2">
            <Peores titulo="Areas" grupos={porArea?.grupos ?? []} />
            <Peores titulo="Regionales" grupos={porRegional?.grupos ?? []} />
          </div>
        </section>
      ) : null}

      {/* 4. QUE SE VIENE. */}
      {puedeVerReportes && vencimientos ? (
        <section className="card p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <CalendarClock className="h-5 w-5 text-ink-500" strokeWidth={1.75} aria-hidden="true" />
              <div>
                <p className="font-display text-[15px] font-semibold text-ink-900">Lo que viene</p>
                {/*
                  LAS DOS CIFRAS SON DOS TRABAJOS OPUESTOS (Decision #162), y por eso se nombran aqui
                  igual que en el informe: reprogramar ocupa un salon y un dia del año que viene;
                  perseguir es llamar a alguien esta semana. La suma no significaria nada.
                */}
                <p className="text-xs text-ink-500">
                  {reprogramar} por volver a convocar · {perseguir} que nunca la han hecho
                </p>
              </div>
            </div>
            <div className="flex gap-6">
              <div>
                <p className="font-display text-[22px] font-bold leading-none tabular-nums text-ink-900">
                  {vencimientos.resumen.proximos30}
                </p>
                <p className="mt-1 text-xs text-ink-500">en 30 días</p>
              </div>
              <div>
                <p className="font-display text-[22px] font-bold leading-none tabular-nums text-ink-900">
                  {vencimientos.resumen.proximos90}
                </p>
                <p className="mt-1 text-xs text-ink-500">en 90 días</p>
              </div>
            </div>
          </div>
          <Enlace href="/reportes?vista=vencimientos">Ver el calendario de vencimientos</Enlace>
        </section>
      ) : null}
    </div>
  );
}

function Alerta({
  icono: Icono,
  valor,
  etiqueta,
  nota,
  href,
  urgente = false,
}: {
  icono: typeof AlertTriangle;
  valor: number | undefined;
  etiqueta: string;
  nota: string;
  href: string;
  urgente?: boolean;
}) {
  // Cero no es un problema: se pinta apagado. Un cero en ambar entrena a ignorar el ambar.
  const enciende = urgente && (valor ?? 0) > 0;

  return (
    <Link
      href={href}
      className="focus-ring card block p-4 transition-all duration-150 hover:-translate-y-px hover:shadow-card-hover"
    >
      <div className="flex items-start justify-between gap-2">
        <Icono
          className={cn('h-4 w-4', enciende ? 'text-warn' : 'text-ink-300')}
          strokeWidth={1.75}
          aria-hidden="true"
        />
        {valor === undefined ? (
          <Skeleton className="h-7 w-10" />
        ) : (
          <p
            className={cn(
              'font-display text-[26px] font-bold leading-none tabular-nums',
              enciende ? 'text-warn' : 'text-ink-900',
            )}
          >
            {valor}
          </p>
        )}
      </div>
      <p className="mt-2 text-sm font-medium text-ink-900">{etiqueta}</p>
      <p className="mt-0.5 text-xs leading-relaxed text-ink-500">{nota}</p>
    </Link>
  );
}

/** Las peores de una dimension. Ya vienen ordenadas del servidor: primero lo que hay que mirar. */
function Peores({
  titulo,
  grupos,
}: {
  titulo: string;
  grupos: { id: string | null; label: string; resumen: ResumenEjecucion }[];
}) {
  if (grupos.length === 0) return null;

  return (
    <div className="card p-5">
      <h3 className="font-display text-[15px] font-semibold text-ink-900">{titulo}</h3>
      <ul className="mt-3 space-y-3">
        {grupos.slice(0, 3).map((grupo) => (
          <li key={grupo.id ?? `sin-${titulo}`}>
            <div className="flex items-baseline justify-between gap-3">
              <p className={cn('truncate text-sm', grupo.id ? 'text-ink-900' : 'italic text-ink-500')}>
                {grupo.label}
              </p>
              <p className="shrink-0 text-sm font-semibold tabular-nums text-ink-900">{grupo.resumen.avancePct}%</p>
            </div>
            <div className="mt-1.5">
              <BarraEjecucion resumen={grupo.resumen} compacta />
            </div>
          </li>
        ))}
      </ul>
      <Enlace href="/reportes">Ver todos los cortes</Enlace>
    </div>
  );
}

function Enlace({ href, children }: { href: string; children: string }) {
  return (
    <Link
      href={href}
      className="focus-ring mt-4 inline-flex items-center gap-1 rounded-md text-sm font-medium text-ink-500 hover:text-ink-900"
    >
      {children}
      <ArrowRight size={14} strokeWidth={2} aria-hidden="true" />
    </Link>
  );
}

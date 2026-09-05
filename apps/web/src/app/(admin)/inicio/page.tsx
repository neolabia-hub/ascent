'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowRight, CalendarClock, CheckSquare, Clock, TrendingDown } from 'lucide-react';
import { me, type MeResponse } from '@/lib/api';
import { listApprovals } from '@/lib/admin-api';
import { getAnalitica, getVencimientos, type Analitica, type Vencimientos } from '@/lib/analytics-api';
import type { ResumenEjecucion } from '@/lib/reports-api';
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

  return (
    <div className="space-y-8">
      <div>
        {perfil ? (
          <h1 className="font-display text-[28px] font-semibold text-ink-900">
            {saludo()}, {perfil.fullName.split(' ')[0]}
          </h1>
        ) : (
          <Skeleton className="h-8 w-64" />
        )}
        <p className="mt-1 text-sm text-ink-500">Esto es lo que pide una decision hoy.</p>
      </div>

      {/* 1. LO QUE SE ESTA CAYENDO AHORA. Va primero porque es lo unico que no puede esperar. */}
      <section>
        <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-500">Necesita atencion</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Alerta
            icono={AlertTriangle}
            valor={puedeVerReportes ? vencimientos?.resumen.vencido : 0}
            etiqueta="Ya vencido"
            nota="Certificaciones y plazos que ya pasaron"
            href="/reportes"
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
                <p className="text-xs text-ink-500">Certificaciones que caducan y formaciones por hacer</p>
              </div>
            </div>
            <div className="flex gap-6">
              <div>
                <p className="font-display text-[22px] font-bold leading-none tabular-nums text-ink-900">
                  {vencimientos.resumen.proximos30}
                </p>
                <p className="mt-1 text-xs text-ink-500">en 30 dias</p>
              </div>
              <div>
                <p className="font-display text-[22px] font-bold leading-none tabular-nums text-ink-900">
                  {vencimientos.resumen.proximos90}
                </p>
                <p className="mt-1 text-xs text-ink-500">en 90 dias</p>
              </div>
            </div>
          </div>
          <Enlace href="/reportes">Ver el calendario de vencimientos</Enlace>
        </section>
      ) : null}
    </div>
  );
}

function saludo(): string {
  const hora = new Date().getHours();
  if (hora < 12) return 'Buenos dias';
  if (hora < 19) return 'Buenas tardes';
  return 'Buenas noches';
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

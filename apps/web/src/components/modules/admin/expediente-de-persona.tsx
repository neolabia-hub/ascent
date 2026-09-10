'use client';

import { useEffect, useState } from 'react';
import { Archive, Award, BadgeCheck, CalendarDays, FileCheck2, Printer } from 'lucide-react';
import { getCertificatesOf, type CertificateRow } from '@/lib/certificates-api';
import { listAssignments, papelesDePersona, type AssignmentRow, type PapelDeTercero } from '@/lib/delivery-api';
import type { UserRow } from '@/lib/admin-api';
import { formatDate } from '@/lib/format';
import { Avatar } from '@/components/ui/avatar';
import { Modal } from '@/components/ui/modal';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusPill } from '@/components/ui/status-pill';
import { cn } from '@/components/ui/cn';

/**
 * EL EXPEDIENTE DE UNA PERSONA. Es la Definición de Terminado del Sprint 6:
 *
 *   «el auditor simulado obtiene, para una persona cualquiera, su historial completo con soportes
 *   en menos de un minuto».
 *
 * ─── POR QUÉ HACÍA FALTA SI LOS DATOS YA ESTABAN ───
 *
 * Estaban, y en tres sitios distintos: las obligaciones en Asignaciones, las constancias en un
 * cajón de la fila, los papeles de terceros en otro. Contestar «demuéstrame lo de Juan Pérez»
 * obligaba a abrir tres pantallas, filtrar cada una por su nombre y unir el resultado a mano —
 * delante de un auditor, con el reloj corriendo—.
 *
 * ─── VENTANA Y NO CAJÓN, Y ES LA REGLA DE LA CASA ───
 *
 * Nació como cajón lateral y el cliente pidió ventana. Tenía razón, y además es la Decisión #131 al
 * pie de la letra: **si tiene campos, cajón; si es para leer, ventana**. Esto no tiene un solo
 * control que cambie nada — es un expediente, se abre, se lee y se cierra. El cajón, además, deja
 * media pantalla de tabla detrás compitiendo por la mirada; la ventana centrada no.
 *
 * ─── SE LEE COMO UN PERFIL, NO COMO UN INFORME ───
 *
 * La foto es la misma que la persona se puso en su espacio de aprendiz, y no es decoración: quien
 * abre esto está contestando una pregunta **sobre alguien**, y una cara ancla eso mucho antes que
 * un número de cédula. Debajo, tres cifras que resumen su situación de un vistazo y solo entonces
 * el detalle.
 *
 * ─── EL ORDEN: LO QUE FALTA PRIMERO ───
 *
 * Un expediente se abre por dos motivos: demostrar lo cumplido, o ver qué falta. Lo segundo es lo
 * urgente, así que lo vencido y lo pendiente va arriba. El auditor lee de arriba abajo y el de
 * Gestión Humana también, por razones opuestas.
 */

const ESTADO: Record<AssignmentRow['status'], { label: string; kind: 'ok' | 'warn' | 'danger' | 'info' | 'neutral' }> = {
  PENDING: { label: 'PENDIENTE', kind: 'info' },
  IN_PROGRESS: { label: 'EN CURSO', kind: 'info' },
  COMPLETED: { label: 'CUMPLIDA', kind: 'ok' },
  OVERDUE: { label: 'VENCIDA', kind: 'danger' },
  EXPIRED_NOT_DONE: { label: 'NO SE HIZO', kind: 'danger' },
  WAIVED: { label: 'EXIMIDA', kind: 'neutral' },
  WITHDRAWN_LEFT_AUDIENCE: { label: 'RETIRADA', kind: 'neutral' },
  WITHDRAWN_PLAN_ITEM_CANCELLED: { label: 'RETIRADA', kind: 'neutral' },
};

/** Lo que todavía pide una acción. Decide el orden de la pantalla. */
const PENDIENTE: AssignmentRow['status'][] = ['OVERDUE', 'EXPIRED_NOT_DONE', 'PENDING', 'IN_PROGRESS'];
/** Lo que está caído: es la cifra que se mira primero. */
const CAIDO: AssignmentRow['status'][] = ['OVERDUE', 'EXPIRED_NOT_DONE'];

export function ExpedienteDePersona({ persona, onCerrar }: { persona: UserRow; onCerrar: () => void }) {
  const [obligaciones, setObligaciones] = useState<AssignmentRow[] | null>(null);
  const [constancias, setConstancias] = useState<CertificateRow[] | null>(null);
  const [papeles, setPapeles] = useState<PapelDeTercero[] | null>(null);

  useEffect(() => {
    /*
      LAS TRES A LA VEZ, Y CADA UNA FALLA SOLA. Si las constancias tardan o el permiso no alcanza,
      las obligaciones se pintan igual: un expediente al que le falta un bloque sirve; uno en blanco
      porque una consulta se cayó, no.
    */
    void listAssignments({ userId: persona.id, page: 1 })
      .then((pagina) => setObligaciones(pagina.items))
      .catch(() => setObligaciones([]));
    void getCertificatesOf(persona.id)
      .then(setConstancias)
      .catch(() => setConstancias([]));
    void papelesDePersona(persona.id)
      .then((filas) => setPapeles(filas.filter((papel) => papel.number || papel.fileKey)))
      .catch(() => setPapeles([]));
  }, [persona.id]);

  const abiertas = (obligaciones ?? []).filter((fila) => PENDIENTE.includes(fila.status));
  const cerradas = (obligaciones ?? []).filter((fila) => !PENDIENTE.includes(fila.status));
  const caidas = (obligaciones ?? []).filter((fila) => CAIDO.includes(fila.status)).length;
  const cumplidas = (obligaciones ?? []).filter((fila) => fila.status === 'COMPLETED').length;

  return (
    <Modal
      open
      onOpenChange={(abierto) => {
        if (!abierto) onCerrar();
      }}
      size="lg"
      title={`Expediente de ${persona.fullName}`}
      description={`${persona.jobTitle.name} · ${persona.area.name}`}
      cabecera={<Perfil persona={persona} />}
      footer={
        <div className="flex items-center justify-between gap-2">
          {/*
            IMPRIMIR es lo que pide un auditor que quiere llevárselo, y el navegador ya sabe hacerlo:
            un PDF propio sería otro formato que mantener para decir lo que ya está en pantalla.
          */}
          <button
            type="button"
            onClick={() => window.print()}
            className="focus-ring inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-ink-500 hover:text-ink-900"
          >
            <Printer size={15} />
            Imprimir
          </button>
          <button
            type="button"
            onClick={onCerrar}
            className="focus-ring rounded-md px-3 py-1.5 text-sm text-ink-500 hover:text-ink-900"
          >
            Cerrar
          </button>
        </div>
      }
    >
      {/*
        LAS TRES CIFRAS, ANTES DEL DETALLE. Es lo que contesta «¿cómo está esta persona?» sin leer
        una sola fila. La de vencidas manda: si hay algo caído, es lo único que importa de la pantalla.
      */}
      <div className="grid grid-cols-3 gap-3">
        <Cifra valor={obligaciones === null ? null : caidas} etiqueta="Vencidas" alarmante={caidas > 0} />
        <Cifra valor={obligaciones === null ? null : abiertas.length - caidas} etiqueta="Pendientes" />
        <Cifra valor={obligaciones === null ? null : cumplidas} etiqueta="Cumplidas" />
      </div>

      {obligaciones === null ? (
        <div className="mt-6 space-y-2">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          <Bloque titulo="Lo que le falta" vacio="No tiene nada pendiente." cuantos={abiertas.length} resaltado>
            {abiertas.map((fila) => (
              <Obligacion key={fila.id} fila={fila} />
            ))}
          </Bloque>

          <Bloque titulo="Lo que ya cumplió" vacio="Todavía no ha cumplido ninguna." cuantos={cerradas.length}>
            {cerradas.map((fila) => (
              <Obligacion key={fila.id} fila={fila} />
            ))}
          </Bloque>

          {/*
            LOS DOS SOPORTES, Y NO SON LO MISMO (la misma distinción que en la fila de Usuarios): la
            constancia la emite la EMPRESA y lleva código de verificación; el papel lo emite un
            TERCERO —la ARL, el SENA— y lo que se guarda es su número y el archivo escaneado.
          */}
          <div className="grid gap-6 sm:grid-cols-2">
            <Bloque
              titulo="Constancias de la empresa"
              vacio="Ninguna todavía."
              cuantos={constancias?.length ?? 0}
              cargando={constancias === null}
            >
              {(constancias ?? []).map((fila) => (
                <Fila
                  key={fila.id}
                  icono={Award}
                  titulo={fila.activityName}
                  tachado={fila.revoked}
                  detalle={`Nº ${fila.serialNumber} · ${formatDate(fila.issuedAt)}${
                    fila.validUntil ? ` · vence ${formatDate(fila.validUntil)}` : ''
                  }`}
                  pastilla={fila.revoked ? <StatusPill kind="danger" label="REVOCADA" /> : null}
                />
              ))}
            </Bloque>

            <Bloque
              titulo="Papeles de un tercero"
              vacio="Ninguno registrado."
              cuantos={papeles?.length ?? 0}
              cargando={papeles === null}
            >
              {(papeles ?? []).map((fila) => (
                <Fila
                  key={fila.enrollmentId}
                  icono={fila.fileKey ? FileCheck2 : Archive}
                  titulo={fila.actividad}
                  detalle={`${fila.number ? `Nº ${fila.number}` : 'sin número'}${fila.issuer ? ` · ${fila.issuer}` : ''}${
                    fila.validUntil ? ` · vence ${formatDate(fila.validUntil)}` : ''
                  }${fila.fileKey ? '' : ' · sin archivo'}`}
                />
              ))}
            </Bloque>
          </div>
        </div>
      )}
    </Modal>
  );
}

/**
 * LA CABECERA: foto, nombre y los cuatro datos que sitúan a la persona.
 *
 * La foto sale de su perfil de aprendiz. Si no se puso ninguna, `Avatar` pinta sus iniciales sobre
 * el color de la empresa — nunca un hueco gris, que se lee como «falta algo».
 */
function Perfil({ persona }: { persona: UserRow }) {
  return (
    <div className="flex min-w-0 items-center gap-4">
      <Avatar avatarKey={persona.avatarKey} fullName={persona.fullName} size={56} className="shrink-0 shadow-card" />
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate font-display text-lg font-semibold leading-tight text-ink-900">{persona.fullName}</p>
          {persona.active ? null : <StatusPill kind="neutral" label="INACTIVA" />}
        </div>
        <p className="mt-0.5 truncate text-sm text-ink-500">
          {persona.jobTitle.name} · {persona.area.name}
          {persona.regional ? ` · ${persona.regional.name}` : ''}
        </p>
        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-ink-300">
          <span>
            {persona.documentType} {persona.documentNumber}
          </span>
          {persona.hiredAt ? (
            <span className="inline-flex items-center gap-1">
              <CalendarDays size={11} aria-hidden />
              Ingresó el {formatDate(persona.hiredAt)}
            </span>
          ) : null}
        </p>
      </div>
    </div>
  );
}

/** Una cifra del resumen. `null` mientras se carga: un cero mientras no se sabe es una mentira. */
function Cifra({ valor, etiqueta, alarmante = false }: { valor: number | null; etiqueta: string; alarmante?: boolean }) {
  return (
    <div className={cn('rounded-xl px-4 py-3', alarmante ? 'bg-danger-soft' : 'bg-paper')}>
      {valor === null ? (
        <Skeleton className="h-7 w-10" />
      ) : (
        <p
          className={cn(
            'font-display text-[26px] font-bold leading-none tabular-nums',
            alarmante ? 'text-danger' : 'text-ink-900',
          )}
        >
          {valor}
        </p>
      )}
      <p className={cn('mt-1 text-xs', alarmante ? 'font-medium text-danger' : 'text-ink-500')}>{etiqueta}</p>
    </div>
  );
}

function Obligacion({ fila }: { fila: AssignmentRow }) {
  const estado = ESTADO[fila.status];
  return (
    <Fila
      icono={BadgeCheck}
      titulo={fila.targetName ?? '—'}
      detalle={`${
        fila.completedAt
          ? `cumplida el ${formatDate(fila.completedAt)}`
          : fila.dueAt
            ? `vence el ${formatDate(fila.dueAt)}`
            : 'sin plazo'
      }${fila.cycleNumber > 1 ? ` · ronda ${fila.cycleNumber}` : ''}${fila.waivedReason ? ` · ${fila.waivedReason}` : ''}`}
      pastilla={<StatusPill kind={estado.kind} label={estado.label} />}
    />
  );
}

/** Una línea del expediente. Misma forma para las tres listas: se leen como una sola cosa. */
function Fila({
  icono: Icono,
  titulo,
  detalle,
  pastilla,
  tachado = false,
}: {
  icono: typeof Award;
  titulo: string;
  detalle: string;
  pastilla?: React.ReactNode;
  tachado?: boolean;
}) {
  return (
    <div className="flex items-start gap-2.5 rounded-lg bg-paper px-3 py-2.5 transition-colors duration-150 hover:bg-line/40">
      <Icono size={15} className="mt-0.5 shrink-0 text-ink-500" strokeWidth={1.75} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className={cn('text-sm text-ink-900', tachado && 'line-through')}>{titulo}</p>
        <p className="mt-0.5 text-xs text-ink-500">{detalle}</p>
      </div>
      {pastilla}
    </div>
  );
}

/**
 * UN BLOQUE. Dice cuántos hay en el título porque esa cifra ES la respuesta la mitad de las veces
 * —«¿cuántas le faltan?»— y obliga a contar filas si no está.
 */
function Bloque({
  titulo,
  vacio,
  cuantos,
  cargando = false,
  resaltado = false,
  children,
}: {
  titulo: string;
  vacio: string;
  cuantos: number;
  cargando?: boolean;
  resaltado?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h3
        className={cn(
          'text-[11px] font-semibold uppercase tracking-[0.12em]',
          resaltado && cuantos > 0 ? 'text-danger' : 'text-ink-500',
        )}
      >
        {titulo}
        {cuantos > 0 ? <span className="ml-1.5 tabular-nums">{cuantos}</span> : ''}
      </h3>
      {cargando ? (
        <Skeleton className="mt-2 h-12 w-full" />
      ) : cuantos === 0 ? (
        <p className="mt-1.5 text-sm text-ink-500">{vacio}</p>
      ) : (
        <div className="mt-2 space-y-1.5">{children}</div>
      )}
    </section>
  );
}

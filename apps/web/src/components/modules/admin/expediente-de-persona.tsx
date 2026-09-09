'use client';

import { useEffect, useState } from 'react';
import { Award, BadgeCheck, FileCheck2, Printer } from 'lucide-react';
import { getCertificatesOf, type CertificateRow } from '@/lib/certificates-api';
import { listAssignments, papelesDePersona, type AssignmentRow, type PapelDeTercero } from '@/lib/delivery-api';
import { formatDate } from '@/lib/format';
import { Drawer } from '@/components/ui/drawer';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusPill } from '@/components/ui/status-pill';
import { cn } from '@/components/ui/cn';

/**
 * EL EXPEDIENTE DE UNA PERSONA (2026-09-09). Es la Definición de Terminado del Sprint 6:
 *
 *   «el auditor simulado obtiene, para una persona cualquiera, su historial completo con soportes
 *   en menos de un minuto».
 *
 * ─── POR QUE HACIA FALTA SI LOS DATOS YA ESTABAN ───
 *
 * Estaban, y en tres sitios distintos: las obligaciones en Asignaciones, las constancias en un
 * cajón de la fila, los papeles de terceros en otro. Contestar «demuéstrame lo de Juan Pérez»
 * obligaba a abrir tres pantallas, filtrar cada una por su nombre y unir el resultado a mano —
 * delante de un auditor, con el reloj corriendo—. Un dato que hay que ir a buscar a tres sitios,
 * para quien pregunta, no está.
 *
 * ─── ESTO NO REEMPLAZA A LOS OTROS DOS CAJONES, Y NO ES UNA CONTRADICCION ───
 *
 * Los otros dos son para HACER: emitir o revocar una constancia, registrar el papel de la ARL.
 * Este es para LEER: no tiene un solo botón que cambie nada. Son dos cosas distintas aunque miren
 * los mismos datos, y por eso conviven — lo que la Decisión #140 prohíbe son dos puertas a la
 * misma TAREA, no una vista de lectura junto a las de trabajo.
 *
 * ─── EL ORDEN: LO QUE FALTA PRIMERO ───
 *
 * Un expediente se abre por dos motivos: para demostrar lo que está cumplido, o para ver qué falta.
 * Lo segundo es lo urgente, así que lo vencido y lo pendiente va arriba y lo cumplido debajo. El
 * auditor lee de arriba abajo y el de Gestión Humana también, pero por razones opuestas.
 */

/** Cómo se dice cada estado de una obligación, y con qué color. */
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

/** Lo que todavía pide una acción. Es lo que decide el orden de la lista. */
const PENDIENTE: AssignmentRow['status'][] = ['OVERDUE', 'EXPIRED_NOT_DONE', 'PENDING', 'IN_PROGRESS'];

export function ExpedienteDePersona({
  persona,
  onCerrar,
}: {
  persona: { id: string; fullName: string; documentNumber: string };
  onCerrar: () => void;
}) {
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

  return (
    <Drawer
      open
      onOpenChange={(abierto) => {
        if (!abierto) onCerrar();
      }}
      title={`Expediente de ${persona.fullName}`}
      description={`Documento ${persona.documentNumber} · todo lo que hay sobre esta persona, en un sitio`}
      footer={
        <div className="flex items-center justify-between gap-2">
          {/*
            IMPRIMIR es lo que pide un auditor que quiere llevárselo, y el navegador ya sabe hacerlo:
            un PDF propio seria otro formato que mantener para decir lo mismo que ya está en pantalla.
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
      {obligaciones === null ? (
        <div className="space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : (
        <div className="space-y-6">
          <Bloque
            titulo="Lo que le falta"
            vacio="No tiene nada pendiente."
            cuantos={abiertas.length}
            resaltado
          >
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
            LOS DOS SOPORTES, Y NO SON LO MISMO (misma distinción que en la fila de Usuarios): la
            constancia la emite la EMPRESA y lleva código de verificación; el papel lo emite un
            TERCERO —la ARL, el SENA— y lo que se guarda es su número y el archivo escaneado.
          */}
          <Bloque
            titulo="Constancias que emitió la empresa"
            vacio="Ninguna todavía."
            cuantos={constancias?.length ?? 0}
            cargando={constancias === null}
          >
            {(constancias ?? []).map((fila) => (
              <div key={fila.id} className="flex items-start gap-2.5 rounded-lg bg-paper px-3 py-2.5">
                <Award size={16} className="mt-0.5 shrink-0 text-ink-500" strokeWidth={1.75} aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className={cn('text-sm text-ink-900', fila.revoked && 'line-through')}>{fila.activityName}</p>
                  <p className="mt-0.5 text-xs text-ink-500">
                    Nº {fila.serialNumber} · emitida el {formatDate(fila.issuedAt)}
                    {fila.validUntil ? ` · vence el ${formatDate(fila.validUntil)}` : ''}
                    {fila.hours ? ` · ${fila.hours} h` : ''}
                  </p>
                </div>
                {fila.revoked ? <StatusPill kind="danger" label="REVOCADA" /> : null}
              </div>
            ))}
          </Bloque>

          <Bloque
            titulo="Papeles de un tercero"
            vacio="Ninguno registrado."
            cuantos={papeles?.length ?? 0}
            cargando={papeles === null}
          >
            {(papeles ?? []).map((fila) => (
              <div key={fila.enrollmentId} className="flex items-start gap-2.5 rounded-lg bg-paper px-3 py-2.5">
                <FileCheck2 size={16} className="mt-0.5 shrink-0 text-ink-500" strokeWidth={1.75} aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-ink-900">{fila.actividad}</p>
                  <p className="mt-0.5 text-xs text-ink-500">
                    {fila.number ? `Nº ${fila.number}` : 'sin número'}
                    {fila.issuer ? ` · ${fila.issuer}` : ''}
                    {fila.validUntil ? ` · vence el ${formatDate(fila.validUntil)}` : ''}
                    {fila.fileKey ? ' · con archivo' : ' · sin archivo'}
                  </p>
                </div>
              </div>
            ))}
          </Bloque>
        </div>
      )}
    </Drawer>
  );
}

function Obligacion({ fila }: { fila: AssignmentRow }) {
  const estado = ESTADO[fila.status];
  return (
    <div className="flex items-start gap-2.5 rounded-lg bg-paper px-3 py-2.5">
      <BadgeCheck size={16} className="mt-0.5 shrink-0 text-ink-500" strokeWidth={1.75} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm text-ink-900">{fila.targetName ?? '—'}</p>
        <p className="mt-0.5 text-xs text-ink-500">
          {fila.completedAt
            ? `cumplida el ${formatDate(fila.completedAt)}`
            : fila.dueAt
              ? `vence el ${formatDate(fila.dueAt)}`
              : 'sin plazo'}
          {fila.cycleNumber > 1 ? ` · ronda ${fila.cycleNumber}` : ''}
          {fila.waivedReason ? ` · ${fila.waivedReason}` : ''}
        </p>
      </div>
      <StatusPill kind={estado.kind} label={estado.label} />
    </div>
  );
}

/**
 * UN BLOQUE DEL EXPEDIENTE. Dice cuántos hay en el título porque esa cifra ES la respuesta la mitad
 * de las veces —«¿cuántas le faltan?»— y obliga a contar filas si no está.
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

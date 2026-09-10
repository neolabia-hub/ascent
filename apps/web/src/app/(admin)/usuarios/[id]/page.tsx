'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  Archive,
  ArrowLeft,
  Award,
  BadgeCheck,
  CalendarDays,
  FileCheck2,
  Mail,
  Phone,
  Printer,
  ShieldCheck,
} from 'lucide-react';
import { getUser, type UserDetail } from '@/lib/admin-api';
import { getCertificatesOf, type CertificateRow } from '@/lib/certificates-api';
import { listAssignments, papelesDePersona, type AssignmentRow, type PapelDeTercero } from '@/lib/delivery-api';
import { formatDate } from '@/lib/format';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusPill } from '@/components/ui/status-pill';
import { cn } from '@/components/ui/cn';

/**
 * EL EXPEDIENTE DE UNA PERSONA — PÁGINA COMPLETA.
 *
 * Es la Definición de Terminado del Sprint 6: *«el auditor obtiene, para una persona cualquiera, su
 * historial completo con soportes en menos de un minuto»*.
 *
 * ─── TRES FORMAS EN UN DÍA, Y LA TERCERA ES LA BUENA ───
 *
 * Nació **cajón lateral**, pasó a **ventana** y el cliente pidió **página**. Tenía razón las dos
 * veces, y el motivo de fondo es el mismo: esto no es un detalle de la tabla de Usuarios — es un
 * documento sobre una persona. Un cajón y una ventana dicen «esto es un apunte al margen, ciérralo y
 * sigue con lo tuyo»; una página dice «esto es la cosa». Y solo una página:
 *
 *   - tiene **dirección propia** (`/usuarios/<id>`) y por tanto se puede compartir por chat con
 *     quien pregunta, y guardar en favoritos,
 *   - se **imprime entera** sin que una ventana recorte el contenido,
 *   - y **cabe**. Aquí hay trayectoria, métricas, obligaciones, constancias y papeles: en 880 píxeles
 *     de ventana eso es un scroll dentro de otro scroll.
 *
 * ─── QUÉ LLEVA, Y EN QUÉ ORDEN ───
 *
 * 1. **Quién es** — foto, cargo, área, contacto. Ancla la pregunta en una persona.
 * 2. **Cómo está** — cuatro cifras. Contesta «¿esta persona está al día?» sin leer una fila.
 * 3. **Qué le falta** — lo urgente primero.
 * 4. **Su trayectoria** — todo lo cumplido, en orden, que es lo que un auditor recorre.
 * 5. **Sus soportes** — constancias de la empresa y papeles de terceros, separados porque no son lo
 *    mismo: una la emite la empresa con código de verificación, el otro lo emite la ARL o el SENA.
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

const PENDIENTE: AssignmentRow['status'][] = ['OVERDUE', 'EXPIRED_NOT_DONE', 'PENDING', 'IN_PROGRESS'];
const CAIDO: AssignmentRow['status'][] = ['OVERDUE', 'EXPIRED_NOT_DONE'];

export default function PerfilDePersonaPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id ?? '';

  const [persona, setPersona] = useState<UserDetail | null>(null);
  const [noExiste, setNoExiste] = useState(false);
  const [obligaciones, setObligaciones] = useState<AssignmentRow[] | null>(null);
  const [constancias, setConstancias] = useState<CertificateRow[] | null>(null);
  const [papeles, setPapeles] = useState<PapelDeTercero[] | null>(null);

  useEffect(() => {
    if (!id) return;
    /*
      CADA BLOQUE FALLA SOLO. Si las constancias tardan o el permiso no alcanza, la trayectoria se
      pinta igual: un perfil al que le falta un bloque sirve; uno en blanco porque una consulta
      se cayó, no.
    */
    void getUser(id)
      .then(setPersona)
      .catch(() => setNoExiste(true));
    void listAssignments({ userId: id, page: 1 })
      .then((pagina) => setObligaciones(pagina.items))
      .catch(() => setObligaciones([]));
    void getCertificatesOf(id)
      .then(setConstancias)
      .catch(() => setConstancias([]));
    void papelesDePersona(id)
      .then((filas) => setPapeles(filas.filter((papel) => papel.number || papel.fileKey)))
      .catch(() => setPapeles([]));
  }, [id]);

  if (noExiste) {
    return (
      <div>
        <Volver onClick={() => router.push('/usuarios')} />
        <EmptyState
          className="mt-6"
          icon={ShieldCheck}
          title="No encontramos a esta persona"
          description="O el enlace es viejo, o no tienes permiso para ver su perfil."
          action={
            <Link href="/usuarios">
              <Button>Ir a Usuarios</Button>
            </Link>
          }
        />
      </div>
    );
  }

  const abiertas = (obligaciones ?? []).filter((fila) => PENDIENTE.includes(fila.status));
  const cerradas = (obligaciones ?? []).filter((fila) => !PENDIENTE.includes(fila.status));
  const caidas = (obligaciones ?? []).filter((fila) => CAIDO.includes(fila.status)).length;
  const cumplidas = (obligaciones ?? []).filter((fila) => fila.status === 'COMPLETED').length;
  const total = (obligaciones ?? []).length;
  /*
    AL DIA = de lo que ya se le exigio, cuanto cumplio. No cuenta lo que todavia no vence: una
    persona con tres formaciones abiertas y en plazo no esta «al 40 %», esta al dia.
  */
  const exigidas = cumplidas + caidas;
  const alDia = exigidas === 0 ? null : Math.round((cumplidas / exigidas) * 100);

  return (
    <div className="pb-4">
      <Volver onClick={() => router.push('/usuarios')} />

      {/* ─────────────── QUIEN ES ─────────────── */}
      <header className="card mt-3 overflow-hidden">
        {/*
          LA BANDA DE MARCA. Es lo unico decorativo de la pagina y esta ahi por una razon: separa
          «quien es» de «como esta» sin una linea mas, y usa el color de la empresa, que es lo que
          hace que el perfil se sienta de ELLOS y no de un programa.
        */}
        <div className="h-16 w-full" style={{ background: 'linear-gradient(100deg, var(--brand-primary), var(--brand-accent))' }} />
        <div className="flex flex-wrap items-end gap-4 px-6 pb-5">
          <div className="-mt-8">
            {persona ? (
              <Avatar
                avatarKey={persona.avatarKey}
                fullName={persona.fullName}
                size={84}
                className="ring-4 ring-surface"
              />
            ) : (
              <Skeleton className="h-[84px] w-[84px] rounded-full" />
            )}
          </div>
          <div className="min-w-0 flex-1 pt-3">
            {persona ? (
              <>
                <div className="flex flex-wrap items-center gap-2.5">
                  <h1 className="font-display text-[26px] font-semibold leading-tight text-ink-900">
                    {persona.fullName}
                  </h1>
                  {persona.active ? null : <StatusPill kind="neutral" label="INACTIVA" />}
                </div>
                <p className="mt-0.5 text-sm text-ink-700">
                  {persona.jobTitle.name} · {persona.area.name}
                  {persona.regional ? ` · ${persona.regional.name}` : ''}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-500">
                  <span>
                    {persona.documentType} {persona.documentNumber}
                  </span>
                  {persona.hiredAt ? (
                    <span className="inline-flex items-center gap-1">
                      <CalendarDays size={12} aria-hidden /> Ingresó el {formatDate(persona.hiredAt)}
                    </span>
                  ) : null}
                  {persona.email ? (
                    <a
                      href={`mailto:${persona.email}`}
                      className="focus-ring inline-flex items-center gap-1 hover:text-ink-900"
                    >
                      <Mail size={12} aria-hidden /> {persona.email}
                    </a>
                  ) : null}
                  {persona.phone ? (
                    <a
                      href={`tel:${persona.phone.replace(/[^+\d]/g, '')}`}
                      className="focus-ring inline-flex items-center gap-1 hover:text-ink-900"
                    >
                      <Phone size={12} aria-hidden /> {persona.phone}
                    </a>
                  ) : null}
                </div>
              </>
            ) : (
              <div className="space-y-2 py-1">
                <Skeleton className="h-6 w-56" />
                <Skeleton className="h-4 w-72" />
              </div>
            )}
          </div>
          <div className="pb-1">
            {/*
              IMPRIMIR: lo que pide un auditor que quiere llevarselo. El navegador ya sabe hacerlo y
              la pagina cabe entera — que es media razon para que esto sea una pagina y no una ventana.
            */}
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer size={15} />
              Imprimir
            </Button>
          </div>
        </div>
      </header>

      {/* ─────────────── COMO ESTA ─────────────── */}
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Cifra valor={obligaciones === null ? null : caidas} etiqueta="Vencidas" alarmante={caidas > 0} />
        <Cifra valor={obligaciones === null ? null : abiertas.length - caidas} etiqueta="Pendientes" />
        <Cifra valor={obligaciones === null ? null : cumplidas} etiqueta="Cumplidas" />
        <Cifra
          valor={obligaciones === null ? null : alDia}
          sufijo="%"
          etiqueta="Al día"
          ayuda="De lo que ya se le exigió, cuánto cumplió. Lo que todavía está en plazo no cuenta."
        />
      </div>

      {obligaciones === null ? (
        <div className="mt-6 space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : total === 0 ? (
        <EmptyState
          className="mt-6"
          icon={BadgeCheck}
          title="Todavía no tiene ninguna formación asignada"
          description="Cuando una regla o una convocatoria la alcance, aparecerá aquí con su plazo."
        />
      ) : (
        <div className="mt-6 space-y-6">
          {abiertas.length > 0 ? (
            <Bloque titulo="Lo que le falta" cuantos={abiertas.length} resaltado>
              {abiertas.map((fila) => (
                <Obligacion key={fila.id} fila={fila} />
              ))}
            </Bloque>
          ) : null}

          {/*
            SU TRAYECTORIA: lo cumplido, de lo mas reciente a lo mas viejo. Es el recorrido que hace
            un auditor —«enseñeme que ha hecho esta persona»— y por eso va en orden de tiempo y no
            agrupado por tipo: lo que se comprueba es una historia, no un catalogo.
          */}
          <Bloque titulo="Su trayectoria" cuantos={cerradas.length} vacio="Todavía no ha cumplido ninguna.">
            {cerradas.map((fila) => (
              <Obligacion key={fila.id} fila={fila} />
            ))}
          </Bloque>

          <div className="grid gap-6 lg:grid-cols-2">
            <Bloque
              titulo="Constancias de la empresa"
              cuantos={constancias?.length ?? 0}
              cargando={constancias === null}
              vacio="Ninguna todavía."
            >
              {(constancias ?? []).map((fila) => (
                <Fila
                  key={fila.id}
                  icono={Award}
                  titulo={fila.activityName}
                  tachado={fila.revoked}
                  detalle={`Nº ${fila.serialNumber} · ${formatDate(fila.issuedAt)}${
                    fila.validUntil ? ` · vence ${formatDate(fila.validUntil)}` : ''
                  }${fila.hours ? ` · ${fila.hours} h` : ''}`}
                  pastilla={fila.revoked ? <StatusPill kind="danger" label="REVOCADA" /> : null}
                />
              ))}
            </Bloque>

            <Bloque
              titulo="Papeles de un tercero"
              cuantos={papeles?.length ?? 0}
              cargando={papeles === null}
              vacio="Ninguno registrado."
            >
              {(papeles ?? []).map((fila) => (
                <Fila
                  key={fila.enrollmentId}
                  icono={fila.fileKey ? FileCheck2 : Archive}
                  titulo={fila.actividad}
                  detalle={`${fila.number ? `Nº ${fila.number}` : 'sin número'}${
                    fila.issuer ? ` · ${fila.issuer}` : ''
                  }${fila.validUntil ? ` · vence ${formatDate(fila.validUntil)}` : ''}${
                    fila.fileKey ? '' : ' · sin archivo'
                  }`}
                />
              ))}
            </Bloque>
          </div>
        </div>
      )}
    </div>
  );
}

function Volver({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="focus-ring inline-flex items-center gap-1 rounded-md text-sm text-ink-500 transition-colors hover:text-ink-900"
    >
      <ArrowLeft size={14} />
      Usuarios
    </button>
  );
}

/** Una cifra. `null` mientras se carga: un cero mientras no se sabe es una mentira. */
function Cifra({
  valor,
  etiqueta,
  sufijo = '',
  alarmante = false,
  ayuda,
}: {
  valor: number | null;
  etiqueta: string;
  sufijo?: string;
  alarmante?: boolean;
  ayuda?: string;
}) {
  return (
    <div className={cn('card p-4', alarmante && 'border-danger/30 bg-danger-soft')} title={ayuda}>
      {valor === null ? (
        <Skeleton className="h-8 w-12" />
      ) : (
        <p
          className={cn(
            'font-display text-[30px] font-bold leading-none tabular-nums',
            alarmante ? 'text-danger' : 'text-ink-900',
          )}
        >
          {valor}
          {sufijo}
        </p>
      )}
      <p className={cn('mt-1.5 text-xs', alarmante ? 'font-medium text-danger' : 'text-ink-500')}>{etiqueta}</p>
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

/** Una línea del perfil. La misma forma para las tres listas: se leen como una sola cosa. */
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
    <div className="flex items-start gap-2.5 rounded-lg bg-paper px-3.5 py-2.5 transition-colors duration-150 hover:bg-primary-soft">
      <Icono size={15} className="mt-0.5 shrink-0 text-ink-500" strokeWidth={1.75} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className={cn('text-sm text-ink-900', tachado && 'line-through')}>{titulo}</p>
        <p className="mt-0.5 text-xs text-ink-500">{detalle}</p>
      </div>
      {pastilla}
    </div>
  );
}

function Bloque({
  titulo,
  cuantos,
  vacio,
  cargando = false,
  resaltado = false,
  children,
}: {
  titulo: string;
  cuantos: number;
  vacio?: string;
  cargando?: boolean;
  resaltado?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="card p-5">
      <h2
        className={cn(
          'text-[11px] font-semibold uppercase tracking-[0.12em]',
          resaltado && cuantos > 0 ? 'text-danger' : 'text-ink-500',
        )}
      >
        {titulo}
        {cuantos > 0 ? <span className="ml-1.5 tabular-nums">{cuantos}</span> : ''}
      </h2>
      {cargando ? (
        <Skeleton className="mt-3 h-12 w-full" />
      ) : cuantos === 0 ? (
        <p className="mt-2 text-sm text-ink-500">{vacio}</p>
      ) : (
        <div className="mt-3 space-y-1.5">{children}</div>
      )}
    </section>
  );
}

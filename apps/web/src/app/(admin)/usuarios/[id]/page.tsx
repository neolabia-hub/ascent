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
  Download,
  ExternalLink,
  FileCheck2,
  Mail,
  Phone,
  Printer,
  Search,
  ShieldCheck,
} from 'lucide-react';
import { getUser, type UserDetail } from '@/lib/admin-api';
import { abrirPdfEnPestana, descargarPdf, getCertificatesOf, type CertificateRow } from '@/lib/certificates-api';
import { papelesDePersona, todasLasObligacionesDe, type AssignmentRow, type PapelDeTercero } from '@/lib/delivery-api';
import { motivoDelError } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { PapelesDePersona } from '@/components/modules/admin/papeles-de-persona';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusPill } from '@/components/ui/status-pill';
import { useToast } from '@/components/ui/toast';
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

/**
 * POR QUE SE RETIRO, en palabras (2026-09-30). La fila no guarda un motivo escrito —lo retira el
 * sistema, no una persona—, pero el estado dice cual de los dos casos fue, y es lo que pregunta un
 * auditor delante de una obligacion que no se cumplio y no cuenta.
 */
const POR_QUE_RETIRADA: Partial<Record<AssignmentRow['status'], string>> = {
  WITHDRAWN_LEFT_AUDIENCE: 'dejó de exigírsele: cambió de cargo o área, o se retiró la regla',
  WITHDRAWN_PLAN_ITEM_CANCELLED: 'se canceló el renglón del plan que la creó',
};

/** Dejaron de exigirse sin cumplirse: no son trayectoria (2026-09-30). */
const RETIRADA: string[] = ['WITHDRAWN_LEFT_AUDIENCE', 'WITHDRAWN_PLAN_ITEM_CANCELLED'];
const PENDIENTE: AssignmentRow['status'][] = ['OVERDUE', 'EXPIRED_NOT_DONE', 'PENDING', 'IN_PROGRESS'];
const CAIDO: AssignmentRow['status'][] = ['OVERDUE', 'EXPIRED_NOT_DONE'];

export default function PerfilDePersonaPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id ?? '';

  const { showToast } = useToast();

  const [persona, setPersona] = useState<UserDetail | null>(null);
  const [noExiste, setNoExiste] = useState(false);
  const [obligaciones, setObligaciones] = useState<AssignmentRow[] | null>(null);
  const [verRetiradas, setVerRetiradas] = useState(false);
  /** Pulsar una cifra la convierte en filtro (2026-09-30): vencidas, pendientes o cumplidas. */
  const [vista, setVista] = useState<'vencidas' | 'pendientes' | 'cumplidas' | null>(null);
  /** Buscador rapido de la trayectoria, para cuando sean muchas. */
  const [busca, setBusca] = useState('');
  /** Qué tipo de formación se está mirando, si alguno. `null` = toda su historia. */
  const [filtroTipo, setFiltroTipo] = useState<string | null>(null);
  /** Qué constancia se está bajando o abriendo, para que el botón diga que está trabajando. */
  const [bajando, setBajando] = useState<string | null>(null);
  const [abriendo, setAbriendo] = useState<string | null>(null);
  const [registrandoPapel, setRegistrandoPapel] = useState(false);
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
    void todasLasObligacionesDe(id)
      .then(setObligaciones)
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

  /*
    MIRAR SOLO UNA FAMILIA, SIN ROMPER LA HISTORIA (2026-09-17).

    El cliente llegó a esto preguntándose *"¿qué pasa si quieren ver todo lo de inducción de una
    persona, sin importar si es general o específica?"*. Y esa pregunta se hace mucho: la contesta un
    jefe antes de dejar entrar a alguien a un puesto, y la contesta el SG-SST en una auditoría.

    ─── POR QUÉ UN FILTRO Y NO UNA AGRUPACIÓN ───

    La tentación era partir la trayectoria en secciones por tipo. Pero **hay una decisión escrita
    aquí mismo** que dice lo contrario, y sigue teniendo razón: la trayectoria va en orden de tiempo
    porque *"lo que se comprueba es una historia, no un catálogo"*. Un filtro no la contradice —la
    estrecha—: sigue siendo la misma historia, con menos filas.

    ─── Y POR QUÉ SE FILTRA POR EL NOMBRE DEL TIPO, NO POR "ES UNA INDUCCIÓN" ───

    Porque el modelo **no marca** qué es una inducción, y deducirlo del nombre o del código está
    descartado a propósito (`PENDIENTES` 11.7): los dos son datos del tenant y mentirían en cuanto
    alguien renombrara algo. Así que las pestañas son los tipos que esa persona de verdad tiene,
    con el nombre que el tenant les puso. Quien quiera ver sus inducciones pulsa "Inducción general"
    o "Inducción específica" — y si el tenant las llamó de otra forma, ahí saldrá esa otra forma.
  */
  /*
    LO QUE SE VE, Y SOLO ESO, se cuenta en las pastillas (2026-09-30). Con las retiradas plegadas,
    «Reinducción 2» contaba dos retiradas que la lista no enseñaba: se pulsaba y no salia nada.
  */
  const visibles = (obligaciones ?? []).filter((fila) => verRetiradas || !RETIRADA.includes(fila.status));
  const tiposDeLaPersona = [...new Set(visibles.map((fila) => fila.tipo).filter((t): t is string => !!t))].sort();
  const enElFiltro = (fila: AssignmentRow) => filtroTipo === null || fila.tipo === filtroTipo;

  const nombreDeArchivo = (fila: CertificateRow) =>
    `${persona?.fullName ?? 'Constancia'} - ${fila.activityName}.pdf`;

  const bajarConstancia = async (fila: CertificateRow) => {
    setBajando(fila.id);
    try {
      await descargarPdf(`/certificates/${fila.id}/pdf`, nombreDeArchivo(fila));
    } catch (error) {
      showToast({ kind: 'danger', title: 'No se pudo descargar la constancia', description: motivoDelError(error) });
    } finally {
      setBajando(null);
    }
  };

  /*
    ABRIR EN UNA PESTAÑA, y esta es la excepción razonable a "nada de ventanas nuevas": el visor de
    PDF del navegador ya hace esto mejor que cualquier cosa que dibujemos. No es un `<a href>`: el
    token vive en memoria y el navegador no lo adjunta al navegar, así que se pide con cabecera y se
    abre el objeto local.
  */
  const abrirConstancia = async (fila: CertificateRow) => {
    setAbriendo(fila.id);
    try {
      await abrirPdfEnPestana(`/certificates/${fila.id}/pdf`);
    } catch (error) {
      showToast({ kind: 'danger', title: 'No se pudo abrir la constancia', description: motivoDelError(error) });
    } finally {
      setAbriendo(null);
    }
  };

  /*
    EL FILTRO POR ESTADO SON LAS TARJETAS DE ARRIBA (2026-09-30, pedido del cliente). Hubo ademas una
    fila de botones —«Todo lo que falta · Vencida · Pendiente»— que hacia lo mismo que pulsar las
    cifras Vencidas o Pendientes: dos controles para una sola cosa. Quedan las tarjetas, que ademas
    filtran Cumplidas.
  */
  const abiertas = (obligaciones ?? []).filter((fila) => PENDIENTE.includes(fila.status) && enElFiltro(fila));
  const cerradasTodas = (obligaciones ?? []).filter((fila) => !PENDIENTE.includes(fila.status) && enElFiltro(fila));
  /*
    LAS RETIRADAS, PLEGADAS (2026-09-30). Una obligacion retirada no la cumplio nadie: dejo de
    exigirse (cambio de cargo, regla apagada). En la trayectoria se leia como historia de la persona,
    y no lo es. Como en los LMS: por defecto lo cumplido y lo eximido, y lo retirado a un clic —se
    conserva, porque explica por que alguien creyo tener esa formacion—.
  */
  const retiradasDeLaPersona = cerradasTodas.filter((fila) => RETIRADA.includes(fila.status));
  const cerradas = verRetiradas ? cerradasTodas : cerradasTodas.filter((fila) => !RETIRADA.includes(fila.status));
  const normal = (texto: string) => texto.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
  const abiertasVistas =
    vista === 'cumplidas'
      ? []
      : vista === 'vencidas'
        ? abiertas.filter((fila) => CAIDO.includes(fila.status))
        : vista === 'pendientes'
          ? abiertas.filter((fila) => !CAIDO.includes(fila.status))
          : abiertas;
  const cerradasVistas = (
    vista === 'vencidas' || vista === 'pendientes'
      ? []
      : vista === 'cumplidas'
        ? cerradas.filter((fila) => fila.status === 'COMPLETED')
        : cerradas
  ).filter((fila) => !busca.trim() || normal(fila.targetName ?? '').includes(normal(busca.trim())));
  const alternarVista = (nueva: typeof vista) => setVista((actual) => (actual === nueva ? null : nueva));
  /** Sin filtrar: las cuatro cifras de arriba son sobre la persona entera, no sobre lo que se mira. */
  const abiertasTodas = (obligaciones ?? []).filter((fila) => PENDIENTE.includes(fila.status)).length;
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
            <div className="flex flex-wrap gap-2">
              {/*
                REGISTRAR UN CERTIFICADO EXTERNO, ARRIBA (2026-09-30, pedido del cliente). Vivia al pie,
                debajo de la lista de papeles, y es una ACCION sobre la persona: se busca donde estan
                las acciones, junto a imprimir.
              */}
              <Button variant="outline" size="sm" onClick={() => setRegistrandoPapel(true)}>
                <BadgeCheck size={15} />
                Registrar certificado externo
              </Button>
              <Button variant="outline" size="sm" onClick={() => window.print()}>
                <Printer size={15} />
                Imprimir
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* ─────────────── COMO ESTA ─────────────── */}
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Cifra
          valor={obligaciones === null ? null : caidas}
          etiqueta="Vencidas"
          alarmante={caidas > 0}
          activa={vista === 'vencidas'}
          onClick={() => alternarVista('vencidas')}
        />
        {/* Las cuatro cifras NO se filtran: contestan "¿esta persona está al día?", y esa pregunta
            es sobre ella entera. Si cambiaran al pulsar una pestaña, el mismo número diría dos
            cosas distintas en la misma pantalla. */}
        <Cifra
          valor={obligaciones === null ? null : abiertasTodas - caidas}
          etiqueta="Pendientes"
          activa={vista === 'pendientes'}
          onClick={() => alternarVista('pendientes')}
        />
        <Cifra
          valor={obligaciones === null ? null : cumplidas}
          etiqueta="Cumplidas"
          activa={vista === 'cumplidas'}
          onClick={() => alternarVista('cumplidas')}
        />
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
          {/*
            LAS PESTAÑAS SOLO APARECEN SI HAY MÁS DE UN TIPO. Con uno solo no hay nada que elegir, y
            una barra de un botón es ruido que además sugiere que existe algo más.
          */}
          {tiposDeLaPersona.length > 1 ? (
            <div className="flex flex-wrap items-center gap-1.5">
              {[null, ...tiposDeLaPersona].map((tipo) => {
                const activo = filtroTipo === tipo;
                const cuantas =
                  tipo === null
                    ? visibles.length
                    : visibles.filter((fila) => fila.tipo === tipo).length;
                return (
                  <button
                    key={tipo ?? '__todas__'}
                    type="button"
                    aria-pressed={activo}
                    onClick={() => setFiltroTipo(tipo)}
                    className={cn(
                      'focus-ring rounded-full border px-3.5 py-1.5 text-xs transition-colors duration-150',
                      activo ? 'border-transparent font-semibold text-white shadow-btn' : 'border-line bg-surface text-ink-700 hover:bg-paper',
                    )}
                    style={activo ? { backgroundColor: 'var(--brand-primary)' } : undefined}
                  >
                    {tipo ?? 'Todo'}{' '}
                    <span className={cn('tabular-nums', activo ? 'text-white/80' : 'text-ink-500')}>{cuantas}</span>
                  </button>
                );
              })}
            </div>
          ) : null}

          {/* Filtrando puede no quedar nada abierto Y nada cerrado: se dice, en vez de dejar dos
              bloques vacíos que parecen un fallo de carga. */}
          {filtroTipo !== null && abiertas.length === 0 && cerradas.length === 0 ? (
            <p className="rounded-md bg-paper px-3 py-2 text-sm text-ink-500">
              No tiene ninguna formación de tipo <strong className="font-medium">{filtroTipo}</strong>.
            </p>
          ) : null}

          {abiertasVistas.length > 0 ? (
            <Bloque titulo="Lo que le falta" cuantos={abiertasVistas.length} resaltado>
              {abiertasVistas.map((fila) => (
                <Obligacion key={fila.id} fila={fila} />
              ))}
            </Bloque>
          ) : null}

          {/*
            SU TRAYECTORIA: lo cumplido, de lo mas reciente a lo mas viejo. Es el recorrido que hace
            un auditor —«enseñeme que ha hecho esta persona»— y por eso va en orden de tiempo y no
            agrupado por tipo: lo que se comprueba es una historia, no un catalogo.
          */}
          {/* BUSCADOR RAPIDO, cuando la historia ya es larga: con cinco se lee de un vistazo. */}
          {cerradas.length > 5 && vista !== 'vencidas' && vista !== 'pendientes' ? (
            <div className="relative max-w-sm">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-500" />
              <input
                type="search"
                value={busca}
                onChange={(event) => setBusca(event.target.value)}
                placeholder="Buscar en su trayectoria"
                aria-label="Buscar en su trayectoria"
                className="focus-ring h-10 w-full rounded-lg border border-line-strong bg-surface pl-9 pr-3 text-sm text-ink-900 placeholder:text-ink-300"
              />
            </div>
          ) : null}

          <Bloque
            titulo="Su trayectoria"
            cuantos={cerradasVistas.length}
            vacio={busca.trim() ? 'Nada coincide con esa búsqueda.' : 'Todavía no ha cumplido ninguna.'}
          >
            {cerradasVistas.map((fila) => (
              <Obligacion key={fila.id} fila={fila} />
            ))}
            {retiradasDeLaPersona.length > 0 ? (
              <button
                type="button"
                onClick={() => setVerRetiradas((actual) => !actual)}
                className="focus-ring mt-2 rounded text-xs font-medium text-ink-500 hover:text-ink-900 hover:underline"
              >
                {verRetiradas ? 'Ocultar las retiradas' : `Ver también las retiradas (${retiradasDeLaPersona.length})`}
              </button>
            ) : null}
          </Bloque>

          {/*
            CERTIFICACIONES: UNA SOLA SECCION, DOS ORIGENES BIEN DISTINTOS (2026-09-30, pedido del
            cliente). Eran dos bloques —«Constancias de la empresa» y «Papeles de un tercero»— y para
            quien pregunta «¿que certificados tiene?» son la misma respuesta. Dentro se separan, porque
            no valen igual: la de la empresa se verifica con su codigo; la de un tercero la respalda
            la ARL o el SENA.
          */}
          <Bloque
            titulo="Certificaciones"
            cuantos={(constancias?.length ?? 0) + (papeles?.length ?? 0)}
            cargando={constancias === null || papeles === null}
            vacio="Ninguna todavía. Las de un tercero se registran con «Registrar certificado externo»."
          >
            {(constancias?.length ?? 0) > 0 ? (
              <OrigenDeCertificacion
                titulo="De la empresa"
                detalle="Emitidas por la plataforma, con código de verificación"
                color="var(--brand-primary)"
              />
            ) : null}
            {(constancias ?? []).map((fila) => (
              <Fila
                key={fila.id}
                icono={Award}
                titulo={fila.activityName}
                tachado={fila.revoked}
                /* EL TIPO VA DELANTE, y sobre todo para una palabra: «Programa». Es lo que explica
                   por qué las formaciones que lo componen no tienen papel propio. */
                detalle={`${fila.typeName ? `${fila.typeName} · ` : ''}Nº ${fila.serialNumber} · ${formatDate(
                  fila.issuedAt,
                )}${fila.validUntil ? ` · vence ${formatDate(fila.validUntil)}` : ''}${
                  fila.hours ? ` · ${fila.hours} h` : ''
                }`}
                pastilla={fila.revoked ? <StatusPill kind="danger" label="REVOCADA" /> : null}
                /*
                  ABRIR Y DESCARGAR, AQUÍ MISMO (2026-09-17, pedido del cliente).

                  El papel se busca para llevárselo —«mándame el certificado de alturas»— y hasta
                  ahora había que salir a Usuarios y abrir un cajón aparte. Una constancia REVOCADA
                  no se ofrece: es evidencia anulada, y bajarla como si valiera es justo lo que la
                  revocación existe para impedir.
                */
                acciones={
                  fila.revoked ? null : (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Abrir la constancia de ${fila.activityName}`}
                        title="Abrir en una pestaña"
                        onClick={() => void abrirConstancia(fila)}
                        loading={abriendo === fila.id}
                      >
                        <ExternalLink size={14} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Descargar la constancia de ${fila.activityName}`}
                        title="Descargar el PDF"
                        onClick={() => void bajarConstancia(fila)}
                        loading={bajando === fila.id}
                      >
                        <Download size={14} />
                      </Button>
                    </>
                  )
                }
              />
            ))}
            {(papeles?.length ?? 0) > 0 ? (
              <OrigenDeCertificacion
                titulo="De un tercero"
                detalle="ARL, SENA u otra entidad: la respalda quien la emitió"
                color="var(--brand-accent)"
              />
            ) : null}
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
      )}

      {/* Registrar el papel de una ARL o del SENA: se mudó aquí desde el menú de la fila de
          Usuarios. Al cerrarlo se recarga la lista, porque convalidar cambia lo que hay arriba. */}
      <PapelesDePersona
        userId={registrandoPapel ? id : null}
        nombre={persona?.fullName ?? ''}
        open={registrandoPapel}
        onOpenChange={(abierto) => {
          if (abierto) return;
          setRegistrandoPapel(false);
          void papelesDePersona(id)
            .then((filas) => setPapeles(filas.filter((papel) => papel.number || papel.fileKey)))
            .catch(() => undefined);
          void todasLasObligacionesDe(id)
            .then(setObligaciones)
            .catch(() => undefined);
        }}
      />
    </div>
  );
}

/** El rotulo que separa los dos origenes de una certificacion: una barra de color y su explicacion. */
function OrigenDeCertificacion({ titulo, detalle, color }: { titulo: string; detalle: string; color: string }) {
  return (
    <div className="flex items-center gap-2.5 pb-1 pt-3 first:pt-0">
      <span aria-hidden="true" className="h-4 w-1 rounded-full" style={{ backgroundColor: color }} />
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-900">{titulo}</p>
      <p className="text-xs text-ink-500">{detalle}</p>
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
  activa = false,
  onClick,
}: {
  valor: number | null;
  etiqueta: string;
  sufijo?: string;
  alarmante?: boolean;
  ayuda?: string;
  /** Si es la vista elegida: se marca con el color de la empresa. */
  activa?: boolean;
  /** Con onClick, la cifra es un filtro (2026-09-30): se pulsa y deja ver solo eso. */
  onClick?: () => void;
}) {
  const Caja = onClick ? 'button' : 'div';
  return (
    <Caja
      {...(onClick ? { type: 'button' as const, onClick, 'aria-pressed': activa } : {})}
      className={cn(
        'card p-4 text-left',
        onClick && 'focus-ring transition-transform duration-150 hover:-translate-y-px',
        alarmante && 'border-danger/30 bg-danger-soft',
      )}
      style={activa ? { boxShadow: '0 0 0 2px var(--brand-primary)' } : undefined}
      title={ayuda ?? (onClick ? (activa ? 'Quitar el filtro' : `Ver solo las ${etiqueta.toLowerCase()}`) : undefined)}
    >
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
    </Caja>
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
      }${fila.cycleNumber > 1 ? ` · ronda ${fila.cycleNumber}` : ''}${fila.waivedReason ? ` · ${fila.waivedReason}` : ''}${
        POR_QUE_RETIRADA[fila.status] ? ` · ${POR_QUE_RETIRADA[fila.status]}` : ''
      }`}
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
  acciones,
}: {
  icono: typeof Award;
  titulo: string;
  detalle: string;
  pastilla?: React.ReactNode;
  tachado?: boolean;
  /** Botones al final de la fila —abrir, descargar—. Van aquí y no en una ventana aparte: un papel
      se busca para llevárselo, y obligar a abrir algo antes de poder bajarlo es un paso de más. */
  acciones?: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2.5 rounded-lg bg-paper px-3.5 py-2.5 transition-colors duration-150 hover:bg-primary-soft">
      <Icono size={15} className="mt-0.5 shrink-0 text-ink-500" strokeWidth={1.75} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className={cn('text-sm text-ink-900', tachado && 'line-through')}>{titulo}</p>
        <p className="mt-0.5 text-xs text-ink-500">{detalle}</p>
      </div>
      {pastilla}
      {acciones ? <div className="flex shrink-0 items-center gap-0.5">{acciones}</div> : null}
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

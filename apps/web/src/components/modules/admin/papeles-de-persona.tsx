'use client';

import { useCallback, useEffect, useState } from 'react';
import { BadgeCheck, ExternalLink } from 'lucide-react';
import { motivoDelError } from '@/lib/api';
import {
  convalidablesDe,
  convalidar,
  guardarPapelDeTercero,
  papelesDePersona,
  type Convalidable,
  type PapelDeTercero,
} from '@/lib/delivery-api';
import { formatDate } from '@/lib/format';
import { Adjuntar } from '@/components/ui/adjuntar';
import { Button } from '@/components/ui/button';
import { Drawer } from '@/components/ui/drawer';
import { EmptyState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toast';

/**
 * EL PAPEL DE UN TERCERO, DESDE LA FICHA DE LA PERSONA (`PENDIENTES` 2.2).
 *
 * ─── POR QUE AQUI, SI YA SE PUEDE EN LA CONVOCATORIA ───
 *
 * Porque **la peticion llega con un nombre, no con una jornada**. El certificado de la ARL aparece
 * en el correo de Gestion Humana quince dias despues, y lo que se sabe es "esto es de Juan": para
 * registrarlo habia que reconstruir a cual de las jornadas del año fue Juan, buscarla entre todas,
 * abrirla y encontrarlo dentro. Eso es pedirle al usuario que haga de indice.
 *
 * Es exactamente el mismo argumento que puso la constancia interna en esta misma pantalla
 * (Decision #128) y por el mismo motivo: *"mandame el certificado de alturas de Juan"*.
 *
 * ─── Y POR QUE IMPORTA QUE SE HAGA ───
 *
 * Si registrarlo cuesta, no se registra. Y sin el papel la obligacion se queda con el vencimiento
 * que CALCULA la recurrencia en vez del que dice el certificado — que es justo lo que el papel viene
 * a corregir (Decision #157). El resultado no es un hueco visible: es una fecha de vencimiento
 * equivocada en el informe, que nadie detecta hasta que caduca una habilitacion legal.
 *
 * ─── LO QUE NO HACE ───
 *
 * No cierra formaciones ni toca la asistencia. Solo se ofrecen las que YA estan cumplidas y llevan
 * papel; el servidor lo vuelve a comprobar (`papel-de-tercero.service.ts`), porque una lista que
 * filtra bien no es una compuerta.
 */
export function PapelesDePersona({
  userId,
  nombre,
  open,
  onOpenChange,
}: {
  userId: string | null;
  nombre: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { showToast } = useToast();
  const [filas, setFilas] = useState<PapelDeTercero[] | null>(null);
  const [borrador, setBorrador] = useState<Record<string, { number: string; validUntil: string; fileKey?: string | null; nombreArchivo?: string }>>({});
  const [guardando, setGuardando] = useState<string | null>(null);
  /*
    LAS FILAS QUE LA PANTALLA NO PIDE, ABIERTAS A MANO (`PENDIENTES` 2.5).

    Si la jornada la dicto la empresa no hay tercero que expida nada, asi que la fila no ofrece los
    campos. Pero eso es un DEFECTO, no una compuerta: hay tenants —un centro de entrenamiento
    acreditado— donde «propios» y «certificado oficial» conviven, y el servidor sigue aceptandolo.
    Este estado es la puerta de escape, y va vacia a proposito: se abre a peticion, una fila cada vez.
  */
  const [abiertas, setAbiertas] = useState<Record<string, boolean>>({});

  /*
    LA VIA C: quien llega YA certificado de otro empleo. Va en este mismo cajon porque es la misma
    conversacion —"este es el papel de Juan"— y lo que cambia es de donde viene el papel. Ver la
    nota de la seccion, mas abajo.
  */
  const [convalidables, setConvalidables] = useState<Convalidable[]>([]);
  const [nuevos, setNuevos] = useState<
    Record<
      string,
      { number: string; issuer: string; validUntil: string; reason: string; fileKey?: string; nombreArchivo?: string }
    >
  >({});
  const [convalidando, setConvalidando] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    if (!userId) return;
    setFilas(null);
    try {
      const [datos, pendientes] = await Promise.all([papelesDePersona(userId), convalidablesDe(userId)]);
      setFilas(datos);
      setConvalidables(pendientes);
      setNuevos({});
      /*
        EL BORRADOR ARRANCA CON LO GUARDADO, no en blanco. Si se abriera vacio, quien entra a
        corregir una fecha borraria sin querer el numero que ya estaba — es el mismo fallo que los
        estados de asistencia sin sembrar, que ya mordio una vez.
      */
      setBorrador(
        Object.fromEntries(
          datos.map((f) => [
            f.enrollmentId,
            {
              number: f.number ?? '',
              validUntil: f.validUntil ? f.validUntil.slice(0, 10) : '',
              fileKey: f.fileKey,
            },
          ]),
        ),
      );
    } catch (error) {
      showToast({ kind: 'danger', title: 'No se pudieron cargar los papeles', description: motivoDelError(error) });
      setFilas([]);
    }
  }, [userId, showToast]);

  useEffect(() => {
    if (open) void cargar();
  }, [open, cargar]);

  async function guardar(fila: PapelDeTercero) {
    const dato = borrador[fila.enrollmentId];
    if (!dato?.number.trim()) return;
    setGuardando(fila.enrollmentId);
    try {
      await guardarPapelDeTercero(fila.enrollmentId, {
        number: dato.number.trim(),
        validUntil: dato.validUntil ? dato.validUntil : null,
        fileKey: dato.fileKey ?? null,
      });
      showToast({
        kind: 'success',
        title: 'Papel registrado',
        description: dato.validUntil
          ? `Su formación vuelve a deberse el ${dato.validUntil}, que es lo que dice el certificado.`
          : 'Sin fecha de vencimiento: la obligación vuelve a lo que calcule su recurrencia.',
      });
      await cargar();
    } catch (error) {
      showToast({ kind: 'danger', title: 'No se pudo guardar', description: motivoDelError(error) });
    } finally {
      setGuardando(null);
    }
  }

  async function aceptar(fila: Convalidable) {
    const dato = nuevos[fila.assignmentId];
    if (!dato) return;
    setConvalidando(fila.assignmentId);
    try {
      await convalidar(fila.assignmentId, {
        number: dato.number.trim(),
        issuer: dato.issuer.trim(),
        validUntil: dato.validUntil,
        ...(dato.fileKey ? { fileKey: dato.fileKey } : {}),
        reason: dato.reason.trim(),
      });
      showToast({
        kind: 'success',
        title: `${fila.actividad} queda cumplida`,
        description: `Con el papel de otro empleo, vigente hasta el ${dato.validUntil}. Queda tu nombre y el motivo.`,
      });
      await cargar();
    } catch (error) {
      showToast({ kind: 'danger', title: 'No se pudo convalidar', description: motivoDelError(error) });
    } finally {
      setConvalidando(null);
    }
  }

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title="Papeles de un tercero"
      description={`${nombre} · certificados que expide la ARL u otro organismo`}
    >
      {filas === null ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : filas.length === 0 && convalidables.length === 0 ? (
        /*
          EL VACIO MIRA LAS DOS LISTAS. Antes solo miraba la de arriba, asi que a alguien que llega
          certificado y no ha cursado nada aqui le decia "no tiene nada" con un formulario justo
          debajo para registrar su papel. Un vacio que se contradice consigo mismo es peor que no
          tenerlo.
        */
        <EmptyState
          icon={BadgeCheck}
          title="No tiene formaciones que lleven papel de un tercero"
          description="Aquí solo salen las que se acreditan con un certificado externo, como una recertificación: las que ya cumplió, y las que puede traer certificadas de otro empleo."
        />
      ) : filas.length === 0 ? null : (
        <div className="space-y-4">
          <p className="text-sm text-ink-500">
            El certificado suele llegar días después de la jornada. Regístralo aquí y su{' '}
            <strong className="font-medium text-ink-700">fecha de vencimiento manda</strong>: es la que decide cuándo
            vuelve a deberse la formación.
          </p>
          {filas.map((fila) => {
            const dato = borrador[fila.enrollmentId] ?? { number: '', validUntil: '' };
            /*
              CUANDO SE PIDE EL NUMERO. Siempre que la jornada la dictara alguien de fuera; y tambien
              cuando YA hay un papel guardado, se dictara quien se dictara: esconder un dato que
              alguien registro seria peor que no haberlo pedido — no se podria ni corregir ni ver.
            */
            const pide = fila.laDictaUnTercero || Boolean(fila.number) || abiertas[fila.enrollmentId];
            const cambio =
              dato.number.trim() !== (fila.number ?? '') ||
              dato.validUntil !== (fila.validUntil ? fila.validUntil.slice(0, 10) : '') ||
              (dato.fileKey ?? null) !== (fila.fileKey ?? null);
            return (
              <div key={fila.enrollmentId} className="card p-4">
                <div className="mb-3">
                  {/*
                    ABRIR LA FORMACION Y LA JORNADA, que el cliente pidio expresamente: *"desde esa
                    interfaz debe poder abrir esa formacion o convocatoria"*. Sin esto, quien
                    sospecha que una fila esta de mas —como paso con una induccion especifica
                    pidiendo papel de un tercero— no tiene como comprobarlo.

                    En pestaña nueva a proposito: esto es una gaveta con borradores a medio
                    escribir, y navegar la cerraria perdiendo lo tecleado.
                  */}
                  <a
                    href={`/contenido-formativo/${fila.actividadId}`}
                    target="_blank"
                    rel="noreferrer"
                    className="group inline-flex items-center gap-1.5 font-medium text-ink-900 hover:text-primary"
                  >
                    {fila.actividad}
                    <ExternalLink className="h-3.5 w-3.5 text-ink-300 group-hover:text-primary" aria-hidden />
                  </a>
                  <p className="text-xs text-ink-500">
                    {fila.tipo ? `${fila.tipo} · ` : ''}
                    Cumplida el {fila.completedAt ? formatDate(fila.completedAt) : '—'}
                    {fila.quienLaDicto ? ` · la dictó ${fila.quienLaDicto}` : ''}
                    {fila.convocatoria ? (
                      <>
                        {' · '}
                        <a
                          href={`/convocatorias/${fila.convocatoria.id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="underline decoration-line underline-offset-2 hover:text-primary"
                        >
                          {fila.convocatoria.code}
                        </a>
                      </>
                    ) : null}
                  </p>
                  {/*
                    DE DONDE SALE LA FILA. La pregunta que nadie podia contestar sin abrir cuatro
                    pantallas —ficha, ver que esta en `null`, Configuracion, tipo— y que ademas dice
                    donde se cambia si sobra.
                  */}
                  <p className="mt-0.5 text-xs text-ink-500">
                    {fila.origen === 'HEREDADO'
                      ? `Lo pide su tipo${fila.tipo ? `, «${fila.tipo}»` : ''} · se cambia en Configuración → Tipos de formación`
                      : 'Lo pide su ficha · se cambia en la formación'}
                  </p>
                </div>
                {!pide ? (
                  /*
                    SI LA DICTA LA EMPRESA, NO HAY TERCERO QUE CERTIFIQUE — el mismo criterio que la
                    lista de asistencia, importado del servidor y no vuelto a escribir aqui.

                    Se explica en vez de ocultarse: la fila sigue saliendo porque la formacion SI
                    lleva papel, y desaparecerla dejaria a quien la busca sin saber si es que no
                    existe o si es que el sistema la escondio. Y con la puerta de escape al lado,
                    porque esto es un defecto y no una compuerta.
                  */
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-paper px-3 py-2 text-xs text-ink-500">
                    <span>
                      La dictó la empresa: no hay un tercero que expida el papel de esta jornada.
                    </span>
                    <button
                      type="button"
                      className="font-medium text-primary underline underline-offset-2"
                      onClick={() => setAbiertas({ ...abiertas, [fila.enrollmentId]: true })}
                    >
                      Registrarlo de todos modos
                    </button>
                  </div>
                ) : null}
                <div className={`flex-wrap items-end gap-3 ${pide ? 'flex' : 'hidden'}`}>
                  <Field
                    htmlFor={`papel-num-${fila.enrollmentId}`}
                    label="No. de certificado"
                    hint={fila.issuer ? `Lo expide ${fila.issuer}` : undefined}
                  >
                    <Input
                      id={`papel-num-${fila.enrollmentId}`}
                      className="h-9 w-[12rem] rounded-lg"
                      value={dato.number}
                      onChange={(e) =>
                        setBorrador({ ...borrador, [fila.enrollmentId]: { ...dato, number: e.target.value } })
                      }
                    />
                  </Field>
                  <Field
                    htmlFor={`papel-vence-${fila.enrollmentId}`}
                    label="Vence el"
                    ayuda="Lo que dice el papel. Esa fecha MANDA sobre la que calcularía la recurrencia: es la que decide cuándo vuelve a deberse la formación."
                  >
                    <Input
                      id={`papel-vence-${fila.enrollmentId}`}
                      type="date"
                      className="h-9 w-[10.5rem] rounded-lg"
                      // No puede vencer antes de haberse cumplido: el servidor lo rechaza igual.
                      min={fila.completedAt ? fila.completedAt.slice(0, 10) : undefined}
                      value={dato.validUntil}
                      onChange={(e) =>
                        setBorrador({ ...borrador, [fila.enrollmentId]: { ...dato, validUntil: e.target.value } })
                      }
                    />
                  </Field>
                  <div className="pb-1.5">
                    <span className="mb-1.5 block text-[13px] font-medium text-ink-700">Escaneo</span>
                    <Adjuntar
                      etiqueta={`el certificado de ${fila.actividad}`}
                      valor={dato.fileKey}
                      nombre={dato.nombreArchivo ?? (dato.fileKey ? 'Adjunto' : undefined)}
                      onSubido={(ev) =>
                        setBorrador({
                          ...borrador,
                          [fila.enrollmentId]: { ...dato, fileKey: ev.key, nombreArchivo: ev.originalName },
                        })
                      }
                      onQuitar={() =>
                        setBorrador({ ...borrador, [fila.enrollmentId]: { ...dato, fileKey: null, nombreArchivo: undefined } })
                      }
                    />
                  </div>
                  {/*
                    EL BOTON DICE POR QUE NO SE PUEDE, en vez de apagarse sin más. Quien acaba de
                    adjuntar el escaneo no tiene forma de adivinar que falta el número — y el número
                    lo exige el servidor: un certificado sin él no se puede rastrear.
                  */}
                  <Button
                    size="sm"
                    className="mb-0.5"
                    disabled={!dato.number.trim() || !cambio}
                    loading={guardando === fila.enrollmentId}
                    onClick={() => void guardar(fila)}
                  >
                    {!dato.number.trim() && (dato.fileKey || dato.validUntil) ? 'Falta el número' : 'Guardar'}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {/*
        LA VIA C, EN LA MISMA GAVETA Y DEBAJO (2026-09-08).

        Aqui y no en otra pantalla porque es la misma conversacion: "este es el papel de Juan". Lo
        que cambia es de donde viene el papel — de una jornada nuestra (arriba) o de otro empleo
        (aqui) — y esa diferencia importa, por eso van separadas y no mezcladas en una lista.

        Debajo a proposito: registrar el papel de algo que SI hizo aqui es lo de todos los dias;
        aceptar el de otra empresa es la excepcion, y ponerla primero invitaria a usarla por defecto.

        Si no sale nada es que ninguna de sus formaciones pendientes admite convalidacion, y eso es
        una respuesta: hay que convocarla.
      */}
      {convalidables.length > 0 ? (
        <div className="mt-6 border-t border-line pt-5">
          <h3 className="font-display text-sm font-semibold text-ink-900">Ya viene certificada de otro empleo</h3>
          <p className="mb-4 mt-1 text-sm text-ink-500">
            Solo salen las formaciones cuyo papel es <strong className="font-medium text-ink-700">transferible</strong>.
            Aceptarlo la da por <strong className="font-medium text-ink-700">cumplida</strong>, no por eximida: la hizo,
            en otro sitio.
          </p>
          <div className="space-y-4">
            {convalidables.map((fila) => {
              const dato = nuevos[fila.assignmentId] ?? { number: '', issuer: '', validUntil: '', reason: '' };
              const listo =
                dato.number.trim().length > 0 &&
                dato.issuer.trim().length > 1 &&
                dato.validUntil !== '' &&
                dato.reason.trim().length >= 15;
              return (
                <div key={fila.assignmentId} className="card p-4">
                  <a
                    href={`/contenido-formativo/${fila.actividadId}`}
                    target="_blank"
                    rel="noreferrer"
                    className="group inline-flex items-center gap-1.5 font-medium text-ink-900 hover:text-primary"
                  >
                    {fila.actividad}
                    <ExternalLink className="h-3.5 w-3.5 text-ink-300 group-hover:text-primary" aria-hidden />
                  </a>
                  <p className="mb-3 text-xs text-ink-500">
                    {fila.tipo ? `${fila.tipo} · ` : ''}
                    Pendiente{fila.dueAt ? ` · vence el ${formatDate(fila.dueAt)}` : ''}
                  </p>
                  <div className="flex flex-wrap items-end gap-3">
                    <Field htmlFor={`cv-num-${fila.assignmentId}`} label="No. de certificado" required>
                      <Input
                        id={`cv-num-${fila.assignmentId}`}
                        className="h-9 w-[11rem] rounded-lg"
                        value={dato.number}
                        onChange={(e) => setNuevos({ ...nuevos, [fila.assignmentId]: { ...dato, number: e.target.value } })}
                      />
                    </Field>
                    <Field htmlFor={`cv-emisor-${fila.assignmentId}`} label="Quién lo expidió" required>
                      <Input
                        id={`cv-emisor-${fila.assignmentId}`}
                        className="h-9 w-[12rem] rounded-lg"
                        placeholder="ARL Sura, centro de entrenamiento..."
                        value={dato.issuer}
                        onChange={(e) => setNuevos({ ...nuevos, [fila.assignmentId]: { ...dato, issuer: e.target.value } })}
                      />
                    </Field>
                    <Field
                      htmlFor={`cv-vence-${fila.assignmentId}`}
                      label="Vence el"
                      required
                      ayuda="Obligatoria aquí, al revés que tras una jornada: allí el papel puede llegar después y la recurrencia sirve de red mientras tanto. Aquí el papel es la ÚNICA evidencia, y sin su fecha no hay nada que diga cuándo caduca lo que se está aceptando. Un papel ya vencido se rechaza."
                    >
                      <Input
                        id={`cv-vence-${fila.assignmentId}`}
                        type="date"
                        className="h-9 w-[10.5rem] rounded-lg"
                        // No se acepta uno ya vencido: el servidor lo rechaza igual.
                        min={new Date().toISOString().slice(0, 10)}
                        value={dato.validUntil}
                        onChange={(e) => setNuevos({ ...nuevos, [fila.assignmentId]: { ...dato, validUntil: e.target.value } })}
                      />
                    </Field>
                    <div className="pb-1.5">
                      <span className="mb-1.5 block text-[13px] font-medium text-ink-700">Escaneo</span>
                      <Adjuntar
                        etiqueta={`el certificado de ${fila.actividad}`}
                        valor={dato.fileKey}
                        nombre={dato.nombreArchivo}
                        onSubido={(ev) =>
                          setNuevos({
                            ...nuevos,
                            [fila.assignmentId]: { ...dato, fileKey: ev.key, nombreArchivo: ev.originalName },
                          })
                        }
                        onQuitar={() =>
                          setNuevos({ ...nuevos, [fila.assignmentId]: { ...dato, fileKey: undefined, nombreArchivo: undefined } })
                        }
                      />
                    </div>
                  </div>
                  <Field
                    htmlFor={`cv-motivo-${fila.assignmentId}`}
                    label="Por qué se acepta"
                    required
                    className="mt-3"
                    hint="Mínimo 15 caracteres. Queda en la auditoría con tu nombre."
                    ayuda="Aceptar el papel de otra empresa sustituye la evidencia propia. Seis meses después, cuando un auditor pregunte por qué esta persona no aparece en ninguna lista de asistencia, la respuesta tiene que estar escrita aquí — un campo que admite 'ok' no es una explicación."
                  >
                    <Textarea
                      id={`cv-motivo-${fila.assignmentId}`}
                      rows={2}
                      placeholder="Trae certificado de alturas de su empleo anterior, expedido por ARL Sura y vigente"
                      value={dato.reason}
                      onChange={(e) => setNuevos({ ...nuevos, [fila.assignmentId]: { ...dato, reason: e.target.value } })}
                    />
                  </Field>
                  <div className="mt-3 flex justify-end">
                    <Button
                      size="sm"
                      disabled={!listo}
                      loading={convalidando === fila.assignmentId}
                      onClick={() => void aceptar(fila)}
                    >
                      Darla por cumplida
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </Drawer>
  );
}

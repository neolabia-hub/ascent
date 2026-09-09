'use client';

import { ArrowLeft, BadgeCheck, Eye, Plus, Power, Trash2, Upload } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ApiError, motivoDelError } from '@/lib/api';
import { uploadMedia } from '@/lib/catalog-api';
import {
  abrirVistaPrevia,
  createTemplate,
  deleteTemplate,
  getTemplate,
  listTemplates,
  saveTemplate,
  CAMPOS_POR_DEFECTO,
  type CampoClave,
  type CampoConstancia,
  type CertificateFields,
  type FirmanteConstancia,
  type TemplateDetail,
  type TemplateRow,
} from '@/lib/certificates-api';
import { useMediaUrl } from '@/lib/use-media-url';
import { Button } from '@/components/ui/button';
import { cn } from '@/components/ui/cn';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';

/**
 * EL DISENO DE LA CONSTANCIA (Decision #112).
 *
 * ─── LO QUE EL CLIENTE ESPERA HACER AQUI ───
 *
 * "Nosotros disenamos el certificado y subimos la firma de los responsables". Eso, literalmente:
 * traen un arte hecho en Canva o Illustrator y las rubricas escaneadas. NO vienen a escribir HTML
 * —el plan original guardaba `htmlTemplate` y eso habria acabado escribiendolo nosotros cada vez
 * que pidieran mover un logo—.
 *
 * Asi que aqui se sube el ARTE y se COLOCAN los campos encima arrastrandolos. El fondo que se ve
 * en pantalla es el mismo que va al PDF, y las posiciones se guardan en PORCENTAJE, asi que lo que
 * se coloca es exactamente lo que sale impreso.
 *
 * ─── POR QUE SE ARRASTRA Y NO SE ESCRIBEN COORDENADAS ───
 *
 * Se penso en dos campos numericos por elemento. Nadie sabe que significa "x: 47.5" mirando su
 * propio diseño, y acertar exigiria una decena de vistas previas por campo. Arrastrando, la
 * pregunta "¿donde va el nombre?" se contesta senalando, que es como se contesta de verdad.
 */
export default function ConstanciasPage() {
  const { showToast } = useToast();
  const [plantillas, setPlantillas] = useState<TemplateRow[] | null>(null);
  const [abierta, setAbierta] = useState<TemplateDetail | null>(null);

  useEffect(() => {
    void recargar();
  }, []);

  async function recargar() {
    const filas = await listTemplates().catch(() => []);
    setPlantillas(filas);
  }

  async function abrir(id: string) {
    // El motivo se guarda al vuelo: `.catch(() => null)` lo perdia una linea antes del aviso.
    let fallo: unknown = null;
    const detalle = await getTemplate(id).catch((e: unknown) => {
      fallo = e;
      return null;
    });
    if (!detalle) {
      showToast({ kind: 'danger', title: 'No se pudo abrir la plantilla', description: motivoDelError(fallo) });
      return;
    }
    // Una plantilla creada antes de que existiera la colocacion trae `{}`: se rellena con la de
    // por defecto para que la pantalla no salga sin nada que arrastrar.
    setAbierta({
      ...detalle,
      fields: detalle.fields && Object.keys(detalle.fields).length > 0 ? detalle.fields : CAMPOS_POR_DEFECTO,
      signers: detalle.signers ?? [],
    });
  }

  async function crear() {
    // El motivo se guarda al vuelo: `.catch(() => null)` lo perdia una linea antes del aviso.
    let falloAlCrear: unknown = null;
    const creada = await createTemplate({
      name: 'Constancia de formación',
      backgroundKey: null,
      landscape: true,
      fields: CAMPOS_POR_DEFECTO,
      signers: [],
      active: false,
    }).catch((e: unknown) => {
      falloAlCrear = e;
      return null;
    });
    if (!creada) {
      showToast({ kind: 'danger', title: 'No se pudo crear', description: motivoDelError(falloAlCrear) });
      return;
    }
    await recargar();
    void abrir(creada.id);
  }

  if (abierta) {
    return (
      <Editor
        plantilla={abierta}
        onCerrar={() => {
          setAbierta(null);
          void recargar();
        }}
      />
    );
  }

  return (
    <div className="max-w-3xl">
      <Link href="/configuracion" className="focus-ring mb-4 inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-700">
        <ArrowLeft size={14} />
        Configuración
      </Link>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-[28px] font-semibold text-ink-900">Constancias</h1>
          <p className="mt-1 text-sm text-ink-500">
            El diseño del papel que recibe quien termina una formacion. Sube tu arte y coloca los datos encima.
          </p>
        </div>
        <Button onClick={() => void crear()} glow>
          <Plus className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
          Nueva
        </Button>
      </div>

      {/*
        QUE FORMACIONES LA EMITEN se decide en OTRO sitio, y conviene decirlo aqui: quien entra a
        disenar la constancia da por hecho que aqui tambien elige quien la recibe, y no encontrarlo
        es de las cosas que hacen abrir un ticket.
      */}
      <p className="mt-5 rounded-lg border border-line bg-paper px-3.5 py-3 text-sm leading-relaxed text-ink-700">
        Que formaciones entregan constancia no se decide aqui, sino en{' '}
        <Link href="/configuracion/tipos-de-formacion" className="focus-ring font-medium text-primary hover:underline">
          Tipos de formacion
        </Link>
        . Una pildora de tres minutos normalmente no acredita nada; una induccion si.
      </p>

      <div className="mt-6 space-y-2">
        {plantillas === null ? (
          <Skeleton className="h-24 w-full rounded-xl" />
        ) : plantillas.length === 0 ? (
          <div className="card p-8 text-center">
            <p className="font-display text-base font-semibold text-ink-900">Todavía no hay ninguna</p>
            <p className="mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-ink-500">
              Sin una plantilla activa no se emiten constancias. La formacion se termina igual y queda registrada;
              simplemente no sale el papel.
            </p>
          </div>
        ) : (
          plantillas.map((fila) => (
            <button
              key={fila.id}
              type="button"
              onClick={() => void abrir(fila.id)}
              className="focus-ring flex w-full items-center gap-4 rounded-xl border border-line bg-surface p-4 text-left shadow-card transition-all duration-150 hover:-translate-y-px hover:shadow-card-hover"
            >
              <Miniatura backgroundKey={fila.backgroundKey} landscape={fila.landscape} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-display text-[15px] font-semibold text-ink-900">{fila.name}</p>
                <p className="mt-0.5 text-xs text-ink-500">
                  Versión {fila.versionNumber} · {fila.landscape ? 'Horizontal' : 'Vertical'}
                </p>
              </div>
              {fila.active ? (
                <span className="rounded-full bg-ok-soft px-2.5 py-1 text-[11px] font-semibold text-ok">EN USO</span>
              ) : (
                <span className="rounded-full bg-paper px-2.5 py-1 text-[11px] font-semibold text-ink-500">Inactiva</span>
              )}
            </button>
          ))
        )}
      </div>
    </div>
  );
}

function Miniatura({ backgroundKey, landscape }: { backgroundKey: string | null; landscape: boolean }) {
  const url = useMediaUrl(backgroundKey);
  return (
    <div
      className={cn(
        'shrink-0 overflow-hidden rounded-lg border border-line bg-paper',
        landscape ? 'h-12 w-[68px]' : 'h-[68px] w-12',
      )}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="h-full w-full object-cover" />
      ) : null}
    </div>
  );
}

/** El orden en que se listan y se pintan. Fijo: una lista que se reordena sola es imposible de usar. */
const CLAVES: CampoClave[] = [
  'nombre',
  'documento',
  'cargo',
  'area',
  'formacion',
  'tipo',
  'horas',
  'fecha',
  'vence',
  'serial',
  'codigo',
  'nota',
  'qr',
];

/** Como se llama cada campo en la lista. La clave cruda ("qr", "vence") no se enseña. */
const NOMBRES: Record<CampoClave, string> = {
  nombre: 'Nombre',
  documento: 'Documento',
  cargo: 'Cargo',
  area: 'Área',
  formacion: 'Formación',
  tipo: 'Tipo de formación',
  horas: 'Horas',
  fecha: 'Fecha en que la curso',
  vence: 'Vigente hasta',
  serial: 'Número de serie',
  codigo: 'Código de verificación',
  nota: 'Calificación',
  qr: 'Código QR',
};

/** Lo que se escribe en cada campo mientras se coloca. Es texto de ejemplo, no datos reales. */
const ETIQUETAS: Record<CampoClave, string> = {
  nombre: 'MARIA FERNANDA RODRIGUEZ',
  documento: 'CC 1098765432',
  cargo: 'Auxiliar de Bodega',
  area: 'Operaciones',
  formacion: 'Trabajo seguro en alturas',
  tipo: 'Capacitación del plan',
  horas: '8 horas',
  fecha: '15 de marzo de 2026',
  vence: 'Vigente hasta el 15 de marzo de 2027',
  serial: 'CERT-2026-000123',
  codigo: 'K7M2P-9XQ4T-BC3JH',
  nota: 'Calificación: 95%',
  qr: 'QR',
};

function Editor({ plantilla, onCerrar }: { plantilla: TemplateDetail; onCerrar: () => void }) {
  const { showToast } = useToast();
  const [nombre, setNombre] = useState(plantilla.name);
  const [fondo, setFondo] = useState(plantilla.backgroundKey);
  const [landscape, setLandscape] = useState(plantilla.landscape);
  const [campos, setCampos] = useState<CertificateFields>(plantilla.fields);
  const [firmas, setFirmas] = useState<FirmanteConstancia[]>(plantilla.signers);
  const [activa, setActiva] = useState(plantilla.active);
  const [guardando, setGuardando] = useState(false);
  const [seleccion, setSeleccion] = useState<CampoClave | null>('nombre');

  const fondoUrl = useMediaUrl(fondo);
  const lienzo = useRef<HTMLDivElement | null>(null);

  /*
    EL ALTO REAL DEL LIENZO, EN PIXELES (Decision #113).

    `size` es un porcentaje del ALTO DE LA HOJA, que es lo que significa en el PDF. Estaba escrito
    como `fontSize: ${size}%` y eso en CSS es otra cosa completamente: un porcentaje del tamano de
    letra HEREDADO, no del alto del contenedor. El resultado era que mover el control no cambiaba
    casi nada en pantalla y solo se veia el tamaño de verdad al generar la vista previa — que es
    justo lo que esta pantalla existe para evitar.

    Con el alto medido, `(size/100) * alto` da los mismos pixeles que `(size/100) * altoDeHoja` da
    puntos en el PDF. Lo que se ve es lo que sale.
  */
  const [altoLienzo, setAltoLienzo] = useState(0);
  useEffect(() => {
    const nodo = lienzo.current;
    if (!nodo) return;
    // `ResizeObserver` y no un `onResize` de ventana: el lienzo tambien cambia de alto cuando se
    // pasa de horizontal a vertical, sin que la ventana se mueva.
    const observador = new ResizeObserver(([entrada]) => setAltoLienzo(entrada?.contentRect.height ?? 0));
    observador.observe(nodo);
    return () => observador.disconnect();
  }, [landscape]);
  const inputFondo = useRef<HTMLInputElement | null>(null);

  async function guardar() {
    setGuardando(true);
    try {
      await saveTemplate(plantilla.id, {
        name: nombre,
        backgroundKey: fondo,
        landscape,
        fields: campos,
        signers: firmas,
        active: activa,
      });
      showToast({ kind: 'success', title: 'Guardado' });
    } catch (error) {
      showToast({
        kind: 'danger',
        title: 'No se pudo guardar',
        description: error instanceof ApiError ? error.message : undefined,
      });
      // Si el servidor rechazo activarla —falta el arte— la pantalla no puede quedarse diciendo
      // que esta activa: seria mentir sobre lo que hay guardado.
      if (error instanceof ApiError && error.code === 'TEMPLATE_WITHOUT_BACKGROUND') setActiva(false);
    } finally {
      setGuardando(false);
    }
  }

  /**
   * ARRASTRAR UN CAMPO. Las coordenadas se calculan contra el LIENZO, no contra la ventana: el
   * lienzo cambia de tamaño con el ancho de la pantalla y lo que se guarda es un porcentaje.
   *
   * Se acota a 0-100 porque el raton puede salirse del lienzo mientras se arrastra, y un campo
   * colocado en -12% no se dibujaria en el PDF: desapareceria sin explicacion.
   */
  function arrastrar(evento: React.PointerEvent, alMover: (x: number, y: number) => void) {
    evento.preventDefault();
    const nodo = lienzo.current;
    if (!nodo) return;

    const mover = (e: PointerEvent) => {
      const caja = nodo.getBoundingClientRect();
      // Se acota a 0-100: el raton se sale del lienzo mientras se arrastra, y un campo en -12% no
      // se dibujaria en el PDF — desapareceria sin explicacion.
      alMover(
        redondear(Math.min(100, Math.max(0, ((e.clientX - caja.left) / caja.width) * 100))),
        redondear(Math.min(100, Math.max(0, ((e.clientY - caja.top) / caja.height) * 100))),
      );
    };
    const soltar = () => {
      window.removeEventListener('pointermove', mover);
      window.removeEventListener('pointerup', soltar);
    };
    window.addEventListener('pointermove', mover);
    window.addEventListener('pointerup', soltar);
  }

  function iniciarArrastre(clave: CampoClave, evento: React.PointerEvent) {
    setSeleccion(clave);
    arrastrar(evento, (x, y) =>
      setCampos((previos: CertificateFields) => {
        const campo = previos[clave];
        return campo ? { ...previos, [clave]: { ...campo, x, y } } : previos;
      }),
    );
  }

  function arrastrarFirma(indice: number, evento: React.PointerEvent) {
    setSeleccion(null);
    arrastrar(evento, (x, y) => setFirmas((previas) => previas.map((f, i) => (i === indice ? { ...f, x, y } : f))));
  }

  const campoSel = seleccion ? campos[seleccion] : undefined;

  function ajustar(cambio: Partial<CampoConstancia>) {
    if (!seleccion) return;
    setCampos((previos: CertificateFields) => {
      const campo = previos[seleccion];
      if (!campo) return previos;
      return { ...previos, [seleccion]: { ...campo, ...cambio } };
    });
  }

  /*
    CAMBIAR LA ALINEACION SIN QUE EL TEXTO SE MUEVA (Decision #113).

    El cliente lo describio como "izquierda y derecha hacen lo contrario", y el diagnostico es mas
    sutil que un signo cambiado: `x` es un punto de ANCLAJE, y lo que significa depende de la
    alineacion. Con "izquierda" el texto EMPIEZA ahi; con "derecha" TERMINA ahi. Asi que al pulsar
    "derecha" el texto saltaba hacia la izquierda —correcto segun el modelo, y exactamente al reves
    de lo que espera cualquiera que haya usado un editor—.

    La solucion no es invertir nada: es COMPENSAR `x` con el ancho real del texto, de forma que al
    cambiar la alineacion el texto se quede visualmente donde estaba. Entonces la alineacion pasa a
    significar lo unico que de verdad hace falta que signifique: hacia donde CRECE el texto cuando
    el nombre es mas largo o mas corto que el del ejemplo.

    El ancho se mide del elemento pintado, no se estima: un nombre en negrita mide distinto.
  */
  function alinear(nuevo: 'left' | 'center' | 'right') {
    if (!seleccion) return;
    const campo = campos[seleccion];
    const caja = lienzo.current?.getBoundingClientRect();
    const nodo = lienzo.current?.querySelector<HTMLElement>(`[data-campo="${seleccion}"]`);
    if (!campo || !caja || !nodo || caja.width === 0) {
      ajustar({ align: nuevo });
      return;
    }

    // Donde esta el borde IZQUIERDO del texto ahora mismo, en porcentaje del lienzo.
    const anchoPct = (nodo.getBoundingClientRect().width / caja.width) * 100;
    const desplazamiento = { left: 0, center: 0.5, right: 1 } as const;
    const izquierdaActual = campo.x - desplazamiento[campo.align] * anchoPct;
    const nuevaX = izquierdaActual + desplazamiento[nuevo] * anchoPct;

    ajustar({ align: nuevo, x: redondear(Math.min(100, Math.max(0, nuevaX))) });
  }

  return (
    <div className="max-w-5xl">
      <button onClick={onCerrar} className="focus-ring mb-4 inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-700">
        <ArrowLeft size={14} />
        Constancias
      </button>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <Field htmlFor="tpl-name" label="Nombre de la plantilla" className="min-w-[260px] flex-1">
          <Input id="tpl-name" value={nombre} maxLength={120} onChange={(e) => setNombre(e.target.value)} />
        </Field>
        <div className="flex gap-2">
          {/*
            BORRAR VA AQUI, con el resto de acciones de la plantilla (Decision #113). Estaba al
            final de la pagina, debajo del panel de firmas: para encontrarlo habia que desplazarse
            por toda la pantalla de colocacion, y una accion que no se encuentra es una accion que
            no existe. Se queda discreto —icono, sin relleno— porque no es lo que se viene a hacer.
          */}
          <Button
            variant="ghost"
            className="text-danger"
            aria-label="Borrar plantilla"
            title="Borrar plantilla"
            onClick={async () => {
              try {
                await deleteTemplate(plantilla.id);
                onCerrar();
              } catch (error) {
                showToast({
                  kind: 'danger',
                  title: 'No se pudo borrar',
                  description: error instanceof ApiError ? error.message : undefined,
                });
              }
            }}
          >
            <Trash2 className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          </Button>
          <Button variant="outline" onClick={() => void abrirVistaPrevia(plantilla.id)}>
            <Eye className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            Vista previa
          </Button>
          <Button onClick={() => void guardar()} loading={guardando} glow>
            Guardar
          </Button>
        </div>
      </div>

      {/*
        LA VISTA PREVIA SE GENERA EN EL SERVIDOR, con el mismo codigo que dibuja las constancias de
        verdad. Es la unica forma de que lo que se ve sea lo que se entrega: una previsualizacion
        hecha en HTML aqui seria una segunda implementacion del mismo dibujo, y en cuanto una de las
        dos cambiara empezaria a mentir.

        Por eso hay que GUARDAR antes de previsualizar, y por eso el aviso.
      */}
      <p className="mt-1 text-xs text-ink-500">
        La vista previa usa lo ultimo guardado y la dibuja el mismo codigo que emite las constancias reales.
      </p>

      {/*
        ACTIVAR NO ES UNA CASILLA MAS (Decision #113).

        Era un `<input type="checkbox">` perdido entre los botones de subir el diseño, y es la
        decision mas importante de la pantalla: activar significa "esto es lo que se le entrega a la
        gente a partir de ahora". Una casilla de 16 px no dice eso.

        Ahora es una franja con estado: dice si se esta usando o no, QUE implica, y el boton dice el
        verbo. Y cuando falta el arte lo explica en vez de dejar un boton apagado sin motivo —el
        servidor lo rechaza igual, pero enterarse al guardar es enterarse tarde—.
      */}
      <div
        className={cn(
          'mt-6 flex flex-wrap items-center gap-4 rounded-2xl border p-4',
          activa ? 'border-transparent' : 'border-line bg-paper',
        )}
        style={activa ? { backgroundColor: 'var(--brand-primary-soft)' } : undefined}
      >
        <span
          aria-hidden="true"
          className={cn(
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl',
            activa ? 'text-white' : 'bg-surface text-ink-500',
          )}
          style={activa ? { backgroundColor: 'var(--brand-primary)' } : undefined}
        >
          {activa ? <BadgeCheck className="h-6 w-6" strokeWidth={1.75} /> : <Power className="h-5 w-5" strokeWidth={1.75} />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-[15px] font-semibold text-ink-900">
            {activa ? 'Es la constancia que se entrega' : 'No se esta usando'}
          </p>
          <p className="mt-0.5 text-sm leading-relaxed text-ink-500">
            {activa
              ? 'Quien termine una formación que acredite recibirá este diseño.'
              : fondo
                ? 'Actívala para que sea la que reciba la gente. Solo puede haber una en uso.'
                : 'Sube el diseño antes de poder usarla.'}
          </p>
        </div>
        <Button variant={activa ? 'outline' : 'primary'} disabled={!fondo && !activa} onClick={() => setActiva((v) => !v)} glow={!activa && !!fondo}>
          {activa ? 'Dejar de usarla' : 'Usar esta plantilla'}
        </Button>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_280px]">
        {/* ─────────────── El lienzo ─────────────── */}
        <div>
          <div
            ref={lienzo}
            className={cn(
              'relative w-full select-none overflow-hidden rounded-xl border border-line bg-surface shadow-card',
              landscape ? 'aspect-[297/210]' : 'aspect-[210/297]',
            )}
          >
            {fondoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={fondoUrl} alt="" className="absolute inset-0 h-full w-full object-fill" draggable={false} />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center bg-paper">
                <p className="max-w-xs text-center text-sm leading-relaxed text-ink-500">
                  Sube el diseño de tu constancia. Sin el, la hoja sale en blanco y no se puede activar.
                </p>
              </div>
            )}

            {CLAVES.map((clave) => {
              const campo = campos[clave];
              if (!campo || campo.visible === false) return null;
              const activo = seleccion === clave;
              return (
                <button
                  key={clave}
                  type="button"
                  data-campo={clave}
                  onPointerDown={(evento) => iniciarArrastre(clave, evento)}
                  aria-label={`Colocar ${clave}`}
                  className={cn(
                    'absolute cursor-grab whitespace-nowrap rounded px-1 leading-none active:cursor-grabbing',
                    activo ? 'outline outline-2 outline-offset-2' : 'hover:bg-primary-soft/60',
                  )}
                  style={{
                    left: `${campo.x}%`,
                    top: `${campo.y}%`,
                    // El mismo origen que en el PDF: la Y es donde EMPIEZA el texto por arriba.
                    // El QR se centra en su punto en las DOS direcciones, igual que en el PDF; el
                    // texto solo en horizontal, porque su Y es donde empieza por arriba.
                    transform:
                      clave === 'qr'
                        ? 'translate(-50%, -50%)'
                        : campo.align === 'center'
                          ? 'translateX(-50%)'
                          : campo.align === 'right'
                            ? 'translateX(-100%)'
                            : 'none',
                    fontSize: `${(campo.size / 100) * altoLienzo}px`,
                    fontWeight: campo.bold ? 700 : 400,
                    color: campo.color,
                    outlineColor: activo ? 'var(--brand-primary)' : undefined,
                  }}
                >
                  {clave === 'qr' ? (
                    <span
                      className="block rounded-sm border-2 border-dashed"
                      style={{
                        width: `${(campo.size / 100) * altoLienzo}px`,
                        aspectRatio: '1',
                        borderColor: campo.color,
                      }}
                    />
                  ) : (
                    ETIQUETAS[clave]
                  )}
                </button>
              );
            })}

            {/*
              LAS FIRMAS TAMBIEN SE VEN Y SE ARRASTRAN AQUI (Decision #113).

              Estaban solo en el panel de la derecha, asi que la unica forma de saber donde caian
              era generar la vista previa: se anadia una firma, desaparecia de la vista y habia que
              adivinar. Ahora se pintan sobre el arte igual que los campos, con su linea y su
              rotulo, que es exactamente lo que sale impreso.

              Se dibujan DESPUES de los campos para que queden encima si se solapan: al colocarlas
              hay que poder agarrarlas aunque caigan sobre un texto.
            */}
            {firmas.map((firma, indice) => (
              <button
                key={indice}
                type="button"
                onPointerDown={(evento) => arrastrarFirma(indice, evento)}
                aria-label={`Colocar la firma de ${firma.name || 'sin nombre'}`}
                className="absolute cursor-grab active:cursor-grabbing"
                style={{
                  left: `${firma.x}%`,
                  top: `${firma.y}%`,
                  width: `${firma.width}%`,
                  // La Y de una firma es su LINEA, no su borde de arriba: es donde la rubrica se
                  // apoya, y es lo que se mira al colocarla.
                  transform: 'translateX(-50%)',
                }}
              >
                <FirmaEnLienzo firma={firma} altoLienzo={altoLienzo} />
              </button>
            ))}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => inputFondo.current?.click()}>
              <Upload className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              {fondo ? 'Cambiar diseño' : 'Subir diseño'}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setLandscape((v) => !v)}>
              {landscape ? 'Pasar a vertical' : 'Pasar a horizontal'}
            </Button>

            <input
              ref={inputFondo}
              type="file"
              accept="image/png,image/jpeg"
              className="hidden"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (!file) return;
                try {
                  const subido = await uploadMedia(file, 'certificate');
                  setFondo(subido.storageKey);
                } catch (error) {
                  showToast({ kind: 'danger', title: 'No se pudo subir el diseño', description: motivoDelError(error) });
                }
              }}
            />
          </div>
          <p className="mt-2 text-xs leading-relaxed text-ink-500">
            PNG o JPG con la proporcion de una hoja {landscape ? 'horizontal (297x210)' : 'vertical (210x297)'}. Si
            viene con otra proporcion, se estira para ocupar la hoja entera.
          </p>
        </div>

        {/* ─────────────── El panel de ajuste ─────────────── */}
        <div className="space-y-4">
          <div className="card p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-500">Datos en la constancia</p>
            <div className="mt-2.5 space-y-1">
              {CLAVES.map((clave) => campos[clave] && (
                <div key={clave} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id={`v-${clave}`}
                    checked={campos[clave]?.visible !== false}
                    onChange={(e) =>
                      setCampos((previos) => {
                        const campo = previos[clave];
                        return campo ? { ...previos, [clave]: { ...campo, visible: e.target.checked } } : previos;
                      })
                    }
                    className="h-4 w-4 shrink-0 accent-[var(--brand-primary)]"
                  />
                  <label
                    htmlFor={`v-${clave}`}
                    onClick={() => setSeleccion(clave)}
                    className={cn(
                      'flex-1 cursor-pointer truncate text-sm',
                      seleccion === clave ? 'font-semibold text-ink-900' : 'text-ink-700',
                    )}
                  >
                    {NOMBRES[clave]}
                  </label>
                </div>
              ))}
            </div>
          </div>

          {campoSel ? (
            <div className="card p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-500">
                {seleccion ? NOMBRES[seleccion] : ''}
              </p>
              <p className="mt-1 text-xs text-ink-500">Arrastralo sobre el diseño para moverlo.</p>

              <Field htmlFor="c-size" label="Tamaño" className="mt-3">
                <input
                  id="c-size"
                  type="range"
                  min={0.5}
                  max={seleccion === 'qr' ? 25 : 10}
                  step={0.1}
                  value={campoSel.size}
                  onChange={(e) => ajustar({ size: Number(e.target.value) })}
                  className="w-full accent-[var(--brand-primary)]"
                />
              </Field>

              {seleccion !== 'qr' ? (
                <>
                  <div className="mt-3 flex gap-1.5">
                    {(['left', 'center', 'right'] as const).map((valor) => (
                      <button
                        key={valor}
                        type="button"
                        onClick={() => alinear(valor)}
                        className={cn(
                          'focus-ring flex-1 rounded-lg border px-2 py-1.5 text-xs transition-colors',
                          campoSel.align === valor
                            ? 'border-transparent bg-primary-soft font-semibold text-primary'
                            : 'border-line text-ink-700 hover:border-line-strong',
                        )}
                      >
                        {valor === 'left' ? 'Izq.' : valor === 'center' ? 'Centro' : 'Der.'}
                      </button>
                    ))}
                  </div>
                  <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm text-ink-700">
                    <input
                      type="checkbox"
                      checked={campoSel.bold}
                      onChange={(e) => ajustar({ bold: e.target.checked })}
                      className="h-4 w-4 accent-[var(--brand-primary)]"
                    />
                    Negrita
                  </label>
                  <Field htmlFor="c-color" label="Color" className="mt-3">
                    <input
                      id="c-color"
                      type="color"
                      value={campoSel.color}
                      onChange={(e) => ajustar({ color: e.target.value })}
                      className="h-9 w-full cursor-pointer rounded-lg border border-line bg-surface"
                    />
                  </Field>
                </>
              ) : null}
            </div>
          ) : null}

          <Firmas firmas={firmas} onChange={setFirmas} />
        </div>
      </div>

    </div>
  );
}

/**
 * LAS FIRMAS. Cada una es una imagen, un nombre y un CARGO.
 *
 * El cargo importa tanto como el nombre y por eso no es opcional en la practica: una constancia
 * firmada por "Ana Gomez" no dice nada; firmada por "Ana Gomez, Coordinadora de SST" acredita
 * quien responde por lo que se enseno. El auditor pregunta por el cargo.
 */
function Firmas({ firmas, onChange }: { firmas: FirmanteConstancia[]; onChange: (valor: FirmanteConstancia[]) => void }) {
  const { showToast } = useToast();

  function actualizar(indice: number, cambio: Partial<FirmanteConstancia>) {
    onChange(firmas.map((firma, i) => (i === indice ? { ...firma, ...cambio } : firma)));
  }

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-500">Firmas</p>
        {firmas.length < 4 ? (
          <button
            type="button"
            onClick={() =>
              onChange([
                ...firmas,
                // Se reparten a lo ancho segun cuantas haya: dos firmas centradas se pisan si las
                // dos nacen en el mismo sitio, y mover una encima de otra es molesto.
                { name: '', title: '', imageKey: null, x: firmas.length === 0 ? 30 : 70, y: 82, width: 18 },
              ])
            }
            className="focus-ring text-xs font-medium text-primary hover:underline"
          >
            Anadir
          </button>
        ) : null}
      </div>

      {firmas.length === 0 ? (
        <p className="mt-2 text-xs leading-relaxed text-ink-500">
          Sin firmas, la constancia sale sin la linea de quien responde por la formacion.
        </p>
      ) : null}

      <div className="mt-3 space-y-3">
        {firmas.map((firma, indice) => (
          <div key={indice} className="rounded-lg border border-line p-3">
            <Input
              placeholder="Nombre"
              value={firma.name}
              maxLength={120}
              onChange={(e) => actualizar(indice, { name: e.target.value })}
            />
            <Input
              placeholder="Cargo"
              value={firma.title}
              maxLength={120}
              className="mt-2"
              onChange={(e) => actualizar(indice, { title: e.target.value })}
            />
            <div className="mt-2 flex items-center gap-2">
              <label className="focus-ring flex-1 cursor-pointer rounded-lg border border-line px-2.5 py-1.5 text-center text-xs text-ink-700 hover:border-line-strong">
                {firma.imageKey ? 'Cambiar rubrica' : 'Subir rubrica'}
                <input
                  type="file"
                  accept="image/png"
                  className="hidden"
                  onChange={async (event) => {
                    const file = event.target.files?.[0];
                    event.target.value = '';
                    if (!file) return;
                    try {
                      const subido = await uploadMedia(file, 'signature');
                      actualizar(indice, { imageKey: subido.storageKey });
                    } catch (error) {
                      showToast({ kind: 'danger', title: 'No se pudo subir la rubrica', description: motivoDelError(error) });
                    }
                  }}
                />
              </label>
              <button
                type="button"
                onClick={() => onChange(firmas.filter((_, i) => i !== indice))}
                aria-label="Quitar firma"
                className="focus-ring rounded-lg p-1.5 text-ink-500 hover:text-danger"
              >
                <Trash2 className="h-4 w-4" strokeWidth={1.75} />
              </button>
            </div>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-ink-300">PNG con fondo transparente.</p>
    </div>
  );
}

/** Un decimal basta: en una hoja A4 es un cuarto de milimetro. */
function redondear(valor: number): number {
  return Math.round(valor * 10) / 10;
}

/**
 * UNA FIRMA sobre el arte: la rubrica, la linea y quien firma.
 *
 * Es el mismo dibujo que hace el PDF, y por eso incluye la LINEA y los rotulos aunque no haya
 * imagen: sin ellos, una constancia no se lee como un documento firmado, y al colocar hay que ver
 * lo que va a salir, no una aproximacion.
 */
function FirmaEnLienzo({ firma, altoLienzo }: { firma: FirmanteConstancia; altoLienzo: number }) {
  const rubrica = useMediaUrl(firma.imageKey);
  // Los mismos tamaños que `dibujarFirma` en el servidor: 1.8% del alto para el nombre.
  const tamano = altoLienzo * 0.018;

  return (
    <span className="pointer-events-none block">
      {rubrica ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={rubrica} alt="" className="block w-full object-contain" draggable={false} />
      ) : (
        <span className="block" style={{ height: tamano * 2 }} />
      )}
      <span className="block border-t" style={{ borderColor: '#6b7280' }} />
      <span className="block text-center leading-tight text-ink-900" style={{ fontSize: tamano, marginTop: 4 }}>
        {firma.name || 'Nombre'}
      </span>
      {firma.title ? (
        <span className="block text-center leading-tight text-ink-500" style={{ fontSize: tamano * 0.85 }}>
          {firma.title}
        </span>
      ) : null}
    </span>
  );
}

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { FileText, QrCode, X } from 'lucide-react';
import { motivoDelError } from '@/lib/api';
import {
  abrirSesion,
  actasDe,
  cerrarSesion,
  generarActa,
  marcadosDeSesion,
  type ActaDeSesion,
  type SesionAbierta,
} from '@/lib/delivery-api';
import { formatDate } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';

/**
 * LA SALA: el código que se proyecta y el acta de la sesión (`PENDIENTES` 2.4).
 *
 * ─── PARA QUÉ, SI YA HAY LISTA ───
 *
 * La lista del instructor sigue siendo la vía normal. Esto es para la jornada de cuarenta personas
 * donde pasar lista cuesta diez minutos del tiempo de todos, y para que quede el sello de tiempo de
 * cada quien en vez de una marca que puso alguien después, de memoria.
 *
 * ─── ESTA TARJETA ES EL MANDO; EL CÓDIGO VA A PANTALLA COMPLETA ───
 *
 * Proyectar, cerrar la sesión y generar el acta se hacen aquí. El código se abre **encima de la
 * aplicación, a pantalla completa** (`Proyeccion`, abajo): se ve desde el fondo del salón y sale con
 * la tecla Escape, sin salir de la convocatoria ni abrir nada aparte.
 *
 * Dentro de la tarjeta no cabía: compite con el menú, la ficha y la tabla, y a cinco metros no se lee
 * un código de dos centímetros.
 *
 * ─── EL ACTA NO NECESITA NADA DE ESTO ───
 *
 * Es un PDF: se abre en su propia pestaña con el visor del navegador, que es donde se imprime y se
 * guarda. Reimplementarlo sería hacer peor lo que el navegador ya hace.
 */
export function SesionEnSala({
  offeringId,
  activa,
  onCambio,
}: {
  offeringId: string;
  activa: boolean;
  /**
   * Se llama al salir de la proyeccion. Mientras se proyectaba, la gente se estuvo marcando sola:
   * si la lista de inscritos no se vuelve a pedir, quien cierra la capa ve la pantalla de hace diez
   * minutos y cree que no entro nadie.
   */
  onCambio: () => void;
}) {
  const { showToast } = useToast();
  const [proyectando, setProyectando] = useState(false);
  const [generando, setGenerando] = useState(false);
  const [actas, setActas] = useState<ActaDeSesion[]>([]);

  const cargarActas = useCallback(async () => {
    try {
      setActas(await actasDe(offeringId));
    } catch {
      // Las actas son un extra de esta tarjeta: si no cargan, no se rompe el resto.
      setActas([]);
    }
  }, [offeringId]);

  useEffect(() => {
    void cargarActas();
  }, [cargarActas]);

  async function cerrar() {
    try {
      await cerrarSesion(offeringId);
      setProyectando(false);
      showToast({ kind: 'success', title: 'Sesión cerrada', description: 'El código deja de servir desde ahora.' });
    } catch (error) {
      showToast({ kind: 'danger', title: 'No se pudo cerrar', description: motivoDelError(error) });
    }
  }

  async function acta() {
    setGenerando(true);
    try {
      const generada = await generarActa(offeringId);
      showToast({
        kind: 'success',
        title: 'Acta generada',
        description: `${generada.personas} persona(s), ${generada.firmadas} con firma. Queda con su huella.`,
      });
      await cargarActas();
    } catch (error) {
      showToast({ kind: 'danger', title: 'No se pudo generar el acta', description: motivoDelError(error) });
    } finally {
      setGenerando(false);
    }
  }

  if (!activa) return null;

  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-[15px] font-semibold text-ink-900">Pasar lista desde la sala</h3>
          <p className="mt-1 text-sm text-ink-500">
            Proyecta el código y cada quien lo escanea con su teléfono. Queda su hora exacta, no una
            marca puesta después.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => setProyectando(true)}>
            <QrCode className="h-4 w-4" aria-hidden /> Proyectar el código
          </Button>
          <Button variant="outline" size="sm" loading={generando} onClick={() => void acta()}>
            <FileText className="h-4 w-4" aria-hidden /> Generar acta
          </Button>
          <Button variant="ghost" size="sm" onClick={() => void cerrar()}>
            <X className="h-4 w-4" aria-hidden /> Cerrar sesión
          </Button>
        </div>
      </div>

      {actas.length > 0 ? (
        <div className="mt-5 border-t border-line pt-4">
          <p className="mb-2 text-xs uppercase tracking-wide text-ink-500">Actas generadas</p>
          <ul className="space-y-1.5">
            {actas.map((fila) => (
              <li key={fila.id} className="flex flex-wrap items-center gap-2 text-sm">
                <a
                  href={fila.url}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-ink-900 underline underline-offset-2 hover:text-primary"
                >
                  Acta del {formatDate(fila.generadaEl)}
                </a>
                {/*
                  LA HUELLA SE ENSEÑA, y no es decoración: es lo que permite decir que un PDF impreso
                  hace ocho meses es el que generó el sistema. Se recortan doce caracteres porque el
                  entero no cabe y nadie compara sesenta y cuatro a ojo.
                */}
                <span className="font-mono text-xs text-ink-500">{fila.huella.slice(0, 12)}…</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {proyectando ? (
        <Proyeccion
          offeringId={offeringId}
          onSalir={() => {
            setProyectando(false);
            onCambio();
          }}
        />
      ) : null}
    </section>
  );
}

/**
 * EL CÓDIGO, A PANTALLA COMPLETA Y ENCIMA DE TODO.
 *
 * ─── LO QUE DECIDE CÓMO SE VE ───
 *
 * Se mira desde el fondo de un salón, casi siempre proyectado. De ahí las tres decisiones:
 *
 *   · **Fondo oscuro con el QR sobre blanco.** Un proyector con luz ambiente pierde el negro puro, y
 *     un QR con poco contraste es un QR que media sala no consigue leer.
 *   · **El código en letra enorme, debajo.** Para quien no puede escanear —cámara rota, sin datos,
 *     una funda que no deja enfocar—, que es justo el que se quedaría sin constar.
 *   · **La cuenta atrás a la vista.** Sin ella, quien mira desde lejos no entiende por qué el código
 *     cambió mientras enfocaba, y quien lo teclea despacio no sabe si su problema fue llegar tarde.
 *
 * ─── Y SE SALE CON ESCAPE ───
 *
 * Es lo que hace la tecla en el resto del producto, y aquí importa más: quien está dictando tiene el
 * portátil de lado y no va a buscar un botón con el ratón.
 *
 * Salir NO cierra la sesión: el código sigue vivo. Son dos cosas distintas —dejar de proyectar y
 * apagar el código— y mezclarlas dejaría fuera a quien esté escaneando en ese momento.
 */
function Proyeccion({ offeringId, onSalir }: { offeringId: string; onSalir: () => void }) {
  const [sesion, setSesion] = useState<SesionAbierta | null>(null);
  const [restan, setRestan] = useState(0);
  const [fallo, setFallo] = useState<string | null>(null);
  const [conteo, setConteo] = useState<{ inscritos: number; presentes: number } | null>(null);
  const caja = useRef<HTMLDivElement>(null);

  const abrir = useCallback(async () => {
    try {
      const abierta = await abrirSesion(offeringId);
      setSesion(abierta);
      setRestan(abierta.segundos);
      setFallo(null);
    } catch (error) {
      setFallo(motivoDelError(error) ?? 'No se pudo abrir la sesión.');
    }
  }, [offeringId]);

  useEffect(() => {
    void abrir();
  }, [abrir]);

  /*
    CUANTOS VAN, CADA CINCO SEGUNDOS.

    Es la pregunta que se hace quien proyecta: ¿ya se marcaron todos o falta gente? Sin esto habia
    que salir y recargar la convocatoria para saberlo, que es justo lo que no se puede hacer con la
    sala esperando.

    Cinco segundos y no uno: cuarenta personas escaneando no producen cuarenta cambios por segundo, y
    una consulta por segundo durante una jornada de dos horas son siete mil peticiones para pintar un
    numero que se mueve cada medio minuto.
  */
  useEffect(() => {
    let vivo = true;
    const pedir = () => {
      void marcadosDeSesion(offeringId)
        .then((datos) => {
          if (vivo) setConteo(datos);
        })
        .catch(() => {
          // El contador es un extra: si falla, la proyeccion sigue enseñando el codigo.
        });
    };
    pedir();
    const tic = setInterval(pedir, 5000);
    return () => {
      vivo = false;
      clearInterval(tic);
    };
  }, [offeringId]);

  // El foco entra a la capa: sin esto, Escape lo recibiría lo que estuviera enfocado detrás.
  useEffect(() => {
    caja.current?.focus();
  }, []);

  useEffect(() => {
    const alPulsar = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') onSalir();
    };
    window.addEventListener('keydown', alPulsar);
    return () => window.removeEventListener('keydown', alPulsar);
  }, [onSalir]);

  /*
    LA ROTACIÓN VIVE MIENTRAS SE PROYECTA, y se detiene al salir. Un temporizador vivo detrás de una
    capa cerrada seguiría pidiendo códigos al servidor cada minuto y medio, y además rotaría el que
    alguien pudiera estar mirando en otra pantalla.
  */
  useEffect(() => {
    if (!sesion) return undefined;
    const tic = setInterval(() => {
      setRestan((previo) => {
        if (previo <= 1) {
          void abrir();
          return 0;
        }
        return previo - 1;
      });
    }, 1000);
    return () => clearInterval(tic);
  }, [sesion, abrir]);

  return (
    <div
      ref={caja}
      role="dialog"
      aria-modal="true"
      aria-label="Código de la sesión"
      tabIndex={-1}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-[#0e1114] px-6 py-10 text-white outline-none"
    >
      <button
        type="button"
        onClick={onSalir}
        className="focus-ring absolute right-5 top-5 flex items-center gap-1.5 rounded-full bg-white/10 px-4 py-2 text-sm text-white/80 transition-colors duration-150 hover:bg-white/20 hover:text-white"
      >
        <X className="h-4 w-4" aria-hidden /> Salir
      </button>

      {fallo ? (
        <p className="max-w-md text-center text-xl text-white/80">{fallo}</p>
      ) : sesion ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- data: URL generado en el servidor */}
          <img
            src={sesion.qr}
            alt="Código QR de la sesión"
            className="h-[42vh] w-[42vh] rounded-2xl bg-white p-5"
          />

          <div className="text-center">
            <p className="text-sm uppercase tracking-[0.3em] text-white/50">O escribe este código</p>
            <p className="mt-2 font-display text-[12vh] font-bold leading-none tracking-[0.12em]">
              {sesion.codigo}
            </p>
          </div>

          <p className="text-2xl text-white/60">
            Cambia en <span className="font-semibold tabular-nums text-white">{restan}s</span>
          </p>

          {/*
            LA CUENTA DE QUIEN YA SE MARCO, a la vista de la sala.

            Sirve para las dos cosas a la vez: quien dicta sabe si puede cerrar, y quien todavia no
            ha escaneado ve que los demas ya estan y que falta el. Cuando no falta nadie lo dice con
            palabras —«ya se marcaron los N»— porque «40 de 40» obliga a comparar dos numeros.
          */}
          {conteo ? (
            <p className="text-xl text-white/70">
              {conteo.presentes >= conteo.inscritos && conteo.inscritos > 0 ? (
                <span className="font-semibold text-white">Ya se marcaron los {conteo.inscritos}</span>
              ) : (
                <>
                  Van <span className="font-semibold tabular-nums text-white">{conteo.presentes}</span> de{' '}
                  <span className="tabular-nums">{conteo.inscritos}</span>
                </>
              )}
            </p>
          ) : null}
          <p className="max-w-xl text-center text-base text-white/40">
            Escanea con la cámara del teléfono. Si no puedes, entra a la plataforma y escribe el
            código. Para salir, Escape.
          </p>
        </>
      ) : (
        <p className="text-xl text-white/60">Abriendo la sesión…</p>
      )}
    </div>
  );
}

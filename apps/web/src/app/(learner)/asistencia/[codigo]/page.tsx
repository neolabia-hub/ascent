'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { BadgeCheck, PenLine, Undo2 } from 'lucide-react';
import { motivoDelError } from '@/lib/api';
import {
  firmarAsistencia,
  jornadaDelCodigo,
  loMioEnLaJornada,
  registrarmeEnLaJornada,
  subirFirma,
  type JornadaDelCodigo,
} from '@/lib/delivery-api';
import { formatDate } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * MARCAR MI ASISTENCIA DESDE EL TELÉFONO (mecanismos 2 y 3, `PENDIENTES` 2.4).
 *
 * ─── LO PRIMERO ES DECIR A QUÉ SE ESTÁ UNO APUNTANDO ───
 *
 * La pantalla resuelve el código antes de marcar nada y enseña la formación, la fecha y el lugar.
 * Enterarse de a qué jornada se apuntó uno por el mensaje de éxito es como se firma lo que no se ha
 * leído — y aquí lo que se firma es evidencia legal.
 *
 * ─── DOS PASOS, Y EL SEGUNDO ES OPCIONAL ───
 *
 * Registrarse deja la asistencia con su sello de tiempo; firmar añade el trazo que va al acta. Se
 * separan porque son dos cosas distintas: la empresa que solo necesita saber quién entró se queda en
 * el primero, y la que tiene que enseñarle firmas a un auditor pide el segundo.
 *
 * ─── EL LIENZO ───
 *
 * A dedo, en el móvil. Se dibuja con eventos de puntero —no de ratón ni de tacto por separado— que
 * es lo único que funciona igual en un teléfono, en una tableta con lápiz y en un portátil. Y se
 * guarda como PNG recortado: una firma sobre un lienzo entero es medio megabyte de blanco.
 */
export default function AsistenciaPorCodigo() {
  const params = useParams<{ codigo: string }>();
  const codigo = String(params?.codigo ?? '');

  const [jornada, setJornada] = useState<JornadaDelCodigo | null>(null);
  const [fallo, setFallo] = useState<string | null>(null);
  const [estado, setEstado] = useState<{ marcada: boolean; firmada: boolean }>({ marcada: false, firmada: false });
  const [ocupado, setOcupado] = useState(false);
  const [firmando, setFirmando] = useState(false);

  const cargar = useCallback(async () => {
    if (!codigo) return;
    setFallo(null);
    try {
      const [datos, mio] = await Promise.all([jornadaDelCodigo(codigo), loMioEnLaJornada(codigo)]);
      setJornada(datos);
      setEstado({ marcada: mio.marcada, firmada: mio.firmada });
    } catch (error) {
      setFallo(motivoDelError(error) ?? 'No se pudo completar.');
    }
  }, [codigo]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function registrarme() {
    setOcupado(true);
    try {
      const hecho = await registrarmeEnLaJornada(codigo);
      setEstado({ marcada: true, firmada: hecho.firmada });
    } catch (error) {
      setFallo(motivoDelError(error) ?? 'No se pudo completar.');
    } finally {
      setOcupado(false);
    }
  }

  async function guardarFirma(png: Blob) {
    setOcupado(true);
    try {
      const subida = await subirFirma(png);
      await firmarAsistencia(codigo, subida.key);
      setEstado({ marcada: true, firmada: true });
      setFirmando(false);
    } catch (error) {
      setFallo(motivoDelError(error) ?? 'No se pudo completar.');
    } finally {
      setOcupado(false);
    }
  }

  if (fallo && !jornada) {
    return (
      <div className="mx-auto max-w-md px-4 py-10">
        <EmptyState
          icon={BadgeCheck}
          title="Este código no sirve"
          description={fallo}
        />
        <div className="mt-4 text-center">
          <Button variant="outline" onClick={() => void cargar()}>
            Volver a intentarlo
          </Button>
        </div>
      </div>
    );
  }

  if (!jornada) {
    return (
      <div className="mx-auto max-w-md space-y-3 px-4 py-10">
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-12 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-4 py-8">
      <div className="card p-5">
        <p className="text-xs uppercase tracking-wide text-ink-500">Asistencia</p>
        <h1 className="mt-1 font-display text-xl font-semibold text-ink-900">{jornada.formacion}</h1>
        <p className="mt-1 text-sm text-ink-500">
          {jornada.code}
          {jornada.fecha ? ` · ${formatDate(jornada.fecha)}` : ''}
          {jornada.lugar ? ` · ${jornada.lugar}` : ''}
        </p>

        {estado.marcada ? (
          <div className="mt-5 rounded-lg bg-ok-soft px-4 py-3">
            <p className="flex items-center gap-2 font-medium text-ink-900">
              <BadgeCheck className="h-5 w-5 text-ok" aria-hidden />
              Quedaste en la lista
            </p>
            <p className="mt-1 text-sm text-ink-700">
              {estado.firmada
                ? 'Con tu firma. No hace falta nada más.'
                : 'Con la hora en que escaneaste. Si te piden firmar, hazlo aquí abajo.'}
            </p>
          </div>
        ) : (
          <Button className="mt-5 w-full" loading={ocupado} onClick={() => void registrarme()}>
            Estoy aquí
          </Button>
        )}

        {fallo ? <p className="mt-3 text-sm text-danger">{fallo}</p> : null}

        {!estado.firmada ? (
          firmando ? (
            <LienzoDeFirma
              ocupado={ocupado}
              onGuardar={(png) => void guardarFirma(png)}
              onCancelar={() => setFirmando(false)}
            />
          ) : (
            <Button variant="outline" className="mt-3 w-full" onClick={() => setFirmando(true)}>
              <PenLine className="h-4 w-4" aria-hidden /> Firmar
            </Button>
          )
        ) : null}
      </div>
    </div>
  );
}

/**
 * EL LIENZO. Trescientos por ciento de cuidado en dos detalles que se ven al usarlo en un móvil de
 * verdad:
 *
 *   · **`touch-action: none`**, o el navegador interpreta el trazo como un gesto de arrastrar la
 *     página y la firma sale a trozos.
 *   · **Resolución del dispositivo** (`devicePixelRatio`): sin eso la firma se guarda pixelada y en
 *     el acta impresa parece un garabato de otra persona.
 */
function LienzoDeFirma({
  ocupado,
  onGuardar,
  onCancelar,
}: {
  ocupado: boolean;
  onGuardar: (png: Blob) => void;
  onCancelar: () => void;
}) {
  const lienzo = useRef<HTMLCanvasElement>(null);
  const pintando = useRef(false);
  const [hayTrazo, setHayTrazo] = useState(false);

  useEffect(() => {
    const canvas = lienzo.current;
    if (!canvas) return;
    const escala = window.devicePixelRatio || 1;
    const caja = canvas.getBoundingClientRect();
    canvas.width = caja.width * escala;
    canvas.height = caja.height * escala;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(escala, escala);
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#111318';
  }, []);

  function punto(evento: React.PointerEvent<HTMLCanvasElement>) {
    const caja = evento.currentTarget.getBoundingClientRect();
    return { x: evento.clientX - caja.left, y: evento.clientY - caja.top };
  }

  return (
    <div className="mt-4">
      <p className="mb-2 text-sm text-ink-500">Firma con el dedo</p>
      <canvas
        ref={lienzo}
        className="h-40 w-full touch-none rounded-lg border border-line bg-surface"
        onPointerDown={(e) => {
          const ctx = lienzo.current?.getContext('2d');
          if (!ctx) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          pintando.current = true;
          const { x, y } = punto(e);
          ctx.beginPath();
          ctx.moveTo(x, y);
        }}
        onPointerMove={(e) => {
          if (!pintando.current) return;
          const ctx = lienzo.current?.getContext('2d');
          if (!ctx) return;
          const { x, y } = punto(e);
          ctx.lineTo(x, y);
          ctx.stroke();
          setHayTrazo(true);
        }}
        onPointerUp={() => {
          pintando.current = false;
        }}
        onPointerLeave={() => {
          pintando.current = false;
        }}
      />
      <div className="mt-2 flex items-center gap-2">
        <Button
          size="sm"
          disabled={!hayTrazo}
          loading={ocupado}
          onClick={() => {
            lienzo.current?.toBlob((blob) => {
              if (blob) onGuardar(blob);
            }, 'image/png');
          }}
        >
          Guardar firma
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            const canvas = lienzo.current;
            const ctx = canvas?.getContext('2d');
            if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
            setHayTrazo(false);
          }}
        >
          <Undo2 className="h-4 w-4" aria-hidden /> Borrar
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancelar}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}

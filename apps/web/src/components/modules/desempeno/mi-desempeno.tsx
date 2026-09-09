'use client';

import { useEffect, useState } from 'react';
import { Check, ChevronRight, PenLine, ShieldCheck, UserRound } from 'lucide-react';
import { ESCALAS, firmarEvaluacion, sobreMi, type Evaluacion } from '@/lib/performance-api';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { motivoDelError } from '@/lib/api';

/**
 * MI EVALUACION DE DESEMPENO (Decision #134), arriba de "Desempeno" (Decision #140).
 *
 * ─── ESTABA EN EL PERFIL Y ERA EL SITIO EQUIVOCADO ───
 *
 * El razonamiento original era bueno y el resultado no: como se mira una o dos veces al año, se
 * puso en el perfil junto a las constancias para no gastar una entrada permanente del menu. Pero
 * nadie busca su evaluacion de desempeno en el perfil, y ademas partia el mismo asunto en dos
 * puertas distintas segun si calificas a alguien o no. Ahora las dos cosas viven en "Desempeno", y
 * ese item aparece cuando hay algo — que es lo que evita el recordatorio permanente sin esconder
 * nada.
 *
 * ─── LA AUTOEVALUACION Y LA DEL JEFE SE VEN JUNTAS ───
 *
 * Es lo unico que hace util una autoevaluacion. Por separado son dos opiniones sueltas; juntas, la
 * diferencia entre las dos ES la conversacion — donde la persona se puso 5 y su jefe 3 hay algo que
 * hablar, y donde coinciden no hace falta gastar la reunion.
 *
 * ─── AQUI SOLO SE LEE LO PROPIO ───
 *
 * Calificar a la gente a cargo es la lista de abajo, en la misma pantalla. Siguen siendo dos
 * trabajos distintos —uno tiene fecha limite, el otro es "lo mio"— y por eso son dos bloques con
 * dos colores; pero una sola puerta, porque el tema es el mismo.
 *
 * ─── FIRMAR NO ES ESTAR DE ACUERDO ───
 *
 * Es reconocer que la conversacion ocurrio, y por eso no hay boton de rechazar. Se dice con esas
 * palabras: alguien que cree que firmar es aceptar una nota que le parece injusta, no firma — y
 * entonces la empresa se queda sin la evidencia que necesita.
 */
export function MiDesempeno() {
  const [filas, setFilas] = useState<Evaluacion[] | null>(null);

  const cargar = () => {
    void sobreMi()
      .then(setFilas)
      .catch(() => setFilas([]));
  };
  useEffect(cargar, []);

  // Sin evaluaciones no se pinta nada: una tarjeta vacia en el perfil solo dice "aqui falta algo".
  if (filas === null || filas.length === 0) return null;

  return <LoMio filas={filas} onCambio={cargar} />;
}

/** Lo que se evaluo DE MI: la del jefe y la propia, juntas. */
function LoMio({ filas, onCambio }: { filas: Evaluacion[]; onCambio: () => void }) {
  const { showToast } = useToast();
  const [abierta, setAbierta] = useState<Evaluacion | null>(null);
  const cargar = onCambio;

  // La del jefe primero: es la que se viene a leer. La propia ya se sabe.
  const ordenadas = [...filas].sort((a) => (a.reviewerRole === 'MANAGER' ? -1 : 1));

  const sinFirmar = ordenadas.some(
    (fila) => fila.reviewerRole === 'MANAGER' && fila.signedAt === null && fila.cycle?.requiresSignature !== false,
  );

  /*
    LO TUYO LLEVA EL COLOR SECUNDARIO DE LA EMPRESA, y es la unica pieza de la pantalla que lo usa.

    Debajo, la lista de a quien tienes que calificar va en el color principal, que es el que en todo
    el producto significa "esto es lo activo, esto es la accion". Aqui no hay ninguna accion con
    fecha limite: es lo que se escribio sobre ti. Dos trabajos distintos en la misma pantalla se
    distinguen antes de leer nada si no son del mismo color — y el secundario es exactamente para
    esto: refuerzos que no compiten con lo activo, como la racha o la tarjeta de repaso.
  */
  return (
    <section className="card overflow-hidden">
      <div
        className="flex items-center gap-3 border-b border-line px-5 py-4"
        style={{ backgroundColor: 'var(--brand-accent-soft)' }}
      >
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
          style={{ backgroundColor: 'var(--brand-accent)', color: '#ffffff' }}
          aria-hidden="true"
        >
          <UserRound className="h-5 w-5" strokeWidth={1.75} />
        </span>
        <div className="min-w-0">
          <h2 className="font-display text-base font-semibold text-ink-900">Lo tuyo</h2>
          <p className="text-xs text-ink-700">
            {sinFirmar ? 'Tu evaluación esta lista y te falta firmarla.' : 'Como te evaluaron, y lo que escribiste tu.'}
          </p>
        </div>
      </div>

      <div className="divide-y divide-line px-5">
        {ordenadas.map((fila) => (
          <button
            key={fila.id}
            type="button"
            onClick={() => setAbierta(fila)}
            className="focus-ring flex w-full items-center gap-3 py-3.5 text-left"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-[15px] font-semibold text-ink-900">
                {fila.reviewerRole === 'SELF' ? 'Tu autoevaluacion' : `La escribio ${fila.evaluatorName ?? 'tu jefe'}`}
              </p>
              <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-ink-500">
                <span>{fila.cycle?.name}</span>
                {fila.reviewerRole === 'MANAGER' ? (
                  fila.signedAt ? (
                    <span className="inline-flex items-center gap-1" style={{ color: 'var(--ok)' }}>
                      <Check className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden="true" />
                      firmada
                    </span>
                  ) : (
                    <span className="font-medium" style={{ color: 'var(--warn)' }}>
                      te falta firmarla
                    </span>
                  )
                ) : null}
              </p>
            </div>
            <span className="shrink-0 font-display text-xl font-bold tabular-nums text-ink-900">
              {fila.score === null ? '—' : `${Math.round(Number(fila.score))}%`}
            </span>
            <ChevronRight className="h-5 w-5 shrink-0 text-ink-300" strokeWidth={1.75} aria-hidden="true" />
          </button>
        ))}
      </div>

      {abierta ? (
        <Detalle
          evaluacion={abierta}
          onCerrar={() => setAbierta(null)}
          onFirmada={() => {
            setAbierta(null);
            cargar();
            showToast({ kind: 'success', title: 'Firmada' });
          }}
        />
      ) : null}
    </section>
  );
}

function Detalle({
  evaluacion,
  onCerrar,
  onFirmada,
}: {
  evaluacion: Evaluacion;
  onCerrar: () => void;
  onFirmada: () => void;
}) {
  const { showToast } = useToast();
  const [firmando, setFirmando] = useState(false);

  // Solo se firma la del jefe: firmar la propia no significa nada.
  const puedeFirmar =
    evaluacion.reviewerRole === 'MANAGER' &&
    evaluacion.signedAt === null &&
    evaluacion.cycle?.requiresSignature !== false;

  const firmar = async () => {
    setFirmando(true);
    try {
      await firmarEvaluacion(evaluacion.id);
      onFirmada();
    } catch (error) {
      showToast({ kind: 'danger', title: 'No se pudo firmar', description: motivoDelError(error) });
    } finally {
      setFirmando(false);
    }
  };

  return (
    <Modal
      open
      onOpenChange={(abierto) => {
        if (!abierto) onCerrar();
      }}
      icon={evaluacion.reviewerRole === 'SELF' ? UserRound : ShieldCheck}
      title={evaluacion.reviewerRole === 'SELF' ? 'Tu autoevaluacion' : 'Tu evaluacion'}
      description={
        evaluacion.reviewerRole === 'SELF'
          ? evaluacion.cycle?.name
          : `${evaluacion.cycle?.name ?? ''} · la escribio ${evaluacion.evaluatorName ?? 'tu jefe'}`
      }
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          {evaluacion.signedAt ? (
            <p className="text-xs text-ink-500">
              Firmada el {new Date(evaluacion.signedAt).toLocaleDateString('es-CO')}
            </p>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onCerrar}>
              Cerrar
            </Button>
            {puedeFirmar ? (
              <Button loading={firmando} onClick={firmar} glow>
                <PenLine size={16} />
                Firmar
              </Button>
            ) : null}
          </div>
        </div>
      }
    >
      {evaluacion.score !== null ? (
        <div className="mb-5 rounded-xl bg-paper p-4">
          <p className="font-display text-[30px] font-bold leading-none tabular-nums text-ink-900">
            {Math.round(Number(evaluacion.score))}%
          </p>
          <p className="mt-1 text-xs text-ink-500">
            Promedio de las competencias con escala, segun cuanto pesa cada una
          </p>
        </div>
      ) : null}

      <div className="space-y-4">
        {(evaluacion.answers ?? []).map((respuesta) => {
          const item = evaluacion.cycleForm?.formSnapshot?.items?.find(
            (candidata) => candidata.competencyId === respuesta.competencyId,
          );
          const tope = item ? ESCALAS[item.scale].tope : null;
          return (
            <div key={respuesta.competencyId}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-display text-[15px] font-semibold text-ink-900">{respuesta.competencyName}</p>
                {respuesta.value !== null ? (
                  <p className="text-sm tabular-nums text-ink-700">
                    {/* Se ensena "4 de 5" y no "80%": es como se respondio, y es como se recuerda. */}
                    {item?.scale === 'YES_NO'
                      ? respuesta.value === 1
                        ? 'Cumple'
                        : 'No cumple'
                      : `${respuesta.value}${tope ? ` de ${tope}` : ''}`}
                  </p>
                ) : null}
              </div>
              {respuesta.comment ? (
                <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-ink-700">{respuesta.comment}</p>
              ) : null}
            </div>
          );
        })}

        {evaluacion.comment ? (
          <div className="rounded-xl bg-paper p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-500">Comentario general</p>
            <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-ink-700">{evaluacion.comment}</p>
          </div>
        ) : null}
      </div>

      {puedeFirmar ? (
        <p className="mt-5 rounded-xl bg-info-soft px-4 py-3 text-sm leading-relaxed text-info">
          Firmar <strong>no es estar de acuerdo</strong>: es dejar constancia de que leiste tu
          evaluacion y de que la conversacion ocurrio. Si algo te parece injusto, hablalo — la firma
          no lo da por bueno.
        </p>
      ) : null}
    </Modal>
  );
}

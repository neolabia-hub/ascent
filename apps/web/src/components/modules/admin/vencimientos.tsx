'use client';

import { useEffect, useMemo, useState } from 'react';
import { CalendarClock, Search } from 'lucide-react';
import {
  CLASES,
  getVencimientos,
  nombreDeMes,
  type ClaseVencimiento,
  type Vencimientos as Datos,
} from '@/lib/analytics-api';
import { cn } from '@/components/ui/cn';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table';

/**
 * LO QUE SE VENCE, MIRANDO HACIA ADELANTE (Decision #126).
 *
 * Todo lo demas de esta seccion mira hacia atras. Esto mira hacia adelante, que es de donde sale el
 * plan del ano siguiente: hoy esa lista se arma a mano en una hoja de calculo y por eso siempre
 * llega tarde — nadie recuerda en octubre que en marzo caducan cuarenta certificados de alturas.
 *
 * ─── DOS COSAS QUE VENCEN Y NO SE SUMAN ───
 *
 *   CERTIFICACION  el papel caduca en una fecha. La persona lo hizo bien y aun asi deja de estar
 *                  acreditada: hay que REPROGRAMAR la formacion.
 *   OBLIGACION     una formacion que se debe y no se ha hecho. Hay a quien PERSEGUIR.
 *
 * Se pintan como dos series de la misma barra y nunca como un solo numero: sumarlas daria una cifra
 * grande sin significado, y las dos acciones son distintas.
 */
export function Vencimientos() {
  const [meses, setMeses] = useState(12);
  const [datos, setDatos] = useState<Datos | null>(null);
  const [fallo, setFallo] = useState(false);
  const [clase, setClase] = useState<ClaseVencimiento | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [mesActivo, setMesActivo] = useState<string | null>(null);

  useEffect(() => {
    setDatos(null);
    setFallo(false);
    void getVencimientos(meses)
      .then(setDatos)
      .catch(() => setFallo(true));
  }, [meses]);

  const filas = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    return (datos?.items ?? []).filter((fila) => {
      if (clase && fila.clase !== clase) return false;
      if (mesActivo && !fila.fecha.startsWith(mesActivo)) return false;
      if (!texto) return true;
      return (
        fila.personaNombre.toLowerCase().includes(texto) ||
        fila.documento.includes(texto) ||
        fila.formacion.toLowerCase().includes(texto) ||
        (fila.area ?? '').toLowerCase().includes(texto) ||
        (fila.regional ?? '').toLowerCase().includes(texto)
      );
    });
  }, [datos, clase, mesActivo, busqueda]);

  if (fallo) {
    return <EmptyState icon={CalendarClock} title="No se pudieron calcular los vencimientos" description="Vuelve a intentarlo en un momento." />;
  }

  if (!datos) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  const tope = Math.max(1, ...datos.calendario.map((mes) => mes.total));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          {[6, 12, 24].map((opcion) => (
            <button
              key={opcion}
              type="button"
              onClick={() => {
                setMeses(opcion);
                setMesActivo(null);
              }}
              aria-pressed={meses === opcion}
              className={cn(
                'focus-ring h-8 rounded-full px-3 text-sm transition-all duration-150',
                meses === opcion
                  ? 'font-medium text-white shadow-btn-flat'
                  : 'text-ink-500 hover:bg-surface hover:text-ink-900',
              )}
              style={meses === opcion ? { backgroundColor: 'var(--brand-primary)' } : undefined}
            >
              {opcion} meses
            </button>
          ))}
        </div>
      </div>

      {/*
        LO YA VENCIDO VA PRIMERO Y APARTE. No es "lo que viene": es lo que ya se cayo, y es la unica
        cifra de esta pantalla sobre la que hay que actuar hoy y no programar para marzo.
      */}
      <div className="grid gap-3 sm:grid-cols-4">
        <Tarjeta valor={datos.resumen.vencido} etiqueta="Ya vencido" acento={datos.resumen.vencido > 0} />
        <Tarjeta valor={datos.resumen.proximos30} etiqueta="En 30 dias" />
        <Tarjeta valor={datos.resumen.proximos90} etiqueta="En 90 dias" />
        <Tarjeta valor={datos.resumen.total} etiqueta={`En ${meses} meses`} />
      </div>

      <section className="card p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h3 className="font-display text-[15px] font-semibold text-ink-900">Mes a mes</h3>
          {/* Leyenda SIEMPRE: con dos series, el color solo no puede ser lo unico que distingue. */}
          <ul className="flex flex-wrap gap-4">
            {(Object.keys(CLASES) as ClaseVencimiento[]).map((valor) => (
              <li key={valor} className="flex items-center gap-1.5 text-xs text-ink-500">
                <span
                  aria-hidden="true"
                  className="h-2.5 w-2.5 rounded-[3px]"
                  style={{ backgroundColor: CLASES[valor].color }}
                />
                {CLASES[valor].plural}
              </li>
            ))}
          </ul>
        </div>

        <CalendarioBarras
          calendario={datos.calendario}
          tope={tope}
          activo={mesActivo}
          onSeleccionar={(mes) => setMesActivo((previo) => (previo === mes ? null : mes))}
        />
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Chip activo={clase === null} onClick={() => setClase(null)} label="Todo" />
          {(Object.keys(CLASES) as ClaseVencimiento[]).map((valor) => (
            <Chip
              key={valor}
              activo={clase === valor}
              onClick={() => setClase(clase === valor ? null : valor)}
              label={CLASES[valor].plural}
              color={CLASES[valor].color}
            />
          ))}
          {mesActivo ? (
            <button
              type="button"
              onClick={() => setMesActivo(null)}
              className="focus-ring rounded-full bg-paper px-3 py-1 text-xs text-ink-700 hover:text-ink-900"
            >
              {nombreDeMes(mesActivo)} · quitar
            </button>
          ) : null}
        </div>
        <div className="relative min-w-[220px] flex-1 sm:max-w-xs">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-300"
            strokeWidth={1.75}
            aria-hidden="true"
          />
          <Input
            className="pl-9"
            placeholder="Buscar persona, cedula, formacion o area"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </div>
      </div>

      {/* La lista nominal es tambien la vista de tabla del grafico: los mismos datos, legibles sin color. */}
      <div className="card overflow-x-auto">
        <Table>
          <THead>
            <Tr>
              <Th>Vence</Th>
              <Th>Que</Th>
              <Th>Persona</Th>
              <Th>Area</Th>
              <Th>Cargo</Th>
              <Th>Regional</Th>
              <Th>Formacion</Th>
            </Tr>
          </THead>
          <TBody>
            {filas.length === 0 ? (
              <Tr>
                <Td colSpan={7}>
                  <p className="py-8 text-center text-sm text-ink-300">Nada vence con estos filtros.</p>
                </Td>
              </Tr>
            ) : (
              filas.slice(0, 300).map((fila) => (
                <Tr key={`${fila.clase}-${fila.personaId}-${fila.formacion}-${fila.fecha}`}>
                  <Td>
                    <span className="whitespace-nowrap text-sm tabular-nums text-ink-900">
                      {new Date(fila.fecha).toLocaleDateString('es-CO', {
                        day: 'numeric',
                        month: 'short',
                        year: '2-digit',
                      })}
                    </span>
                  </Td>
                  <Td>
                    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-sm text-ink-700">
                      <span
                        aria-hidden="true"
                        className="h-2 w-2 rounded-[2px]"
                        style={{ backgroundColor: CLASES[fila.clase].color }}
                      />
                      {CLASES[fila.clase].label}
                    </span>
                  </Td>
                  <Td>
                    <p className="font-medium text-ink-900">{fila.personaNombre}</p>
                    <p className="text-xs tabular-nums text-ink-500">{fila.documento}</p>
                  </Td>
                  <Td>
                    <span className="text-sm text-ink-700">{fila.area ?? '—'}</span>
                  </Td>
                  <Td>
                    <span className="text-sm text-ink-700">{fila.cargo ?? '—'}</span>
                  </Td>
                  <Td>
                    <span className="text-sm text-ink-700">{fila.regional ?? '—'}</span>
                  </Td>
                  <Td>
                    <span className="text-sm text-ink-700">{fila.formacion}</span>
                  </Td>
                </Tr>
              ))
            )}
          </TBody>
        </Table>
      </div>
      {filas.length > 300 ? (
        <p className="text-center text-xs text-ink-500">
          Se muestran 300 de {filas.length}. Acota con los filtros o descarga el Excel.
        </p>
      ) : null}
    </div>
  );
}

function Tarjeta({ valor, etiqueta, acento = false }: { valor: number; etiqueta: string; acento?: boolean }) {
  return (
    <div className="card p-4">
      <p
        className={cn(
          'font-display text-[28px] font-bold leading-none tabular-nums',
          acento ? 'text-warn' : 'text-ink-900',
        )}
      >
        {valor}
      </p>
      <p className="mt-1 text-xs text-ink-500">{etiqueta}</p>
    </div>
  );
}

function Chip({
  activo,
  onClick,
  label,
  color,
}: {
  activo: boolean;
  onClick: () => void;
  label: string;
  color?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      className={cn(
        'focus-ring inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs transition-all duration-150',
        activo ? 'bg-ink-900 text-surface' : 'bg-paper text-ink-700 hover:text-ink-900',
      )}
    >
      {color ? (
        <span aria-hidden="true" className="h-2 w-2 rounded-[2px]" style={{ backgroundColor: color }} />
      ) : null}
      {label}
    </button>
  );
}

/**
 * EL CALENDARIO: una barra apilada por mes.
 *
 * Se dibuja con divs y no con un lienzo: son doce barras, y una libreria de graficos costaria mas
 * peso del que pesa toda esta pantalla.
 *
 * Detalles que no son decoracion: **los meses vacios se dibujan igual** —el hueco es la informacion
 * que dice donde se puede reprogramar lo que se amontona al lado—; hay un separador de 2 px entre
 * los dos tramos para que no se lean como uno solo; y cada mes es un boton que filtra la lista de
 * abajo, porque la pregunta siguiente a "en marzo hay cuarenta" es siempre "¿quienes?".
 */
function CalendarioBarras({
  calendario,
  tope,
  activo,
  onSeleccionar,
}: {
  calendario: { mes: string; certificaciones: number; obligaciones: number; total: number }[];
  tope: number;
  activo: string | null;
  onSeleccionar: (mes: string) => void;
}) {
  return (
    <div className="mt-5 flex items-end gap-1.5 overflow-x-auto pb-1">
      {calendario.map((mes) => {
        const seleccionado = activo === mes.mes;
        return (
          <button
            key={mes.mes}
            type="button"
            onClick={() => onSeleccionar(mes.mes)}
            aria-pressed={seleccionado}
            title={`${nombreDeMes(mes.mes)}: ${mes.certificaciones} certificaciones y ${mes.obligaciones} formaciones por hacer`}
            className={cn(
              'focus-ring group flex min-w-[38px] flex-1 flex-col items-center gap-2 rounded-lg px-1 pt-2 transition-colors duration-150',
              seleccionado ? 'bg-paper' : 'hover:bg-paper',
            )}
          >
            {/* El total encima de la barra: es el numero que se busca, y no obliga a medir a ojo. */}
            <span
              className={cn(
                'text-[11px] font-semibold tabular-nums',
                mes.total > 0 ? 'text-ink-700' : 'text-ink-300',
              )}
            >
              {mes.total}
            </span>
            <span className="flex h-28 w-full flex-col justify-end" aria-hidden="true">
              {mes.certificaciones > 0 ? (
                <span
                  className="w-full rounded-t-[4px]"
                  style={{
                    height: `${(mes.certificaciones / tope) * 100}%`,
                    backgroundColor: CLASES.CERTIFICACION.color,
                    // Separador entre los dos tramos: sin el, apilados se leen como un bloque unico.
                    marginBottom: mes.obligaciones > 0 ? 2 : 0,
                  }}
                />
              ) : null}
              {mes.obligaciones > 0 ? (
                <span
                  className={cn('w-full', mes.certificaciones > 0 ? 'rounded-b-[2px]' : 'rounded-[4px]')}
                  style={{
                    height: `${(mes.obligaciones / tope) * 100}%`,
                    backgroundColor: CLASES.OBLIGACION.color,
                  }}
                />
              ) : null}
              {mes.total === 0 ? <span className="h-px w-full bg-line" /> : null}
            </span>
            <span className="whitespace-nowrap text-[11px] text-ink-500">{nombreDeMes(mes.mes)}</span>
          </button>
        );
      })}
    </div>
  );
}

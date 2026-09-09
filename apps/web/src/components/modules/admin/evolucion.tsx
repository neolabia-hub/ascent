'use client';

import { useEffect, useState } from 'react';
import { getEvolucion, type Evolucion as DatosEvolucion, type MesDeEvolucion } from '@/lib/analytics-api';
import { monthName } from '@/lib/format';
import { Combo } from '@/components/ui/combo';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/components/ui/cn';
import { TrendingUp } from 'lucide-react';

/**
 * LA EVOLUCIÓN DEL AÑO (2026-09-09).
 *
 * ─── LA PREGUNTA QUE NINGÚN INFORME CONTESTABA ───
 *
 * Todo lo demás —Seguimiento, Analítica, Vencimientos— es una **foto de hoy**. Contestan «¿cómo
 * vamos?» y no «¿vamos mejor que en enero?», que es la del comité mensual y la que dice si lo que
 * se hizo sirvió de algo.
 *
 * ─── QUÉ MIDE EXACTAMENTE, DICHO EN LA PANTALLA ───
 *
 * Cada barra es **lo que vencía ese mes**, y lo verde es lo que se cumplió. No es el histórico del
 * indicador: nadie guardó cuánto marcaba el 1 de marzo, y reconstruirlo sería inventarlo. Es la
 * pregunta de al lado y es la útil — «de lo que había que hacer en marzo, ¿cuánto se hizo?»—, y la
 * pantalla lo dice con esas palabras para que nadie lea otra cosa.
 *
 * ─── POR QUÉ DOS COLORES Y NO TRES ───
 *
 * La primera versión iba a tener tres tramos: a tiempo (verde), tarde (ámbar) y sin cumplir (rojo).
 * El validador de paletas lo tumbó con un número: **ámbar y rojo están a ΔE 5,5 para un
 * deuteranope** —y a 8,5 con visión normal—, así que en una barra apilada serían el mismo color
 * para una de cada doce personas. Quedan dos tramos, cumplido y no cumplido, que se separan por
 * ΔE 26. Lo de «a tiempo o tarde» no se pierde: vive en el detalle de cada mes, donde se lee con
 * palabras y no con un tono.
 *
 * ─── LO QUE NO SE DIBUJA ───
 *
 * Un mes **sin nada que venciera** no es un cero: es un mes sin barra. Pintarlo a cero dibujaría un
 * valle que no existió, y en enero —cuando la plataforma llevaba dos semanas— eso es exactamente lo
 * que habría pasado.
 */
export function Evolucion() {
  const enCurso = new Date().getFullYear();
  const [year, setYear] = useState(enCurso);
  const [datos, setDatos] = useState<DatosEvolucion | null>(null);
  const [fallo, setFallo] = useState(false);

  useEffect(() => {
    setDatos(null);
    setFallo(false);
    void getEvolucion(year)
      .then(setDatos)
      .catch(() => setFallo(true));
  }, [year]);

  const anios = Array.from({ length: 4 }, (_, indice) => enCurso - indice);

  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-[15px] font-semibold text-ink-900">Cómo fue el año</h2>
          <p className="mt-0.5 text-sm text-ink-500">
            Cada barra es lo que <strong className="font-medium text-ink-700">vencía</strong> ese mes; lo
            verde, lo que se cumplió.
          </p>
        </div>
        <div className="w-32 shrink-0">
          <Combo
            value={String(year)}
            onChange={(id) => setYear(Number(id))}
            options={anios.map((valor) => ({ id: String(valor), label: String(valor) }))}
          />
        </div>
      </div>

      {fallo ? (
        <p className="mt-4 rounded-lg bg-paper px-4 py-3 text-sm text-ink-700">
          No se pudo cargar la evolución. El resto de la pantalla sigue sirviendo.
        </p>
      ) : !datos ? (
        <Skeleton className="mt-5 h-56 w-full" />
      ) : datos.resumen.vencian === 0 ? (
        <EmptyState
          className="mt-4"
          icon={TrendingUp}
          title={`En ${year} no venció nada`}
          description="Sin obligaciones con plazo en ese año no hay evolución que dibujar. Prueba con otro año."
        />
      ) : (
        <Grafica datos={datos} />
      )}
    </section>
  );
}

function Grafica({ datos }: { datos: DatosEvolucion }) {
  const mesActual = new Date().getFullYear() === datos.year ? new Date().getMonth() + 1 : null;
  const conDatos = datos.meses.filter((mes) => mes.vencian > 0);
  const techo = Math.max(...datos.meses.map((mes) => mes.vencian), 1);
  /*
    QUE SE ROTULA, Y QUE NO. La regla es «etiquetas selectivas, nunca un numero en cada punto»: doce
    porcentajes en fila se leen de uno en uno y tapan la forma, que es lo unico que la grafica aporta
    sobre una tabla. Se rotulan dos: el mes en curso —donde esta la atencion— y el PEOR, que es el
    que hay que mirar. Los demas salen al pasar el raton, y todos estan en la tabla de abajo.
  */
  const peor = conDatos.reduce<MesDeEvolucion | null>(
    (peorHastaAhora, mes) =>
      peorHastaAhora === null || (mes.pct ?? 100) < (peorHastaAhora.pct ?? 100) ? mes : peorHastaAhora,
    null,
  );

  return (
    <>
      <div className="mt-5 flex flex-wrap items-end gap-x-6 gap-y-2">
        <p>
          <span className="font-display text-[32px] font-bold leading-none tabular-nums text-ink-900">
            {datos.resumen.pct}%
          </span>
          <span className="ml-2 text-sm text-ink-500">de lo que vencía en {datos.year} se cumplió</span>
        </p>
        <p className="text-xs text-ink-500">
          <span className="tabular-nums text-ink-700">{datos.resumen.cumplidas}</span> de{' '}
          <span className="tabular-nums text-ink-700">{datos.resumen.vencian}</span> obligaciones ·{' '}
          <span className="tabular-nums text-ink-700">{datos.resumen.aTiempo}</span> dentro del plazo
        </p>
      </div>

      <div className="mt-5 flex h-48 items-end gap-1.5" role="img" aria-label={resumenAccesible(datos)}>
        {datos.meses.map((mes) => (
          <Barra
            key={mes.mes}
            mes={mes}
            techo={techo}
            esActual={mes.mes === mesActual}
            rotular={mes.mes === mesActual || (peor !== null && mes.mes === peor.mes && mes.vencian > 0)}
          />
        ))}
      </div>

      <div className="mt-2 flex gap-1.5">
        {datos.meses.map((mes) => (
          <p
            key={mes.mes}
            className={cn(
              'flex-1 text-center text-[11px]',
              mes.mes === mesActual ? 'font-semibold text-ink-900' : mes.vencian === 0 ? 'text-ink-300' : 'text-ink-500',
            )}
          >
            {monthName(mes.mes).slice(0, 3)}
          </p>
        ))}
      </div>

      {/*
        LA LEYENDA SIEMPRE, con dos series. Y con la palabra al lado del color, nunca el color solo:
        es lo que sostiene la lectura de quien no distingue los dos tonos.
      */}
      <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-ink-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-ok" aria-hidden />
          Cumplidas
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-line-strong" aria-hidden />
          Sin cumplir
        </span>
        <span className="text-ink-300">Un mes sin barra es un mes en el que no vencía nada.</span>
      </div>

      {/*
        LA TABLA NO ES UN EXTRA. El gris de «sin cumplir» queda por debajo de 3:1 contra la
        superficie —el validador lo marca— y esa deuda se salda con los numeros escritos, no
        ignorandola. Ademas es lo que se copia al acta del comite.
      */}
      <details className="mt-4">
        <summary className="focus-ring cursor-pointer text-xs text-ink-500 hover:text-ink-900">
          Ver los números
        </summary>
        <table className="mt-2 w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-ink-500">
              <th className="py-1.5 font-medium">Mes</th>
              <th className="py-1.5 text-right font-medium">Vencían</th>
              <th className="py-1.5 text-right font-medium">Cumplidas</th>
              <th className="py-1.5 text-right font-medium">A tiempo</th>
              <th className="py-1.5 text-right font-medium">%</th>
            </tr>
          </thead>
          <tbody>
            {datos.meses.map((mes) => (
              <tr key={mes.mes} className="border-b border-line last:border-0">
                <td className="py-1.5 text-ink-700">{monthName(mes.mes)}</td>
                <td className="py-1.5 text-right tabular-nums text-ink-700">{mes.vencian || '—'}</td>
                <td className="py-1.5 text-right tabular-nums text-ink-700">{mes.vencian ? mes.cumplidas : '—'}</td>
                <td className="py-1.5 text-right tabular-nums text-ink-700">{mes.vencian ? mes.aTiempo : '—'}</td>
                <td className="py-1.5 text-right tabular-nums font-medium text-ink-900">
                  {mes.pct === null ? '—' : `${mes.pct}%`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </>
  );
}

function Barra({
  mes,
  techo,
  esActual,
  rotular,
}: {
  mes: MesDeEvolucion;
  techo: number;
  esActual: boolean;
  rotular: boolean;
}) {
  const alto = (mes.vencian / techo) * 100;
  const cumplido = mes.vencian === 0 ? 0 : (mes.cumplidas / mes.vencian) * 100;

  return (
    <div className="group relative flex h-full flex-1 flex-col justify-end">
      {rotular && mes.pct !== null ? (
        <p className="mb-1 text-center text-[11px] font-semibold tabular-nums text-ink-700">{mes.pct}%</p>
      ) : null}

      {mes.vencian === 0 ? null : (
        <div className="flex w-full flex-col justify-end gap-0.5" style={{ height: `${alto}%` }}>
          {/* Lo que falta va arriba y sin redondear abajo: los dos tramos son una sola barra partida. */}
          {cumplido < 100 ? (
            <div className="w-full flex-1 rounded-t-[4px] bg-line-strong" style={{ minHeight: 2 }} />
          ) : null}
          {cumplido > 0 ? (
            <div
              className={cn('w-full bg-ok', cumplido === 100 ? 'rounded-[4px]' : 'rounded-b-[4px]')}
              style={{ height: `${cumplido}%`, minHeight: 2 }}
            />
          ) : null}
        </div>
      )}

      {esActual ? <span className="mt-1 h-0.5 w-full rounded-full bg-ink-300" aria-hidden /> : null}

      {/*
        EL DETALLE AL PASAR EL RATON. Aqui es donde vive «a tiempo o tarde», que no se pinta como
        color: con palabras no hay dos tonos que confundir.
      */}
      {mes.vencian > 0 ? (
        <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden w-max -translate-x-1/2 rounded-lg bg-ink-900 px-2.5 py-1.5 text-xs text-white shadow-card group-hover:block">
          <p className="font-medium">{monthName(mes.mes)}</p>
          <p className="text-white/80">
            {mes.cumplidas} de {mes.vencian} cumplidas
          </p>
          <p className="text-white/60">
            {mes.aTiempo} dentro del plazo
            {mes.cumplidas > mes.aTiempo ? ` · ${mes.cumplidas - mes.aTiempo} tarde` : ''}
          </p>
        </div>
      ) : null}
    </div>
  );
}

/** Lo que oye quien no ve la gráfica. Un `role="img"` sin esto es un hueco en la pantalla. */
function resumenAccesible(datos: DatosEvolucion): string {
  const conDatos = datos.meses.filter((mes) => mes.vencian > 0);
  if (conDatos.length === 0) return `En ${datos.year} no venció ninguna obligación.`;
  const detalle = conDatos.map((mes) => `${monthName(mes.mes)}: ${mes.pct}%`).join('; ');
  return `Cumplimiento de ${datos.year} por mes. ${detalle}.`;
}

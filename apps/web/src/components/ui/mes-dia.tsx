'use client';

import { Select } from './select';

/**
 * LA FECHA DE UNA CAMPANA ANUAL: mes y dia, sin año.
 *
 * ─── POR QUE NO ES UN CALENDARIO ───
 *
 * Un calendario pide elegir UN dia de UN año concreto, y esto no es una fecha: es un dia del año
 * que se repite —"cada año antes del 31 de marzo"—. Con un calendario habria que elegir 2026 y
 * despues ignorar el año, que es peor que no tenerlo.
 *
 * ─── POR QUE NO ES UN CAMPO DE TEXTO ───
 *
 * Era un campo donde se escribia "03-31" a mano, y el tenant acabo con la reinduccion en `09-31`.
 * Septiembre tiene 30 dias. No fallaba nada —la fecha se desbordaba al mes siguiente en silencio—,
 * asi que la campaña vencia el 1 de octubre mientras la pantalla seguia diciendo 09-31.
 *
 * Con dos listas, el 31 de septiembre **no existe para elegir**: los dias salen del mes. Es la
 * diferencia entre rechazar un error y hacerlo imposible.
 *
 * El 29 de febrero SI se puede elegir: es legitimo para una campaña, y los años que no son
 * bisiestos cae en el 28 (lo resuelve `nextFixedDate`).
 */
const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

/** Dias del mes, contando febrero como bisiesto para que el 29 se pueda elegir. */
function diasDe(mes: number): number {
  return new Date(Date.UTC(2024, mes, 0)).getUTCDate();
}

export interface MesDiaProps {
  /** "MM-DD", o cadena vacia. */
  value: string;
  onChange: (valor: string) => void;
  /** Prefijo para los `id` de los dos desplegables, que necesitan ser unicos en la pagina. */
  idBase: string;
  disabled?: boolean;
}

export function MesDia({ value, onChange, idBase, disabled }: MesDiaProps) {
  const [mesTexto, diaTexto] = value.split('-');
  const mes = Number(mesTexto) || 1;
  const dia = Number(diaTexto) || 1;
  const maximo = diasDe(mes);

  const emitir = (nuevoMes: number, nuevoDia: number) => {
    // Al cambiar de mes, un dia que ya no existe se acota en vez de quedarse invalido: quien pasa
    // de "31 de marzo" a "septiembre" quiere el ultimo dia de septiembre, no un error.
    const diaValido = Math.min(nuevoDia, diasDe(nuevoMes));
    onChange(`${String(nuevoMes).padStart(2, '0')}-${String(diaValido).padStart(2, '0')}`);
  };

  return (
    <div className="flex gap-2">
      <Select
        id={`${idBase}-mes`}
        aria-label="Mes de la campaña"
        className="flex-1"
        value={String(mes)}
        disabled={disabled}
        onChange={(e) => emitir(Number(e.target.value), dia)}
      >
        {MESES.map((nombre, i) => (
          <option key={nombre} value={i + 1}>
            {nombre}
          </option>
        ))}
      </Select>
      <Select
        id={`${idBase}-dia`}
        aria-label="Dia de la campaña"
        className="w-24"
        value={String(Math.min(dia, maximo))}
        disabled={disabled}
        onChange={(e) => emitir(mes, Number(e.target.value))}
      >
        {Array.from({ length: maximo }, (_, i) => i + 1).map((d) => (
          <option key={d} value={d}>
            {d}
          </option>
        ))}
      </Select>
    </div>
  );
}

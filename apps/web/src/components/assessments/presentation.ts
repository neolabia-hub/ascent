/**
 * COMO SE VE EL EXAMEN (Decision #85).
 *
 * Lo pidio el cliente en dos frases: *"la interfaz de aprendiz debe ser lo mejor tipo Typeform,
 * transiciones, dinamica y wow"* y *"desde admin configuracion como diseño, colores o
 * animaciones"*.
 *
 * Es un puñado CERRADO de opciones y no un editor de temas, por dos razones:
 *
 *   - un selector de color libre deja pintar texto gris sobre fondo gris, y quien arma un examen
 *     de alturas no tiene por que saber de contraste. Aqui cada acento trae su par claro y su par
 *     de texto ya comprobados;
 *   - lo que no se puede romper no hay que mantenerlo. Seis acentos y tres transiciones caben en
 *     la cabeza; un tema libre acaba siendo una pantalla de soporte.
 *
 * Vive en la EVALUACION y no en su version: el color no es evidencia. Retocarlo no cambia que se
 * pregunto ni como se califico, asi que no puede exigir una version nueva ni poner en duda un
 * intento del ano pasado.
 */

export type Accent = 'brand' | 'indigo' | 'teal' | 'violet' | 'amber' | 'rose';
export type Transition = 'slide' | 'fade' | 'none';
export type Pace = 'one' | 'all';

export interface Presentation {
  accent: Accent;
  transition: Transition;
  /** Una pregunta por pantalla (Typeform) o todas en una lista (formulario de siempre). */
  pace: Pace;
  autoAdvance: boolean;
  background: 'plain' | 'gradient';
  optionLetters: boolean;
}

export const PRESENTATION_DEFAULT: Presentation = {
  accent: 'brand',
  transition: 'slide',
  pace: 'one',
  autoAdvance: false,
  background: 'plain',
  optionLetters: true,
};

/** Lo guardado puede venir a medias (o vacio): siempre se lee con los valores por defecto debajo. */
export function readPresentation(raw: unknown): Presentation {
  const value = (raw ?? {}) as Partial<Presentation>;
  return { ...PRESENTATION_DEFAULT, ...value };
}

/**
 * Cada acento con su familia completa. `soft` es el fondo de lo elegido y `ring` su borde; los
 * tres se eligieron para que el texto de siempre (`--ink-900`) siga legible encima de `soft`.
 * `brand` no trae valores: hereda los del tenant, que es lo correcto por defecto.
 */
export const ACCENTS: Record<Accent, { label: string; solid: string; soft: string; ring: string; on: string }> = {
  brand: { label: 'El de la empresa', solid: 'var(--brand-primary)', soft: 'var(--primary-soft)', ring: 'var(--brand-primary)', on: '#ffffff' },
  indigo: { label: 'Indigo', solid: '#4f46e5', soft: '#eef2ff', ring: '#818cf8', on: '#ffffff' },
  teal: { label: 'Verde azulado', solid: '#0d9488', soft: '#effcf9', ring: '#5eead4', on: '#ffffff' },
  violet: { label: 'Violeta', solid: '#7c3aed', soft: '#f5f3ff', ring: '#c4b5fd', on: '#ffffff' },
  amber: { label: 'Ambar', solid: '#b45309', soft: '#fffbeb', ring: '#fcd34d', on: '#ffffff' },
  rose: { label: 'Rosa', solid: '#e11d48', soft: '#fff1f2', ring: '#fda4af', on: '#ffffff' },
};

/**
 * Las variables que consume el escenario. Se ponen en un contenedor y no en `:root` para que la
 * VISTA PREVIA del administrador pueda pintarse con el acento del examen sin teñir la pantalla
 * de armado que la rodea.
 */
export function accentVars(accent: Accent): React.CSSProperties {
  const palette = ACCENTS[accent] ?? ACCENTS.brand;
  return {
    ['--ex-solid' as string]: palette.solid,
    ['--ex-soft' as string]: palette.soft,
    ['--ex-ring' as string]: palette.ring,
    ['--ex-on' as string]: palette.on,
  };
}

export const TRANSITION_LABEL: Record<Transition, string> = {
  slide: 'Deslizar',
  fade: 'Desvanecer',
  none: 'Ninguna',
};

export const TRANSITION_HINT: Record<Transition, string> = {
  slide: 'La pregunta entra desde el lado al que se avanza. Es lo que da la sensacion de avanzar.',
  fade: 'Mas sobria: aparece y desaparece sin movimiento lateral.',
  none: 'Cambio seco. Es lo mas rapido en equipos viejos.',
};

/**
 * LO QUE VA IMPRESO EN UNA CONSTANCIA, congelado POR VALOR (Decision #14).
 *
 * ─── POR QUE POR VALOR Y NO POR REFERENCIA ───
 *
 * Una constancia es un documento con fecha. Dice que el 3 de marzo de 2026, TAL persona, con TAL
 * cedula, aprobo TAL formacion de TANTAS horas, y que respondia por ella TAL persona con TAL cargo.
 * Todo eso cambia despues: la gente se casa y cambia de apellido, cambia de cargo, se va de la
 * empresa; las formaciones se renombran y se les cambia la duracion; quien respondia se jubila.
 *
 * Si el papel se armara leyendo las tablas al momento de imprimirlo, **el pasado cambiaria cada
 * vez que se reimprime**, y un auditor que pida la misma constancia dos veces obtendria dos
 * documentos distintos. Eso no es un detalle estetico: invalida la evidencia.
 *
 * Asi que al emitir se copian TODOS los valores aqui y el PDF se arma solo con esto. Ninguna
 * consulta a `users`, a `activities` ni a `tenants` mientras se dibuja el papel.
 *
 * ─── QUE NO VA AQUI ───
 *
 * Nada que pueda cambiar y DEBA verse actualizado: si la constancia esta revocada, si sigue
 * vigente. Eso es estado vivo y se lee de la fila, no del snapshot — porque revocar tiene que
 * surtir efecto en la verificacion publica de inmediato.
 */
export interface CertificateSnapshot {
  /** Version del formato del snapshot. Sin esto, cambiar la forma rompe los ya emitidos. */
  schemaVersion: 1;

  persona: {
    fullName: string;
    documentType: string;
    documentNumber: string;
    /** El cargo QUE TENIA. El de hoy puede ser otro y el papel no habla de hoy. */
    jobTitle: string | null;
    area: string | null;
  };

  formacion: {
    name: string;
    code: string;
    /** El tipo con su nombre de entonces: la empresa puede renombrar sus tipos. */
    typeName: string | null;
    versionNumber: number;
    /** Horas que acredita. Puede ser null: no todas las formaciones acreditan horas. */
    hours: number | null;
    /** El temario tal cual estaba publicado, para el reverso del papel. */
    syllabus: unknown;
    /** Quien respondia por la formacion cuando se publico esa version (Decision #64). */
    responsibleName: string | null;
    responsibleJobTitle: string | null;
  };

  resultado: {
    /** PASSED cuando hubo evaluacion; COMPLETED cuando no la habia. Dicen cosas distintas. */
    status: string;
    /** La nota, solo si hubo evaluacion. Imprimir "0%" donde no hubo examen seria mentir. */
    scorePct: number | null;
    completedAt: string;
  };

  empresa: {
    name: string;
    /** El nombre comercial de la marca, que puede no ser la razon social. */
    displayName: string;
    /** La clave del logo, no una URL firmada: las firmas caducan y esto se guarda para siempre. */
    logoKey: string | null;
  };
}

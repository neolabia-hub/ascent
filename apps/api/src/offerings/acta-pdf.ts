import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';

/**
 * EL ACTA DE LA SESION (mecanismo 3, `PENDIENTES` 2.4).
 *
 * ─── QUE ES, Y POR QUE UN PDF Y NO UNA PANTALLA ───
 *
 * Es el papel que se le entrega al auditor: quien dicto, cuando, donde, quienes asistieron y con
 * que firma. La pantalla ya dice todo eso y aun asi hace falta el documento, porque una auditoria
 * se lleva archivos y no accesos: el acta tiene que poder imprimirse, mandarse por correo y
 * archivarse durante veinte años (CLAUDE.md, principio 4) sin depender de que esta plataforma siga
 * existiendo.
 *
 * ─── TODO LLEGA YA RESUELTO ───
 *
 * Ni una consulta desde aqui, igual que en la constancia: quien dibuja no decide. Asi el acta se
 * puede probar entera sin base de datos, que es lo unico que hace que se prueben los casos feos —la
 * lista de cuarenta que no cabe en una hoja, el nombre larguisimo, la firma que falta—.
 *
 * ─── LA HUELLA VA DENTRO Y FUERA ───
 *
 * El hash del contenido se calcula sobre los DATOS —no sobre los bytes del PDF, que cambian con la
 * fecha de generacion— y se imprime en el pie. Dos actas de la misma sesion con el mismo contenido
 * tienen la misma huella, y eso es lo que permite decir "este papel es el que genero el sistema" sin
 * tener que confiar en el papel.
 */

const A4_ANCHO = 595.28;
const A4_ALTO = 841.89;
const MARGEN = 48;

export interface FilaDelActa {
  nombre: string;
  documento: string;
  cargo: string | null;
  estado: 'PRESENT' | 'ABSENT' | 'JUSTIFIED';
  metodo: 'INSTRUCTOR' | 'QR' | 'SIGNATURE';
  /** Sello de tiempo de su marca, en hora de Bogota y ya formateado. */
  marcadaA: string | null;
  /** La firma, ya leida del almacen. `null` = no firmo (o no se pidio firma). */
  firma: Buffer | null;
}

export interface DatosDelActa {
  empresa: string;
  formacion: string;
  jornada: string;
  fecha: string;
  lugar: string | null;
  instructor: string | null;
  intensidad: string | null;
  generadaEl: string;
  generadaPor: string;
  filas: FilaDelActa[];
  /** La huella del contenido, calculada fuera (ver `huellaDelActa`). */
  huella: string;
}

const ESTADOS: Record<FilaDelActa['estado'], string> = {
  PRESENT: 'Asistio',
  ABSENT: 'No asistio',
  JUSTIFIED: 'Falta justificada',
};

const METODOS: Record<FilaDelActa['metodo'], string> = {
  INSTRUCTOR: 'Lista',
  QR: 'QR',
  SIGNATURE: 'Firma',
};

/**
 * LA HUELLA SALE DE LOS DATOS, NO DEL ARCHIVO.
 *
 * El PDF lleva dentro su fecha de generacion, asi que sus bytes cambian cada vez aunque la sesion
 * sea identica: un hash del archivo no serviria para comparar dos copias. Lo que se firma es lo que
 * el acta AFIRMA — quien, cuando, y quien asistio con que estado—, en un orden estable.
 *
 * Se pasa la funcion de hash desde fuera para que este modulo siga sin importar nada del sistema y
 * se pueda probar entero.
 */
export function textoParaHuella(datos: Omit<DatosDelActa, 'huella' | 'generadaEl' | 'generadaPor'>): string {
  const filas = [...datos.filas]
    .map((fila) => `${fila.documento}|${fila.estado}|${fila.metodo}|${fila.firma ? 'firmada' : 'sin-firma'}`)
    .sort();
  return [datos.empresa, datos.formacion, datos.jornada, datos.fecha, datos.lugar ?? '', ...filas].join('\n');
}

export async function dibujarActa(datos: DatosDelActa): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const normal = await pdf.embedFont(StandardFonts.Helvetica);
  const negrita = await pdf.embedFont(StandardFonts.HelveticaBold);

  let page = pdf.addPage([A4_ANCHO, A4_ALTO]);
  let y = A4_ALTO - MARGEN;

  const escribir = (texto: string, x: number, alto: number, fuente: PDFFont, tamano: number, gris = 0.15) => {
    page.drawText(texto, { x, y: alto, size: tamano, font: fuente, color: rgb(gris, gris, gris) });
  };

  escribir('ACTA DE SESION', MARGEN, y, negrita, 16);
  y -= 18;
  escribir(datos.empresa, MARGEN, y, normal, 10, 0.4);
  y -= 26;

  escribir(datos.formacion, MARGEN, y, negrita, 12);
  y -= 16;
  const cabecera = [
    `Convocatoria ${datos.jornada}`,
    `Fecha: ${datos.fecha}`,
    datos.lugar ? `Lugar: ${datos.lugar}` : null,
    datos.instructor ? `Dicta: ${datos.instructor}` : null,
    datos.intensidad ? `Intensidad: ${datos.intensidad}` : null,
  ].filter((linea): linea is string => linea !== null);
  for (const linea of cabecera) {
    escribir(linea, MARGEN, y, normal, 9.5, 0.35);
    y -= 13;
  }

  y -= 10;
  page.drawLine({
    start: { x: MARGEN, y },
    end: { x: A4_ANCHO - MARGEN, y },
    thickness: 0.7,
    color: rgb(0.75, 0.75, 0.75),
  });
  y -= 18;

  const columnas = { nombre: MARGEN, documento: 232, estado: 316, metodo: 410, firma: 470 };
  const titulos = () => {
    escribir('Nombre', columnas.nombre, y, negrita, 9);
    escribir('Documento', columnas.documento, y, negrita, 9);
    escribir('Estado', columnas.estado, y, negrita, 9);
    escribir('Como', columnas.metodo, y, negrita, 9);
    escribir('Firma', columnas.firma, y, negrita, 9);
    y -= 14;
  };
  titulos();

  /** Alto de fila: la firma es una imagen y necesita sitio; sin firma basta una linea de texto. */
  const ALTO_FILA = 34;

  for (const fila of datos.filas) {
    // Salto de pagina ANTES de dibujar, no despues: una fila partida entre dos hojas es una fila que
    // en una auditoria se lee dos veces o ninguna.
    if (y < MARGEN + 60) {
      page = pdf.addPage([A4_ANCHO, A4_ALTO]);
      y = A4_ALTO - MARGEN;
      titulos();
    }

    escribir(recortar(fila.nombre, 34), columnas.nombre, y, normal, 9.5);
    if (fila.cargo) escribir(recortar(fila.cargo, 34), columnas.nombre, y - 10, normal, 7.5, 0.5);
    escribir(fila.documento, columnas.documento, y, normal, 9.5);
    escribir(ESTADOS[fila.estado], columnas.estado, y, normal, 9.5);
    escribir(METODOS[fila.metodo], columnas.metodo, y, normal, 9.5, 0.4);
    if (fila.marcadaA) escribir(fila.marcadaA, columnas.metodo, y - 10, normal, 7.5, 0.5);

    if (fila.firma) {
      const imagen = await incrustar(pdf, fila.firma);
      if (imagen) {
        // La firma se ESCALA a la caja sin deformarla: una firma estirada deja de parecerse a la que
        // la persona hizo, y eso es justo lo que un perito mira.
        const caja = { ancho: 78, alto: 26 };
        const escala = Math.min(caja.ancho / imagen.width, caja.alto / imagen.height);
        page.drawImage(imagen, {
          x: columnas.firma,
          y: y - 6,
          width: imagen.width * escala,
          height: imagen.height * escala,
        });
      }
    } else {
      escribir('—', columnas.firma, y, normal, 9.5, 0.6);
    }

    y -= ALTO_FILA;
    page.drawLine({
      start: { x: MARGEN, y: y + 20 },
      end: { x: A4_ANCHO - MARGEN, y: y + 20 },
      thickness: 0.3,
      color: rgb(0.88, 0.88, 0.88),
    });
  }

  // El pie va en TODAS las hojas: una hoja suelta de un acta tiene que poder identificarse sola.
  for (const hoja of pdf.getPages()) {
    pie(hoja, normal, datos);
  }

  return pdf.save();
}

function pie(page: PDFPage, fuente: PDFFont, datos: DatosDelActa): void {
  const texto = `Generada el ${datos.generadaEl} por ${datos.generadaPor} · Huella ${datos.huella.slice(0, 32)}`;
  page.drawText(texto, {
    x: MARGEN,
    y: 28,
    size: 7,
    font: fuente,
    color: rgb(0.45, 0.45, 0.45),
  });
}

function recortar(texto: string, maximo: number): string {
  return texto.length <= maximo ? texto : `${texto.slice(0, maximo - 1)}…`;
}

async function incrustar(pdf: PDFDocument, imagen: Buffer) {
  try {
    // La firma se captura en PNG desde el navegador; se intenta JPEG por si alguien sube una foto.
    return imagen[0] === 0x89 ? await pdf.embedPng(imagen) : await pdf.embedJpg(imagen);
  } catch {
    // Una firma ilegible no puede tumbar el acta entera: la fila sale sin ella, que es la verdad.
    return null;
  }
}

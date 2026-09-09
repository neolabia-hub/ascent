/**
 * El saludo segun la hora. Vive aqui porque lo usan LAS DOS barras superiores (Decision #109) y
 * estaba escrito solo en la del aprendiz.
 *
 * Sin franja para la madrugada a proposito: quien entra a las cuatro de la mañana en esta empresa
 * es el turno que arranca, y "buenas noches" a alguien que empieza su jornada se lee como una
 * despedida. Antes de las doce, buenos dias.
 */
export function saludoDe(now: Date = new Date()): string {
  const hora = now.getHours();
  if (hora < 12) return 'Buenos días';
  if (hora < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

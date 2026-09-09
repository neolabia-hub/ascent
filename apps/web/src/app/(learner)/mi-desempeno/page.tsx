'use client';

import { EvaluarDesempeno } from '@/components/modules/desempeno/evaluar-desempeno';
import { MiDesempeno } from '@/components/modules/desempeno/mi-desempeno';

/**
 * DESEMPENO: UN SOLO SITIO, para las dos cosas (Decision #140).
 *
 * ─── LO QUE ESTABA PARTIDO ───
 *
 * Habia dos destinos para el mismo asunto y la puerta dependia de quien eras: quien califica
 * entraba por "Evaluaciones" en el menu; quien no califica a nadie —la inmensa mayoria— tenia lo
 * suyo escondido en el Perfil, entre las constancias. Nadie busca su evaluacion de desempeno en el
 * perfil. Y quien hacia las dos cosas tenia que aprender dos rutas para un solo tema.
 *
 * Ahora es UNA pantalla, "Desempeno", que enseña lo que a cada quien le toca:
 *
 *   - Si te evaluaron, LO TUYO arriba: la de tu jefe y la propia, para leer y firmar.
 *   - Si calificas a alguien, tu lista de pendientes debajo, con cuanto llevas.
 *   - Si te toca todo, las dos cosas, en ese orden — lo propio se lee en un minuto; calificar a
 *     veinte lleva media hora, y lo largo no se pone primero.
 *
 * ─── Y SIGUE SIN SER UN ITEM PERMANENTE VACIO ───
 *
 * El menu lo enseña cuando hay ALGO —algo que responder o algo tuyo que leer— y lo esconde cuando
 * no hay nada (ver `learner-shell`). Un item fijo que casi todo el año no lleva a ninguna parte
 * enseña a la gente a no pulsarlo, y el dia que si tiene algo tampoco lo pulsan.
 */
export default function DesempenoPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-[26px] font-semibold text-ink-900 lg:text-[32px]">Desempeno</h1>
        <p className="mt-1 text-sm leading-relaxed text-ink-500">
          Como va tu trabajo, y el de la gente que calificas. Se responde una vez y no se puede
          corregir despues.
        </p>
      </div>

      <MiDesempeno />
      <EvaluarDesempeno />
    </div>
  );
}

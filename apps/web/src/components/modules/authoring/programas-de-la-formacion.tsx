'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Layers, Plus } from 'lucide-react';
import { motivoDelError } from '@/lib/api';
import { addModule, getProgramasDeFormacion, listPrograms, type ProgramListItem, type ProgramStatus } from '@/lib/programs-api';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { useToast } from '@/components/ui/toast';

/**
 * ¿ESTA FORMACIÓN ES MÓDULO DE ALGÚN PROGRAMA? (2026-09-16)
 *
 * ─── EL HUECO QUE CIERRA ───
 *
 * Desde la ficha de una formación no había forma de saberlo, y tiene una consecuencia que
 * sorprende: **si es módulo de un programa PUBLICADO, deja de emitir constancia individual** — la
 * evidencia que vale pasa a ser la del conjunto. Quien no sabe que su formación está en un programa
 * no entiende por qué dejó de certificar, y lo vive como un fallo.
 *
 * ─── POR QUÉ SE PUEDE AGREGAR DESDE AQUÍ, PERO NO CREAR EL PROGRAMA ───
 *
 * Agregarla a uno que ya existe es cómodo justo cuando se acaba de crear la formación y ya se sabe
 * dónde va: ahorra el viaje a la otra pantalla.
 *
 * **Crearlo desde aquí, no.** Un programa no es un atributo de una formación: tiene orden, regla de
 * aprobación, cupo y audiencia, y nada de eso se puede decidir desde una pieza suelta. Un programa
 * nacido de un desplegable saldría sin descripción, sin regla configurada y sin nadie obligado — y
 * nadie vuelve a arreglarlo. Desde aquí se enlaza a Programas, que es donde eso se hace.
 */
export function ProgramasDeLaFormacion({ activityId }: { activityId: string }) {
  const { showToast } = useToast();
  const [pertenece, setPertenece] = useState<Array<{ id: string; name: string; status: ProgramStatus }> | null>(null);
  const [disponibles, setDisponibles] = useState<ProgramListItem[]>([]);
  const [elegido, setElegido] = useState('');
  const [busy, setBusy] = useState(false);
  /** El selector no está puesto de entrada: se abre solo si alguien dice que quiere hacerlo. */
  const [abierto, setAbierto] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const [suyos, todos] = await Promise.all([getProgramasDeFormacion(activityId), listPrograms()]);
      setPertenece(suyos);
      const yaEsta = new Set(suyos.map((p) => p.id));
      setDisponibles(todos.filter((p) => !yaEsta.has(p.id)));
    } catch {
      setPertenece([]);
    }
  }, [activityId]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const agregar = async () => {
    setBusy(true);
    try {
      // `isRequired: true` es el defecto del esquema y el que no sorprende: si hace falta que cuente
      // para un cupo, eso se decide en el programa, que es donde se ve el conjunto.
      await addModule(elegido, { activityId, isRequired: true });
      setElegido('');
      await cargar();
      showToast({ kind: 'success', title: 'Agregada al programa' });
    } catch (error) {
      showToast({ kind: 'danger', title: 'No se pudo agregar al programa', description: motivoDelError(error) });
    } finally {
      setBusy(false);
    }
  };

  if (!pertenece) return null;

  const enPublicado = pertenece.some((p) => p.status === 'PUBLISHED');

  /*
    UNA LÍNEA CUANDO YA PERTENECE, NADA CUANDO NO (2026-09-16).

    La primera versión era una tarjeta con título, explicación, selector y pie — cuatro bloques para
    un dato que la mayoría de las formaciones no tienen. El cliente lo dijo: *"que no ocupe espacio;
    si ya pertenece, decirlo corto"*. Una ficha que gana un recuadro por cada cosa que se podría
    saber acaba siendo imposible de leer.

    Así que: si pertenece, **una línea**. Si no, **un enlace** que abre el selector solo cuando
    alguien quiere hacerlo.
  */
  if (pertenece.length > 0) {
    return (
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md bg-paper px-3 py-2 text-sm text-ink-700">
        <Layers size={14} className="shrink-0 text-ink-500" strokeWidth={2} aria-hidden="true" />
        <span>
          Módulo de{' '}
          {pertenece.map((programa, indice) => (
            <span key={programa.id}>
              {indice > 0 ? ', ' : ''}
              <Link href={`/programas/${programa.id}`} className="focus-ring rounded font-medium text-ink-900 hover:underline">
                {programa.name}
              </Link>
              {programa.status !== 'PUBLISHED' ? ' (en borrador)' : ''}
            </span>
          ))}
          {/* La consecuencia, dicha donde sorprende: es la razón de que esta línea exista. */}
          {enPublicado ? <span className="text-ink-500"> · su constancia la emite el programa</span> : null}
        </span>
      </p>
    );
  }

  if (disponibles.length === 0) return null;

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="focus-ring rounded text-left text-xs text-ink-500 underline-offset-2 hover:text-ink-700 hover:underline"
      >
        ¿Esta formación es parte de un programa?
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md bg-paper px-3 py-2">
      <Select
        aria-label="Agregar a un programa"
        className="h-9 min-w-0 flex-1"
        value={elegido}
        onChange={(e) => setElegido(e.target.value)}
      >
        <option value="">Elegir un programa...</option>
        {disponibles.map((programa) => (
          <option key={programa.id} value={programa.id}>
            {programa.name}
            {programa.status === 'PUBLISHED' ? '' : '  (en borrador)'}
          </option>
        ))}
      </Select>
      <Button size="sm" onClick={() => void agregar()} loading={busy} disabled={!elegido}>
        <Plus size={14} />
        Agregar
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setAbierto(false)} disabled={busy}>
        Cancelar
      </Button>
    </div>
  );
}

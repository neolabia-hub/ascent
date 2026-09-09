'use client';

import { useState } from 'react';
import { Check, Pencil, Plus, Tags, Trash2, X } from 'lucide-react';
import { motivoDelError } from '@/lib/api';
import {
  borrarQuestionCategory,
  createQuestionCategory,
  renombrarQuestionCategory,
  type QuestionCategory,
} from '@/lib/catalog-api';
import { Button } from '@/components/ui/button';
import { Drawer } from '@/components/ui/drawer';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';

/**
 * LOS TEMAS DEL BANCO, ADMINISTRABLES DESDE DONDE SE USAN (2026-09-09).
 *
 * ─── QUÉ ES UN TEMA, QUE ES LO PRIMERO QUE NADIE SABÍA ───
 *
 * Una **etiqueta** que se le pone a una pregunta. No la cambia, no la agrupa en ningún sitio y no
 * sale en el examen. Sirve para **una sola cosa**: que un bloque al azar pueda decir «sácame 10 de
 * *Alturas*». Si todas tus evaluaciones eligen las preguntas a mano, no hace falta ninguno — por eso
 * el campo dice «Sin tema» y es opcional.
 *
 * ─── POR QUÉ AQUÍ Y NO EN UNA PANTALLA PROPIA ───
 *
 * Porque nadie entra a la plataforma a «administrar temas»: entra a armar un examen y se encuentra
 * con que el tema que necesita está mal escrito o sobra. Una pestaña de primer nivel volvería a
 * cobrar el peaje que la Decisión #84 quitó —salirse a crear una categoría antes de escribir la
 * primera pregunta—. Esto vive dentro del editor, a un clic del sitio donde el tema significa algo.
 *
 * ─── LO QUE SE PUEDE HACER, Y LO QUE NO ───
 *
 * Crear, renombrar y borrar. **Renombrar no reescribe historia**: el nombre es una etiqueta, y lo
 * que un intento guarda es el enunciado de la pregunta, no el nombre del tema. **Borrar solo si está
 * vacío**: con preguntas dentro, el servidor lo rechaza y dice por qué — un bloque al azar que
 * apunta a un tema borrado se quedaría sin de dónde sacar.
 */
export function AdministrarTemas({
  open,
  onOpenChange,
  categories,
  onCambio,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: QuestionCategory[];
  /** Se llama tras cada cambio para que quien la abrió recargue su lista. */
  onCambio: () => Promise<void> | void;
}) {
  const { showToast } = useToast();
  const [nuevo, setNuevo] = useState('');
  const [editando, setEditando] = useState<string | null>(null);
  const [borrador, setBorrador] = useState('');
  const [ocupado, setOcupado] = useState(false);

  async function crear() {
    if (nuevo.trim().length < 2) return;
    setOcupado(true);
    try {
      await createQuestionCategory(nuevo.trim());
      setNuevo('');
      await onCambio();
    } catch (error) {
      showToast({ kind: 'danger', title: 'No se pudo crear el tema', description: motivoDelError(error) });
    } finally {
      setOcupado(false);
    }
  }

  async function renombrar(id: string) {
    if (borrador.trim().length < 2) return;
    setOcupado(true);
    try {
      await renombrarQuestionCategory(id, borrador.trim());
      setEditando(null);
      await onCambio();
    } catch (error) {
      showToast({ kind: 'danger', title: 'No se pudo renombrar', description: motivoDelError(error) });
    } finally {
      setOcupado(false);
    }
  }

  async function borrar(id: string) {
    setOcupado(true);
    try {
      await borrarQuestionCategory(id);
      await onCambio();
    } catch (error) {
      // El servidor explica por qué no se puede —cuántas preguntas tiene dentro—, y esa frase es la
      // que hay que enseñar: «no se pudo» a secas manda a adivinar.
      showToast({ kind: 'danger', title: 'No se pudo borrar el tema', description: motivoDelError(error) });
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title="Temas del banco"
      description="Etiquetas para agrupar preguntas. Solo hacen falta para los bloques al azar."
    >
      <p className="text-sm text-ink-500">
        Un tema no cambia la pregunta ni sale en el examen: sirve para que un bloque al azar pueda
        decir <em>«saca 10 de este montón»</em>. Si eliges las preguntas a mano, no necesitas ninguno.
      </p>

      <div className="mt-5 flex items-end gap-2">
        <div className="flex-1">
          <label htmlFor="tema-nuevo" className="mb-1.5 block text-[13px] font-medium text-ink-700">
            Tema nuevo
          </label>
          <Input
            id="tema-nuevo"
            placeholder="Alturas, Seguridad vial, Manipulación de alimentos..."
            value={nuevo}
            onChange={(e) => setNuevo(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void crear();
            }}
          />
        </div>
        <Button size="sm" className="mb-0.5" disabled={nuevo.trim().length < 2} loading={ocupado} onClick={() => void crear()}>
          <Plus className="h-4 w-4" aria-hidden /> Crear
        </Button>
      </div>

      <div className="mt-6">
        {categories.length === 0 ? (
          <EmptyState
            icon={Tags}
            title="Todavía no hay temas"
            description="Crea uno arriba, o sigue sin ellos: solo hacen falta si algún examen va a sacar preguntas al azar."
          />
        ) : (
          <ul className="divide-y divide-line">
            {categories.map((tema) => (
              <li key={tema.id} className="flex items-center gap-3 py-2.5">
                {editando === tema.id ? (
                  <>
                    <Input
                      className="h-9 flex-1"
                      value={borrador}
                      autoFocus
                      onChange={(e) => setBorrador(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void renombrar(tema.id);
                        if (e.key === 'Escape') setEditando(null);
                      }}
                    />
                    <button
                      type="button"
                      aria-label={`Guardar el nombre de ${tema.name}`}
                      className="focus-ring rounded-md p-1.5 text-ok hover:bg-ok-soft"
                      onClick={() => void renombrar(tema.id)}
                    >
                      <Check className="h-4 w-4" aria-hidden />
                    </button>
                    <button
                      type="button"
                      aria-label="Cancelar"
                      className="focus-ring rounded-md p-1.5 text-ink-500 hover:text-ink-900"
                      onClick={() => setEditando(null)}
                    >
                      <X className="h-4 w-4" aria-hidden />
                    </button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 text-sm text-ink-900">{tema.name}</span>
                    {/*
                      CUÁNTAS PREGUNTAS TIENE, siempre a la vista: es lo que decide si un bloque al
                      azar puede usarlo y lo que explica por qué no se deja borrar.
                    */}
                    <span className="text-xs tabular-nums text-ink-500">
                      {tema._count.questions} {tema._count.questions === 1 ? 'pregunta' : 'preguntas'}
                    </span>
                    <button
                      type="button"
                      aria-label={`Renombrar ${tema.name}`}
                      className="focus-ring rounded-md p-1.5 text-ink-500 hover:text-ink-900"
                      onClick={() => {
                        setEditando(tema.id);
                        setBorrador(tema.name);
                      }}
                    >
                      <Pencil className="h-4 w-4" aria-hidden />
                    </button>
                    <button
                      type="button"
                      aria-label={`Borrar ${tema.name}`}
                      className="focus-ring rounded-md p-1.5 text-ink-500 hover:text-danger disabled:opacity-40"
                      disabled={ocupado}
                      onClick={() => void borrar(tema.id)}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Drawer>
  );
}

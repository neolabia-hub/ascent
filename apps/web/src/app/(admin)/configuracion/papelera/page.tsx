'use client';

import { ArrowLeft, RotateCcw, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { listarPapelera, restaurarFormacion, type FormacionEnPapelera } from '@/lib/catalog-api';
import { motivoDelError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { TBody, THead, Table, Td, Th, Tr } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';

/**
 * LA PAPELERA (2026-09-30). Como la papelera de reciclaje de Moodle: lo eliminado no se borra, se
 * guarda aqui, y se puede devolver tal como estaba. Solo con el permiso individual
 * `catalog:force_delete`, que ningun rol tiene.
 *
 * NO HAY «VACIAR LA PAPELERA», y es deliberado. Lo que hay aqui es evidencia del SG-SST —quien la
 * hizo, que constancia se emitio— y la ley pide guardarla 20 años. Un boton que la destruya seria el
 * unico de toda la plataforma capaz de perder evidencia de verdad.
 *
 * Restaurar deshace EXACTAMENTE lo que hizo la eliminacion (lo anoto al hacerla): reglas,
 * obligaciones, convocatorias, inscripciones y constancias vuelven a su estado anterior, y solo si
 * nadie las toco despues.
 */
export default function PapeleraPage() {
  const { showToast } = useToast();
  const [filas, setFilas] = useState<FormacionEnPapelera[] | null>(null);
  const [confirmando, setConfirmando] = useState<string | null>(null);
  const [restaurando, setRestaurando] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      setFilas(await listarPapelera());
    } catch (error) {
      setFilas([]);
      showToast({ kind: 'danger', title: 'No se pudo abrir la papelera', description: motivoDelError(error) });
    }
  }, [showToast]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function restaurar(fila: FormacionEnPapelera) {
    setRestaurando(fila.id);
    try {
      const r = await restaurarFormacion(fila.id);
      showToast({
        kind: 'success',
        title: `«${fila.name}» restaurada`,
        description: `Vuelve tal como estaba: ${r.obligaciones} obligación(es), ${r.convocatorias} convocatoria(s) y ${r.constancias} constancia(s) recuperadas.`,
      });
      setConfirmando(null);
      await cargar();
    } catch (error) {
      showToast({ kind: 'danger', title: 'No se pudo restaurar', description: motivoDelError(error) });
    } finally {
      setRestaurando(null);
    }
  }

  return (
    <div className="max-w-5xl">
      <Link href="/configuracion" className="focus-ring mb-4 inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-700">
        <ArrowLeft size={14} />
        Configuración
      </Link>
      <h1 className="font-display text-[28px] font-semibold text-ink-900">Papelera</h1>
      <p className="mb-6 mt-1 max-w-3xl text-sm text-ink-500">
        Las formaciones eliminadas. No aparecen en ninguna parte ni cuentan en Seguimiento, pero nada se borró: al
        restaurar una, vuelve tal como estaba.
      </p>

      {filas === null ? (
        <Skeleton className="h-48 w-full" />
      ) : filas.length === 0 ? (
        <EmptyState icon={Trash2} title="La papelera está vacía" description="Aquí aparecen las formaciones que se eliminen." />
      ) : (
        <div className="card overflow-hidden">
          <Table>
            <THead>
              <Tr>
                <Th>Formación</Th>
                <Th>Eliminada</Th>
                <Th>Motivo</Th>
                <Th className="w-48 text-right">Acción</Th>
              </Tr>
            </THead>
            <TBody>
              {filas.map((fila) => (
                <Tr key={fila.id}>
                  <Td>
                    <p className="font-medium text-ink-900">{fila.name}</p>
                    <p className="text-xs text-ink-500">
                      {fila.code} · {fila.typeName}
                    </p>
                  </Td>
                  <Td className="text-sm text-ink-700">
                    {new Date(fila.deletedAt).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })}
                    {fila.eliminadaPor ? <span className="block text-xs text-ink-500">por {fila.eliminadaPor}</span> : null}
                  </Td>
                  <Td className="text-sm text-ink-700">
                    {fila.motivo ?? '—'}
                    {fila.constanciasAnuladas > 0 ? (
                      <span className="block text-xs text-ink-500">{fila.constanciasAnuladas} constancia(s) anulada(s)</span>
                    ) : null}
                  </Td>
                  <Td className="text-right">
                    {confirmando === fila.id ? (
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => setConfirmando(null)} disabled={restaurando === fila.id}>
                          Cancelar
                        </Button>
                        <Button size="sm" loading={restaurando === fila.id} onClick={() => void restaurar(fila)}>
                          Confirmar
                        </Button>
                      </div>
                    ) : (
                      <Button variant="outline" size="sm" onClick={() => setConfirmando(fila.id)}>
                        <RotateCcw size={14} />
                        Restaurar
                      </Button>
                    )}
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </div>
      )}
    </div>
  );
}

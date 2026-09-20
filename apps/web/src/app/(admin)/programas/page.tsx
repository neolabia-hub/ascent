'use client';

import { Layers, Plus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError, motivoDelError } from '@/lib/api';
import { createProgram, listPrograms, type ProgramListItem, type ProgramStatus } from '@/lib/programs-api';
import { ActivityCover } from '@/components/modules/activity-cover';
import { Button } from '@/components/ui/button';
import { cn } from '@/components/ui/cn';
import { Drawer } from '@/components/ui/drawer';
import { EmptyState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toast';

/**
 * EL COLOR DE LOS PROGRAMAS ES FIJO, no el de la marca (Decision 2026-09-15).
 *
 * Una formación toma el color de su TIPO —cada tenant elige los suyos—, pero un programa no
 * tiene tipo. Fijarlo aparte hace que, en cualquier tenant, "esto es un programa" se reconozca
 * por el color antes de leer la palabra, igual que el icono `Layers` en el menú.
 */
const COLOR_PROGRAMA = '#4338ca';

/** Igual que `sugerirCodigo` de Contenido formativo: mayusculas, sin tildes, sin relleno. */
const RELLENO = new Set(['DE', 'DEL', 'LA', 'EL', 'LOS', 'LAS', 'Y', 'EN', 'PARA', 'A', 'AL', 'CON', 'POR']);
function sugerirCodigo(nombre: string): string {
  const palabras = nombre
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const utiles = palabras.filter((palabra) => !RELLENO.has(palabra));
  return (utiles.length > 0 ? utiles : palabras).slice(0, 3).join('_').slice(0, 40);
}

type Filtro = 'TODOS' | ProgramStatus;

/**
 * BANCO DE PROGRAMAS (2026-09-14, PENDIENTES 11.4): varias formaciones bajo un solo paraguas,
 * certificadas como un conjunto. Un programa NO tiene versiones ni contenido propio —eso lo
 * aportan sus modulos, que son formaciones normales— asi que esta pantalla es mas corta que
 * Contenido formativo: crear, agregar modulos, publicar, asignar.
 */
export default function ProgramasPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const [data, setData] = useState<ProgramListItem[] | null>(null);
  const [filtro, setFiltro] = useState<Filtro>('TODOS');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [form, setForm] = useState({ codeTouched: false, codeOpen: false, code: '', name: '', description: '' });

  const load = useCallback(async () => {
    try {
      setData(await listPrograms());
    } catch (error) {
      showToast({ kind: 'danger', title: 'No se pudieron cargar los programas', description: motivoDelError(error) });
    }
  }, [showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async () => {
    setCreating(true);
    setFormError(null);
    try {
      const programa = await createProgram({
        code: form.code.trim().toUpperCase(),
        name: form.name.trim(),
        description: form.description.trim() || null,
      });
      setDrawerOpen(false);
      setForm({ codeTouched: false, codeOpen: false, code: '', name: '', description: '' });
      showToast({ kind: 'success', title: 'Programa creado', description: 'Ahora agrégale sus módulos.' });
      router.push(`/programas/${programa.id}`);
    } catch (error) {
      const mensajes: Record<string, string> = {
        DUPLICATE_CODE: 'Ya existe un programa con ese código. Cámbialo en "Código".',
      };
      setFormError(
        error instanceof ApiError
          ? (mensajes[error.code] ?? `No se pudo crear el programa (${error.code}).`)
          : 'No se pudo crear el programa: no hubo respuesta del servidor.',
      );
    } finally {
      setCreating(false);
    }
  };

  const valid = form.code.trim().length >= 2 && form.name.trim().length >= 3;
  const visibles = useMemo(() => (data ?? []).filter((p) => filtro === 'TODOS' || p.status === filtro), [data, filtro]);
  const conteos = useMemo(() => {
    const base = { TODOS: data?.length ?? 0, DRAFT: 0, PUBLISHED: 0, RETIRED: 0 };
    for (const p of data ?? []) base[p.status] += 1;
    return base;
  }, [data]);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-[28px] font-semibold text-ink-900">Programas</h1>
          <p className="mt-1 text-sm text-ink-500">
            Formaciones agrupadas bajo un solo paraguas, con una constancia para el conjunto —no una por módulo.
          </p>
        </div>
        <Button onClick={() => setDrawerOpen(true)}>
          <Plus size={16} />
          Nuevo programa
        </Button>
      </div>

      {!data ? (
        <Skeleton className="h-64 w-full" />
      ) : data.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={Layers}
            title="Sin programas todavía"
            description='Crea el primero: por ejemplo, "Inducción general" con un módulo por área.'
            action={
              <Button onClick={() => setDrawerOpen(true)}>
                <Plus size={16} />
                Nuevo programa
              </Button>
            }
          />
        </div>
      ) : (
        <div>
          {/*
            FILTRO POR ESTADO, misma forma que las pestanas de "Mi aprendizaje": un grupo de
            pildoras, no un desplegable — con pocos programas por tenant, elegir de un vistazo
            gana a abrir un select para ver tres opciones.
          */}
          <div role="tablist" aria-label="Filtrar programas" className="mb-4 flex w-fit gap-1 rounded-full bg-paper p-1">
            {(
              [
                ['TODOS', `Todos (${conteos.TODOS})`],
                ['DRAFT', `Borrador (${conteos.DRAFT})`],
                ['PUBLISHED', `Publicado (${conteos.PUBLISHED})`],
              ] as const
            ).map(([valor, etiqueta]) => (
              <button
                key={valor}
                type="button"
                role="tab"
                aria-selected={filtro === valor}
                onClick={() => setFiltro(valor)}
                className={cn(
                  'focus-ring h-9 rounded-full px-4 text-sm font-medium transition-colors duration-150 ease-pulse',
                  filtro === valor ? 'bg-surface text-ink-900 shadow-card' : 'text-ink-500 hover:text-ink-700',
                )}
              >
                {etiqueta}
              </button>
            ))}
          </div>

          {visibles.length === 0 ? (
            <div className="card px-5 py-8 text-center text-sm text-ink-500">Ningún programa en este estado.</div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {visibles.map((programa, index) => (
                <Link
                  key={programa.id}
                  href={`/programas/${programa.id}`}
                  style={{ animationDelay: `${Math.min(index, 8) * 30}ms` }}
                  className="focus-ring animate-card-in group block overflow-hidden rounded-xl border border-line bg-surface transition-shadow duration-150 ease-pulse hover:shadow-card-hover"
                >
                  <ActivityCover
                    seed={programa.id}
                    colorHex={COLOR_PROGRAMA}
                    label={programa.status === 'PUBLISHED' ? 'PROGRAMA' : 'PROGRAMA · BORRADOR'}
                  />
                  <div className="p-4">
                    <h3 className="line-clamp-2 font-display text-base font-semibold leading-snug text-ink-900 transition-colors duration-150 group-hover:text-primary">
                      {programa.name}
                    </h3>
                    <p className="mt-1.5 line-clamp-2 text-sm text-ink-500">
                      {programa.description || `${programa.totalModulos} módulo${programa.totalModulos === 1 ? '' : 's'}`}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      <Drawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        title="Nuevo programa"
        description="Se crea en borrador. Le agregas sus módulos y lo publicas cuando esté listo."
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDrawerOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={create} loading={creating} disabled={!valid}>
              Crear programa
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Field htmlFor="p-name" label="Nombre" required>
            <Input
              id="p-name"
              value={form.name}
              onChange={(e) =>
                setForm((previo) => ({
                  ...previo,
                  name: e.target.value,
                  code: previo.codeTouched ? previo.code : sugerirCodigo(e.target.value),
                }))
              }
              placeholder="Programa de Inducción General"
              maxLength={200}
            />
          </Field>

          <Field htmlFor="p-description" label="Descripción" hint="Lo que ve el aprendiz antes de saber qué módulos trae. Opcional.">
            <Textarea
              id="p-description"
              rows={3}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Ej. Un módulo por área: quien complete todos recibe la constancia del conjunto."
              maxLength={500}
            />
          </Field>

          {form.codeOpen ? (
            <Field htmlFor="p-code" label="Código" required hint="Identificador corto y estable. No se puede cambiar.">
              <Input
                id="p-code"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase(), codeTouched: true })}
                placeholder="INDUCCION_GENERAL"
                maxLength={40}
              />
            </Field>
          ) : (
            <button
              type="button"
              onClick={() => setForm({ ...form, codeOpen: true })}
              className="focus-ring flex w-full items-center justify-between rounded-md px-1 py-1.5 text-left text-sm text-ink-500 transition-colors duration-150 hover:text-ink-900"
            >
              <span>
                Código: <span className="font-medium text-ink-700">{form.code || 'se propone del nombre'}</span>
              </span>
              <span className="text-xs">Cambiar</span>
            </button>
          )}

          {formError ? (
            <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
              {formError}
            </p>
          ) : null}
        </div>
      </Drawer>
    </div>
  );
}

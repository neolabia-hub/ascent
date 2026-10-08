'use client';

import { CalendarX } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { listUsers } from '@/lib/admin-api';
import { Ayuda } from '@/components/ui/ayuda';

/**
 * QUIEN NO TIENE FECHA DE INGRESO, dicho donde se elige contar desde ella (2026-10-06).
 *
 * La reinduccion automatica cuenta desde la fecha de ingreso de cada persona. A quien no la tiene
 * se le cuenta desde que termino su induccion de ingreso o, si tampoco, desde que entro al grupo:
 * funciona, pero la fecha que sale no es la que el administrador cree. El cliente pidio que se diga
 * QUIENES son y que se pueda ir a corregirlos: el enlace abre Usuarios ya filtrado.
 *
 * UNA LINEA, Y NEUTRA. La primera version era un parrafo amarillo; el cliente la pidio corta y sin
 * ese color. Afuera queda la cifra y adonde ir; los nombres y el porque, detras del icono. El unico
 * color es el secundario de la empresa, en el icono.
 *
 * Si todos la tienen no pinta nada.
 */
export function SinFechaDeIngreso() {
  const [faltan, setFaltan] = useState<{ total: number; nombres: string[] } | null>(null);

  useEffect(() => {
    let vigente = true;
    void listUsers({ sinFechaDeIngreso: 'true', active: 'true', pageSize: 8 })
      .then((pagina) => {
        if (vigente) setFaltan({ total: pagina.total, nombres: pagina.items.map((persona) => persona.fullName) });
      })
      // Sin permiso para ver usuarios no hay aviso: no es un fallo de esta pantalla.
      .catch(() => undefined);
    return () => {
      vigente = false;
    };
  }, []);

  if (!faltan || faltan.total === 0) return null;
  const resto = faltan.total - faltan.nombres.length;

  return (
    <div className="flex items-center gap-2 rounded-md border border-line bg-paper px-3 py-2 text-xs text-ink-700">
      <CalendarX size={14} className="shrink-0" strokeWidth={2} style={{ color: 'var(--brand-accent)' }} />
      <p className="min-w-0 flex-1">
        <strong className="font-semibold text-ink-900">
          {faltan.total === 1 ? '1 persona activa sin fecha de ingreso' : `${faltan.total} personas activas sin fecha de ingreso`}
        </strong>
        {' · '}
        <Link href="/usuarios?sinIngreso=1" className="focus-ring rounded font-medium underline underline-offset-2">
          Ver en Usuarios
        </Link>
      </p>
      <Ayuda sobre="quién no tiene fecha de ingreso">
        <p>
          A estas personas se les cuenta desde que terminaron su inducción de ingreso o, si tampoco la tienen, desde
          que entraron al grupo. Para que cuente su fecha real, complétala en su ficha.
        </p>
        <p className="mt-2 font-medium text-ink-900">Quiénes son</p>
        <p className="mt-0.5">
          {faltan.nombres.join(', ')}
          {resto > 0 ? ` y ${resto} más.` : '.'}
        </p>
      </Ayuda>
    </div>
  );
}

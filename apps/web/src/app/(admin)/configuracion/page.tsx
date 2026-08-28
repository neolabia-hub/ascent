'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ShieldCheck, SlidersHorizontal } from 'lucide-react';
import { CatalogManager, type CatalogManagerProps } from '@/components/config/catalog-manager';
import { Button } from '@/components/ui/button';
import { cn } from '@/components/ui/cn';

interface Section extends CatalogManagerProps {
  label: string;
  description: string;
}

/** Los 8 catalogos parametrizables del tenant (CLAUDE.md 3.2), gobernados por configuracion. */
const SECTIONS: Section[] = [
  { catalogKey: 'areas', label: 'Areas', singular: 'area', feminine: true, description: 'Unidades organizacionales a las que pertenecen las personas.' },
  { catalogKey: 'processes', label: 'Procesos', singular: 'proceso', description: 'Sistemas de gestion que originan la formacion (SGI, SST, PESV, SARLAFT...).' },
  { catalogKey: 'job-title-types', label: 'Tipos de cargo', singular: 'tipo de cargo', description: 'Clasificacion gruesa de los cargos (administrativo, operativo, comercial).' },
  {
    catalogKey: 'job-titles',
    label: 'Cargos',
    singular: 'cargo',
    description: 'Cargos de la organizacion. Definen las inducciones especificas y las audiencias.',
    extraFields: [{ key: 'jobTitleTypeId', label: 'Tipo de cargo', kind: 'select', optionsFrom: 'job-title-types', required: true }],
  },
  { catalogKey: 'services', label: 'Servicios', singular: 'servicio', description: 'Lineas de servicio del negocio (almacenamiento, masivo, paqueteo).' },
  { catalogKey: 'regionals', label: 'Regionales', singular: 'regional', feminine: true, description: 'Sedes geograficas de la operacion.' },
  {
    catalogKey: 'norms',
    label: 'Normas',
    singular: 'norma',
    feminine: true,
    description: 'Normas a las que tributa la formacion (BASC, BPM, PESV, ISO...).',
    extraFields: [{ key: 'annualHoursRequired', label: 'Horas/ano exigidas', kind: 'number', hint: 'Ej.: BPM exige 10 horas anuales por manipulador. Vacio si no aplica.' }],
  },
  {
    catalogKey: 'activity-types',
    label: 'Tipos de actividad',
    singular: 'tipo de actividad',
    description: 'Los caminos de formacion (induccion, plan, extraordinaria, pildora). Los del sistema no se eliminan.',
    extraFields: [{ key: 'colorHex', label: 'Color', kind: 'color', hint: 'Identifica el tipo en listas y reportes.' }],
  },
];

export default function ConfiguracionPage() {
  const [active, setActive] = useState(0);
  const section = SECTIONS[active] as Section;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-[28px] font-semibold text-ink-900">Configuracion</h1>
          <p className="mt-1 text-sm text-ink-500">Catalogos y preferencias del tenant. Todo parametrizable, nada en codigo.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/configuracion/roles">
            <Button variant="outline">
              <ShieldCheck size={16} />
              Roles y permisos
            </Button>
          </Link>
          <Link href="/configuracion/preferencias">
            <Button variant="outline">
              <SlidersHorizontal size={16} />
              Preferencias y marca
            </Button>
          </Link>
        </div>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row">
        <nav className="flex shrink-0 flex-row flex-wrap gap-1 lg:w-56 lg:flex-col" aria-label="Catalogos">
          {SECTIONS.map((s, i) => (
            <button
              key={s.catalogKey}
              onClick={() => setActive(i)}
              className={cn(
                'focus-ring rounded-md px-3 py-2 text-left text-sm transition-colors duration-150',
                i === active ? 'bg-[var(--brand-primary-soft)] font-medium text-ink-900' : 'text-ink-500 hover:bg-paper hover:text-ink-700',
              )}
            >
              {s.label}
            </button>
          ))}
        </nav>

        <div className="min-w-0 flex-1">
          <div className="mb-4">
            <h2 className="font-display text-lg font-semibold text-ink-900">{section.label}</h2>
            <p className="text-sm text-ink-500">{section.description}</p>
          </div>
          <CatalogManager
            key={section.catalogKey}
            catalogKey={section.catalogKey}
            singular={section.singular}
            feminine={section.feminine}
            extraFields={section.extraFields}
          />
        </div>
      </div>
    </div>
  );
}

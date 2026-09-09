'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Award, ClipboardCheck, Layers, ShieldCheck, SlidersHorizontal } from 'lucide-react';
import { CatalogManager, type CatalogManagerProps } from '@/components/config/catalog-manager';
import { Button } from '@/components/ui/button';
import { cn } from '@/components/ui/cn';

interface Section extends CatalogManagerProps {
  label: string;
  description: string;
}

/** Los 8 catalogos parametrizables del tenant (CLAUDE.md 3.2), gobernados por configuracion. */
const SECTIONS: Section[] = [
  {
    catalogKey: 'areas',
    label: 'Areas',
    singular: 'area',
    feminine: true,
    description: 'Unidades organizacionales a las que pertenecen las personas.',
    /*
      QUIEN RESPONDE POR EL AREA. Faltaba, y no era cosmetico: el campo existia en la base desde el
      Sprint 5 y NINGUNA pantalla lo dejaba rellenar, asi que dos funciones que dependen de el
      llevaban meses apuntando a un vacio —la evaluacion de eficacia y el aviso de "alguien
      reprobo"— sin dar error, porque no falla nada cuando no hay a quien avisar.

      Con la evaluacion de desempeno dejo de ser invisible: sin responsable de area no hay quien
      califique, y al abrir un ciclo salen TODAS las personas en la lista de "sin evaluador".
    */
    extraFields: [
      {
        key: 'responsibleUserId',
        label: 'Responsable del área',
        kind: 'user',
        hint: 'Quien evalúa el desempeño de su gente, responde la eficacia de sus formaciones y recibe el aviso cuando alguien reprueba. Es distinto del responsable de un PROCESO: aquel responde por un sistema de gestión, este por las personas.',
      },
    ],
  },
  {
    catalogKey: 'processes',
    label: 'Procesos',
    singular: 'proceso',
    description: 'Sistemas de gestión que originan la formación (SGI, SST, PESV, SARLAFT...).',
    /**
     * De que AREA cuelga este proceso. No es decoracion: es lo que permite que la jefatura del
     * area vea todos sus procesos mientras cada responsable ve solo el suyo (Decision #57).
     * SARLAFT y SST pueden colgar los dos de SGI y seguir siendo cosas distintas, con responsables
     * distintos, que es como funciona de verdad.
     */
    extraFields: [
      {
        key: 'areaId',
        label: 'Área responsable',
        kind: 'select',
        optionsFrom: 'areas',
        /**
         * OBLIGATORIA desde el 2026-08-30. Un proceso sin area no lo ve NINGUNA jefatura de area
         * —su alcance se resuelve buscando los procesos que cuelgan de ella— y nada lo avisaba:
         * el proceso existia, la jefatura entraba y su catalogo salia sin el. El sintoma volvia a
         * ser "no aparece" con la causa a dos pantallas de distancia.
         *
         * El area del proceso y el area de las personas se llaman igual y NO son lo mismo: la de
         * la persona dice donde trabaja; la del proceso dice de quien es ese sistema de gestion.
         * Que "Comercial" exista como area y como proceso es correcto y se resuelve poniendo el
         * proceso Comercial en el area Comercial.
         */
        required: true,
        hint: 'Quien tenga alcance sobre esa área vera este proceso. Si el proceso lleva el nombre de un área, es esa misma.',
      },
      {
        key: 'responsibleUserId',
        label: 'Responsable',
        kind: 'user',
        hint: 'Quien responde por este proceso. No tiene por que ser el jefe del área: SARLAFT y SST cuelgan de la misma área y los llevan personas distintas.',
      },
    ],
  },
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
    description: 'Normas a las que tributa la formación (BASC, BPM, PESV, ISO...).',
    extraFields: [{ key: 'annualHoursRequired', label: 'Horas/año exigidas', kind: 'number', hint: 'Ej.: BPM exige 10 horas anuales por manipulador. Vacio si no aplica.' }],
  },
  /*
    "TIPOS DE ACTIVIDAD" SALIO DE AQUI (Decision #116).

    Estaba como un catalogo mas —crear, renombrar, borrar— y ademas existia "Tipos de formacion"
    en la barra de arriba, que es la MISMA tabla vista de otra manera. Dos entradas para lo mismo,
    con dos nombres distintos para la misma cosa, y ninguna de las dos completa: en el catalogo se
    podia renombrar pero no decir que exige el tipo; en la otra se podia decir que exige pero no
    renombrarlo.

    Ahora hay una sola pantalla, `/configuracion/tipos-de-formacion`, que hace las dos cosas. Y se
    llama "formacion" y no "actividad" porque es la palabra que usa el cliente y la que aparece en
    el resto del producto.
  */
];

export default function ConfiguracionPage() {
  const [active, setActive] = useState(0);
  const section = SECTIONS[active] as Section;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-[28px] font-semibold text-ink-900">Configuración</h1>
          <p className="mt-1 text-sm text-ink-500">Catálogos y preferencias del tenant. Todo parametrizable, nada en código.</p>
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
          {/*
            LOS DOS DE LA CONSTANCIA VAN JUNTOS y en este orden: primero se decide QUE formaciones
            acreditan y despues COMO se ve el papel. Al reves, alguien disena una constancia
            preciosa y descubre semanas mas tarde que su tipo de formacion no la emite.
          */}
          <Link href="/configuracion/tipos-de-formacion">
            <Button variant="outline">
              <Layers size={16} />
              Tipos de formacion
            </Button>
          </Link>
          <Link href="/configuracion/constancias">
            <Button variant="outline">
              <Award size={16} />
              Constancias
            </Button>
          </Link>
          <Link href="/configuracion/encuestas">
            <Button variant="outline">
              <ClipboardCheck size={16} />
              Encuestas
            </Button>
          </Link>
        </div>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row">
        <nav className="flex shrink-0 flex-row flex-wrap gap-1 lg:w-56 lg:flex-col" aria-label="Catálogos">
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

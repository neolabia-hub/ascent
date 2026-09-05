'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { CalendarRange } from 'lucide-react';
import type { ActivityTypeConfig } from '@/lib/activity-type';
import { getPlan, listPlans, type PlanDetail } from '@/lib/delivery-api';
import { monthName } from '@/lib/format';

/**
 * "ESTA ES DEL PLAN" — Y QUE HACE FALTA PARA QUE DE VERDAD LO ESTE.
 *
 * El tipo "Capacitacion del plan" trae `participatesInPlan: true` y al elegirlo la pantalla
 * promete: "Cuenta para los indicadores del plan anual". **Era falso, y nada lo decia.** Crear la
 * formacion no la mete en ningun plan: los indicadores del plan se calculan solo sobre
 * obligaciones nacidas de un RENGLON suyo (regla de oro 2), asi que una capacitacion del plan que
 * nadie programe no cuenta ni para el cumplimiento ni para la cobertura, y en el listado se ve
 * exactamente igual que una que si esta.
 *
 * Lo que faltaba no era automatizarlo: el MES lo decide el analista y no hay forma de adivinarlo.
 * Lo que faltaba era que el paso dejara de ser mudo. Aqui se dice en que estado esta —fuera del
 * plan, o dentro y en que meses— y se ofrece el unico camino que cierra: crear la jornada y el
 * renglon en un acto, sin salir de la ficha.
 *
 * Es el mismo remedio que "Dejarla disponible" en la pestana Quienes, para un agujero de la misma
 * familia: publicar y marcharse dejaba la formacion con candado, y crear una capacitacion del plan
 * y marcharse la deja fuera del plan.
 */

interface ActivityPlanCardProps {
  activityId: string;
  typeConfig: ActivityTypeConfig;
  /** La version publicada. Sin ella no hay nada que convocar: un borrador todavia puede cambiar. */
  publishedVersion: { id: string; versionNumber: number } | null;
}

export function ActivityPlanCard({ activityId, typeConfig, publishedVersion }: ActivityPlanCardProps) {
  /** `undefined` = todavia se esta mirando; `null` = no hay ningun plan abierto al que agregarla. */
  const [plan, setPlan] = useState<PlanDetail | null | undefined>(undefined);

  const load = useCallback(async () => {
    try {
      /**
       * EL PLAN AL QUE SE PROGRAMA es el del ano en curso... salvo que ya este cerrado.
       *
       * Hay uno por ano (Decision #71), asi que no hay que elegir entre varios del mismo ano. Lo
       * que si pasa de verdad es que en noviembre se planea el ano SIGUIENTE, y que el del ano en
       * curso ya se cerro —cerrarlo es lo que lo convirtio en evidencia, y no admite renglones—.
       * Ofrecer ese seria ofrecer algo que el servidor rechaza.
       */
      const abiertos = (await listPlans()).filter((row) => row.status !== 'CLOSED');
      const enCurso = new Date().getFullYear();
      const elegido =
        abiertos.find((row) => row.year === enCurso) ??
        abiertos.filter((row) => row.year > enCurso).sort((a, b) => a.year - b.year)[0] ??
        null;
      setPlan(elegido ? await getPlan(elegido.id) : null);
    } catch {
      // Sin plan que mostrar no se pinta nada: un aviso de error aqui seria ruido en una ficha
      // que la persona abrio para otra cosa.
      setPlan(null);
    }
  }, []);

  useEffect(() => {
    if (!typeConfig.participatesInPlan) return;
    void load();
  }, [typeConfig.participatesInPlan, load]);

  if (!typeConfig.participatesInPlan || plan === undefined) return null;

  const renglones = plan
    ? plan.items.filter((item) => item.offering.activityVersion.activity.id === activityId)
    : [];
  const meses = [...new Set(renglones.map((item) => item.plannedMonth))].sort((a, b) => a - b);
  // El plan elegido ya viene sin CERRADOS, asi que aqui solo queda la pregunta del motivo:
  // agregar a un plan vivo obliga a decir por que (Decision #55).
  const enCurso = new Date().getFullYear();

  return (
    <>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3 rounded-lg border border-line bg-paper px-4 py-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <CalendarRange size={17} className="mt-0.5 shrink-0 text-ink-500" strokeWidth={1.75} />
          <div className="min-w-0 text-sm">
            {plan === null ? (
              <>
                <p className="font-medium text-ink-900">No hay ningun plan abierto al que agregarla.</p>
                <p className="mt-0.5 text-ink-500">
                  Es una capacitacion del plan y su tipo dice que cuenta para los indicadores del plan
                  anual, pero el de {enCurso} no existe o ya esta cerrado:{' '}
                  <Link href="/plan" className="focus-ring underline underline-offset-2">
                    crear el plan de {enCurso}
                  </Link>
                  .
                </p>
              </>
            ) : meses.length > 0 ? (
              <>
                <p className="font-medium text-ink-900">
                  En el plan de {plan.year}: {meses.map((mes) => monthName(mes)).join(', ')}
                  {renglones.length > meses.length ? ` · ${renglones.length} jornadas` : ''}.
                </p>
                <p className="mt-0.5 text-ink-500">
                  De ahi salen su cumplimiento y su cobertura.{' '}
                  <Link href={`/plan/${plan.id}`} className="focus-ring underline underline-offset-2">
                    Ver el plan
                  </Link>
                  .
                </p>
              </>
            ) : (
              <>
                <p className="font-medium text-ink-900">
                  Esta capacitacion no esta en el plan de {plan.year}.
                </p>
                <p className="mt-0.5 text-ink-500">
                  {/*
                    Se dice la consecuencia, no la mecanica. "No tiene renglon" no significa nada
                    para quien acaba de crearla; "no cuenta para ningun indicador" si.
                  */}
                  Mientras no tenga una jornada programada no cuenta para el cumplimiento ni para la
                  cobertura del plan, aunque su tipo diga que es del plan.
                </p>
              </>
            )}
          </div>
        </div>

        {/*
          AQUI YA NO SE PROGRAMA (2026-09-04).

          Habia un boton que abria un cajon para crear la jornada, y en la misma pantalla, una
          pestana mas abajo, esta "Convocatorias" haciendo lo mismo. Dos caminos para lo mismo en la
          misma pantalla no son una comodidad: obligan a preguntarse cual de los dos es el bueno.

          Se queda el que la gente ya usa —la pestana— y desde hoy esa entra al plan SIEMPRE, tambien
          con el plan aprobado, pidiendo el motivo. Antes solo entraba sola con el plan en borrador, y
          esa diferencia invisible era la unica razon para tener dos botones.

          La tarjeta se queda como lo que de verdad es: el aviso de si esta o no en el plan.
        */}
        {plan !== null && !publishedVersion ? (
          <p className="text-xs text-ink-500">Publica el contenido para poder programarla.</p>
        ) : null}
      </div>

    </>
  );
}

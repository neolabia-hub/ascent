'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { CalendarRange } from 'lucide-react';
import type { ActivityTypeConfig } from '@/lib/activity-type';
import { getPlan, listPlans, type PlanDetail } from '@/lib/delivery-api';
import { monthName } from '@/lib/format';
import { Ayuda } from '@/components/ui/ayuda';

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
       * EL PLAN AL QUE SE PROGRAMA es el del año en curso... salvo que ya este cerrado.
       *
       * Hay uno por año (Decision #71), asi que no hay que elegir entre varios del mismo año. Lo
       * que si pasa de verdad es que en noviembre se planea el año SIGUIENTE, y que el del año en
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
    /*
      UNA SOLA LINEA (2026-09-09, lo pidio el cliente mirandolo: «ocupa mucho espacio»).

      Eran dos parrafos —el estado y su explicacion— encima de la ficha, todos los dias, en una
      pantalla que se abre para otra cosa. La explicacion hace falta la primera vez y estorba las
      siguientes, asi que se va detras del icono de ayuda, igual que en el resto del producto.

      LO QUE NO SE HACE es esconder el aviso entero detras de un icono desplegable: cuando NO esta en
      el plan, la formacion no cuenta para ningun indicador, y un aviso que hay que abrir para
      enterarse no es un aviso. Se queda a la vista, en una linea.

      SIN AMBAR NI COLOR DE ESTADO (2026-09-09, dicho por el cliente: «no quiero nada ambar»). Iba
      en el amarillo de advertencia y lo que hacia era gritar en una ficha que se abre todos los
      dias. Lo que distingue los dos casos son LAS PALABRAS —«En el plan de 2026: marzo» frente a
      «No esta en el plan de 2026»—, y esa diferencia se lee igual de rapido sobre el mismo gris.
    */
    <div
      className="mb-5 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-line bg-paper px-4 py-2.5 text-sm"
    >
      <CalendarRange size={16} className="shrink-0 text-ink-500" strokeWidth={1.75} />

      {plan === null ? (
        <>
          <span className="font-medium text-ink-900">No hay ningún plan abierto al que agregarla.</span>
          <Ayuda sobre="por qué hace falta un plan">
            Su tipo dice que cuenta para los indicadores del plan anual, pero el de {enCurso} no
            existe o ya está cerrado.
          </Ayuda>
          <Link href="/plan" className="focus-ring underline underline-offset-2 text-ink-500 hover:text-ink-900">
            Crear el plan de {enCurso}
          </Link>
        </>
      ) : meses.length > 0 ? (
        <>
          <span className="font-medium text-ink-900">
            En el plan de {plan.year}: {meses.map((mes) => monthName(mes)).join(', ')}
            {renglones.length > meses.length ? ` · ${renglones.length} jornadas` : ''}
          </span>
          <Ayuda sobre="qué significa estar en el plan">
            De ahí salen su cumplimiento y su cobertura: los indicadores del plan se calculan solo
            sobre las obligaciones que nacen de un renglón suyo.
          </Ayuda>
          <Link
            href={`/plan/${plan.id}`}
            className="focus-ring underline underline-offset-2 text-ink-500 hover:text-ink-900"
          >
            Ver el plan
          </Link>
        </>
      ) : (
        <>
          <span className="font-medium text-ink-900">No está en el plan de {plan.year}.</span>
          <Ayuda sobre="qué pasa si no está en el plan">
            {/*
              Se dice la consecuencia, no la mecanica. "No tiene renglon" no significa nada para
              quien acaba de crearla; "no cuenta para ningun indicador" si.
            */}
            Mientras no tenga una jornada programada no cuenta para el cumplimiento ni para la
            cobertura del plan, aunque su tipo diga que es del plan. Se programa desde la pestaña
            <strong> Convocatorias</strong>.
          </Ayuda>
          {!publishedVersion ? (
            <span className="text-xs text-ink-500">Publica el contenido para poder programarla.</span>
          ) : null}
        </>
      )}
    </div>
  );
}

# Capacitación del plan

*Lo común a todos los tipos está en `00-el-motor.md`.*

Verificado de punta a punta por `scripts/recorridos/capacitacion-del-plan.mjs` (19 pasos, en verde).
Encontró **dos fallos**, los dos de la misma familia: una regla que existía **solo en la pantalla**.

---

## 1. Qué es

La formación que la empresa **planeó para el año**: "Manejo defensivo, marzo, Cali". Es la única que
cuelga del Plan Anual de Capacitación, con sus metas, su aprobación y sus indicadores.

## 2. La configuración del tipo

```
requiresAssessment: true      requiresSurvey: true
issuesCertificate: true       defaultOfferingKind: EVENT
participatesInPlan: true
```

Es la única con `participatesInPlan: true`, y eso cambia tres cosas del comportamiento normal.

## 3. La obligación la dispara EL PLAN, no un requisito (Decisión #76)

Un requisito es, por definición, una obligación viva en el tiempo: nace al ingresar o al entrar a un
grupo, y **sigue captando a quien llegue después**. Una capacitación del plan no es eso: pasa el mes
que diga el plan, a la gente que el plan congeló al aprobarse.

Por eso:

- La regla se guarda con disparador **`PLAN`** y el motor **no la materializa**. Guarda a quiénes
  —hay que poder consultarlo antes de aprobar— pero no genera nada por su cuenta.
- Las obligaciones nacen **una sola vez, al aprobar el renglón**, con el vencimiento del mes.
- La pestaña Quiénes **no pregunta** disparador, plazo ni recurrencia: los tres campos salen de la
  interfaz, no se ocultan. Un campo que se ve y no hace nada es peor que no tenerlo.

Lo fuerza el **servidor**, ignorando lo que mande el cliente: no es una preferencia de la pantalla,
es una consecuencia del tipo. Que esa puerta estuviera abierta en la matriz por cargo produjo **143
obligaciones de golpe** el 2026-09-03.

## 4. La convocatoria NO se abre sola

`defaultOfferingKind: EVENT`: tiene fecha de sesión, y esa la pone una persona. Publicar la
formación **no** abre nada.

Y programar una jornada **es** ponerla en el plan (Decisión #75): al crear la convocatoria, el
servidor le crea el renglón en el plan de su año —el mes sale de la fecha— **si ese plan está en
BORRADOR**. En un plan aprobado no, porque un renglón nuevo obliga a gente real y exige motivo.

Se puede **programar** con el contenido en borrador; lo que no se puede es **publicar** la
convocatoria (Decisión #77). Planear el año en enero no debería exigir que el contenido de marzo ya
exista.

## 5. Lo comprobado

| | |
|---|---|
| Publicar | **ni requisito ni convocatoria** |
| El requisito | queda en `PLAN` aunque se pida `ON_HIRE`, plazo 0, sin recurrencia, y **no genera nada**: alcanza a 11 y obliga a 0 |
| Programar con el plan en BORRADOR | crea el renglón solo, con el mes de la fecha |
| Con el plan APROBADO | no entra solo, y añadirlo **sin motivo da 409** |
| Publicar la convocatoria | congela los proyectados; sigue sin obligar a nadie |
| **Aprobar el plan** | nacen las obligaciones: `source = PLAN`, todas el **último día del mes** |
| Dos jornadas de lo mismo | **no duplican** la obligación de nadie (Decisión #73) |
| Reprogramar el mes | renglón a `RESCHEDULED`; **no** mueve la fecha de quien ya la tiene |
| Contenido en borrador | se programa, pero no se publica (409 `VERSION_NOT_PUBLISHED`) |
| Quien ingresa después | **no** entra a la jornada ya programada |
| El aprendiz | **no se apunta solo**: 409 `OFFERING_NOT_SELF_SERVICE`. Lo convoca quien la programa, con `POST /offerings/:id/enroll` |
| Cancelar la jornada | retira lo abierto y cancela el renglón |

## 6. Los dos fallos que encontró, arreglados

1. **Cualquier formación entraba al plan por la API.** El filtro de la Decisión #78 vivía solo en la
   pantalla. Meter una inducción general en un plan subió sus proyectados **de 22 a 819**, porque la
   inducción alcanza a la empresa entera: el cumplimiento del año se calculaba contra un denominador
   que no era del plan. Ahora: **409 `ACTIVITY_NOT_PLANNABLE`**.
2. **Cancelar la jornada no cancelaba un renglón REPROGRAMADO.** Solo miraba `PLANNED`, así que un
   renglón al que le habían cambiado el mes seguía diciendo "reprogramada" después de cancelar — y
   el plan lo seguía contando como programado.

## 7. Dos cosas que conviene saber

- **La cuenta del requisito sigue en cero, y es correcto.** Las obligaciones del plan cuelgan del
  RENGLÓN (`plan_item_id`), no de la regla, así que "Lo que se exige hoy" enseña 0 obligadas
  mientras hay 11 personas obligadas de verdad.
- **El vencimiento se lee en hora de Colombia.** Es el final del último día del mes: 31 de mayo a
  las 23:59 de Bogotá es **1 de junio en UTC**. Comparar el ISO en crudo hace fallar una fecha que
  está bien.

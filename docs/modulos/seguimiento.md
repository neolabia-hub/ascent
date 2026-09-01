# Seguimiento de la ejecución

Quién hizo cada formación, quién no, y **por qué no**.

Decisiones #117, #122 y #123.

---

## 1. El hueco que cierra

Había porcentajes —cumplimiento y cobertura del plan— y **ninguna forma de abrirlos**. Quien
administra veía «62%» y no podía contestar lo único que sigue: **¿el 38% quiénes son?**

Sin eso el indicador no sirve para actuar: no se sabe a quién llamar, ni siquiera **si hay a quién
llamar**.

---

## 2. La distinción que lo justifica todo

Dos empresas con la misma formación marcan **62%**:

| | Empresa A | Empresa B |
|---|---|---|
| Terminada | 62 | 62 |
| **Atrasada** | **38** | 0 |
| **Esperando convocatoria** | 0 | **38** |

El indicador es idéntico y lo que hay que hacer es **opuesto**:

- **A** → 38 personas pudieron entrar y no entraron. **Hay a quién llamar.**
- **B** → 38 personas **nunca pudieron**: nadie programó la jornada. Llamarlas sería injusto y
  además inútil; lo que falta es convocar.

Un número solo no distingue esos dos casos. **La barra apilada sí**, sin leer nada. Es la diferencia
entre un indicador que se mira y uno que se usa.

---

## 3. Los seis estados

`apps/api/src/reports/execution-state.ts`

El **orden en que se preguntan** es la decisión:

```
1. ¿Ya la aprobó?          → TERMINADA
2. ¿La reprobó?            → REPROBADA
3. ¿Puede empezarla?  NO   → ESPERANDO
4. ¿Se pasó la fecha?      → ATRASADA
5. ¿La empezó?             → EN CURSO   /   si no → SIN EMPEZAR
```

| Paso | Por qué ahí |
|---|---|
| **1. El resultado manda sobre el plazo** | Una formación aprobada el mes pasado no está «atrasada» porque su fecha haya pasado: está hecha |
| **2. Reprobada es su propio estado** | Hay que reprogramarla. Mezclarla con «sin empezar» la esconde justo cuando hay que hacer algo |
| **3. Esperando gana al vencimiento** | Reclamar un retraso a quien nunca pudo empezar es la misma acusación absurda que se corrigió en la pantalla del aprendiz (Decisión #101) |

### Por qué no sirve el estado del aprendiz

`pending-state.ts` responde *«¿qué hago yo hoy?»* y por eso solo conoce lo pendiente. Este responde
*«¿cómo va la ejecución?»* y necesita ver también lo **terminado** y lo **reprobado**, que para el
aprendiz ya no existe. Unificarlos obligaría a que uno de los dos hablara de estados que no le
sirven.

---

## 4. Una decisión incómoda: qué cuenta en el denominador

**Las que esperan convocatoria SÍ cuentan.**

Sacarlas daría un porcentaje más bonito y falso: si de cien personas cincuenta no han sido
convocadas, el avance real de esa formación es **50%**, no 100% sobre las cincuenta que sí.

El número tiene que doler cuando la ejecución va mal; si no, no sirve para decidir nada.

**Quien ya no trabaja en la empresa NO cuenta.** Su obligación murió con su salida, y dejarlo infla
el denominador con gente que no se va a formar.

---

## 5. Dos niveles, y el segundo es el que importa

```
/reportes  ─────────────────────────────────────────────
  Avance de toda la empresa + barra apilada
  ↓ chips: pulsar "Atrasadas" deja solo las que tienen alguna
  Lista de formaciones, ORDENADAS POR LO QUE HAY QUE MIRAR
  ↓ abrir una (el filtro viaja)
  ─────────────────────────────────────────────────────
  Persona · área · cargo · estado · vence · intentos ·
  nota · encuesta · constancia
  ↓ los chips filtran la tabla
```

**El orden de la lista no es alfabético**: primero lo atrasado, después lo que espera convocatoria,
después lo de menor avance. Con doscientas formaciones, una lista alfabética obliga a recorrerla
entera para encontrar el problema — y entonces no se recorre.

**El plan tiene su pestaña «Cómo va».** Las otras cuatro responden *«¿qué hay en el plan?»*; esta
responde *«¿se está cumpliendo?»*, que es la que hace el auditor. Cada renglón lleva su barra y
enlaza al detalle de su formación.

En el plan se muestran los **proyectados junto a los reales**: si se pactaron 40 personas y hay 25
asignadas, el renglón puede marcar 100% y no cubrir lo prometido. Ese hueco solo se ve poniendo los
dos números juntos.

---

## 6. Detalles de la tabla que son decisiones

- A quien está **esperando** no se le muestra fecha límite. Es la misma acusación absurda del punto
  3: reclamar un plazo a quien nunca pudo empezar.
- Una nota vacía se pinta **«—» y no «0%»**: no haber tenido examen no es haberlo fallado entero.
- **Terminada sin constancia** lleva un icono apagado con su explicación, no un hueco. Esa formación
  puede simplemente no acreditar, y un hueco se lee como que falta algo.
- **Nada en rojo salvo lo reprobado**, que es el único resultado adverso de verdad. Atrasado va en
  ámbar —se hace y ya— y esperando en **neutro**, porque no es un fallo de nadie (Decisión #102).

---

## 7. Rendimiento: dos caminos y por qué

| Camino | Consultas | Para qué |
|---|---|---|
| `ejecucionDeActividad` | 5 (fijas) | El **detalle** de una formación, persona por persona |
| `estadosPorActividad` | **3 (fijas)** | Muchas a la vez: la vista general y el plan |

**El problema que resolvió el segundo:** la vista del plan llamaba a la primera **dentro de un
bucle**. Un plan de 30 renglones = **150 consultas** para pintar una pestaña, y creciendo con el
plan. Justo al revés de lo que debe pasar.

Ahora los datos se traen **una sola vez** con un `IN` y se agrupan en memoria: **3 consultas**, sea
para una formación o para trescientas.

> **Lo que NO se duplica es la regla de estados.** Los dos caminos llaman a
> `resolverEstadoEjecucion`. Si el criterio viviera también en SQL, el día que cambie habría que
> acordarse de dos sitios — y el que se olvide haría que la misma persona salga «atrasada» en una
> pantalla y «esperando» en otra. **Optimizar la consulta está bien; reimplementar el criterio, no.**

---

## 8. Dónde está cada cosa

| Qué | Dónde |
|---|---|
| Los seis estados y el resumen | `apps/api/src/reports/execution-state.ts` |
| Las consultas | `apps/api/src/reports/reports.service.ts` |
| Pantalla general y detalle | `apps/web/src/app/(admin)/reportes/page.tsx` |
| La barra apilada y los chips | `apps/web/src/components/modules/admin/barra-ejecucion.tsx` |
| Pestaña «Cómo va» del plan | `apps/web/src/app/(admin)/plan/[id]/page.tsx` |

---

## 9. Lo que falta

| Pendiente | Criticidad | Nota |
|---|---|---|
| Exportar a Excel / PDF para auditoría | **Alta** | Es lo que se lleva el auditor. Hoy solo se ve en pantalla |
| El enlace del plan **no filtra** al llegar | Media | Lleva a Seguimiento pero no abre esa formación. Falta leer `?formacion=` |
| Indicadores agregados: cobertura por proceso, matriz de competencia, vencimientos | Media | Es el grueso del Sprint 6 |
| Cortar por área, proceso o regional | Media | Hoy solo se filtra por estado y por texto |
| Materializar el avance si un plan pasa de ~300 renglones | Baja | Con 30 no se nota. Sería optimizar algo que nadie ha medido |

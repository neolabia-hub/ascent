# Inducción específica

*La formación del PUESTO. Lo común a todos los tipos está en `00-el-motor.md`.*

Verificado de punta a punta por `scripts/recorridos/induccion-especifica.mjs` (17 pasos, en verde).

---

## 1. Qué es

Lo que hay que saber para hacer **ese trabajo**, no para trabajar en esta empresa. La de bodega
habla de montacargas y estibas; la de conducción, de manejo defensivo y del vehículo. Es lo que el
cliente llama **matriz de inducciones**: qué le toca a cada cargo.

**No es** la inducción general repetida por cargo: la general la hacen todos, ésta solo quien tenga
ese puesto.

## 2. La configuración del tipo

```
requiresAssessment: true      defaultAssignmentMode: BY_JOB_TITLE
issuesCertificate: true       defaultOfferingKind: PERMANENT
```

`BY_JOB_TITLE` es la que la separa de las otras dos "de todos".

## 3. Al publicar NO se exige nada

Esto es lo primero que sorprende, y es correcto:

- **El requisito NO nace solo.** El automatismo de la general solo mira
  `defaultAssignmentMode: ON_HIRE`, y aquí es `BY_JOB_TITLE`. Hay que marcar los cargos.
- **La convocatoria permanente SÍ se abre sola.** Son dos automatismos distintos y solo uno depende
  del cargo.

Así que después de publicar, "Lo que se exige hoy" está vacío hasta que alguien marque un cargo. La
pantalla lo dice.

## 4. Dos puertas, un solo registro

Se declara desde dos sitios, y por debajo escriben **el mismo requisito**:

| Puerta | La pregunta que contesta |
|---|---|
| Pestaña **Quiénes** de la formación | "esta formación, ¿a qué cargos?" |
| **Matriz** de Asignaciones | "este cargo, ¿qué formaciones?" |

La casilla de la matriz **es** el requisito, no un espejo. Encender desde una se ve desde la otra —
comprobado en los pasos 8 y 13 del recorrido.

Que las dos pasen por `setActivityRequirement` no es cosmética. Cuando la matriz llamaba a
`createRule` por su cuenta se saltaba dos reglas: forzaba `ON_HIRE` sobre una capacitación del plan
—creando **143 obligaciones de golpe**, justo lo que la Decisión #76 existe para impedir— y creaba
con plazo **0** mientras la ficha creaba con **−1**. La misma casilla valía distinto según por dónde
se hubiera hecho.

## 5. Una casilla por cargo

Marcar tres cargos de una vez crea **tres requisitos de un cargo**, no uno con los tres dentro. Para
quien lo hace sigue siendo un gesto; lo que cambia es que cada casilla queda independiente y se
enciende y apaga desde cualquiera de las dos puertas. La contrapartida, a la vista: "Lo que se exige
hoy" muestra tres renglones en vez de uno, que es la verdad.

**No se puede partir por abajo**: `audiences.findOrCreate` reutiliza la audiencia entre formaciones,
así que partir "Conductor + Auxiliar" al apagar una casilla cambiaría a quién alcanzan **otras**
formaciones. El sitio de partirlo es arriba, al declararlo.

Un alcance que habla de algo más que cargos —"conductores de Antioquia"— **no se reparte**: es un
grupo de verdad, no tres casillas.

## 6. La novedad

Cambiar una casilla **que está en vigor** exige un motivo de al menos diez caracteres, y lo exige el
**servidor** (`400 REASON_REQUIRED`), no solo la pantalla: un control de auditoría que solo vive en
el navegador no es un control.

No la piden, a propósito:

- **Declarar una casilla nueva.** Montar la matriz del piloto son decenas de casillas seguidas y no
  hay ninguna novedad que contar; el alta queda auditada igual como `ASSIGNMENT_RULE_CREATED`.
- **Reenviar lo mismo.** La pestaña abre con los cargos ya marcados, así que añadir el cuarto
  reenvía los tres de antes. Si cada uno contara como cambio, el usuario acabaría escribiendo "sin
  cambios" para poder pasar — que es como se vacía de sentido un registro de auditoría.
- **Volver a encender una retirada.** La ficha no la enseña y la matriz la pinta apagada, así que
  reencenderla es declarar, no modificar.

Retirar una casilla **sí** la pide siempre: alguien deja de deber una formación legal.

## 7. A quién obliga

| | |
|---|---|
| Alcance | Los cargos marcados |
| Corte de "solo nuevos" | **Se elige.** Para TRANSPRENSA va vacío |
| Vence | **−1 día** del ingreso (D1072), por las dos puertas |

Sin el corte, exigirla crea la obligación a quien **ya** tiene ese cargo. Es lo que el cliente
quiere: la deben nuevos y antiguos.

*Ojo al probar:* sin el corte, exigirla a "Conductor" crea 408 obligaciones de golpe. El recorrido
elige a propósito los dos cargos menos poblados.

## 8. Cambiar de cargo

Es el caso propio de este tipo —una general no lo sufre— y es donde un sistema de cumplimiento se
equivoca callado. `PATCH /users/:id` con otro cargo hace **todo en la misma petición**, sin esperar
al cron:

1. Sale de la audiencia del cargo viejo, entra en la del nuevo.
2. Le **nace** la obligación del cargo nuevo. La deduplicación es *por regla*, no por formación, así
   que tener la otra no la frena.
3. La del cargo viejo pasa a `WITHDRAWN_LEFT_AUDIENCE` —**no se borra**: el auditor pregunta por qué
   dejó de deberla— y se marcan leídos sus avisos, para que la campana no siga reclamando algo que
   ya no debe.

Medido: `PENDING` → `PENDING + WITHDRAWN_LEFT_AUDIENCE`. Dos filas, **una sola viva**, y en "Mi
formación" la ve una vez.

**Lo EN CURSO se respeta**: solo se retira lo `PENDING` y lo `OVERDUE`. Quien ya había empezado la
del cargo viejo la conserva — hay trabajo hecho.

## 9. Lo comprobado

| | |
|---|---|
| Publicar | no exige nada; la convocatoria permanente sí se abre |
| Ficha y matriz | el mismo requisito, en los dos sentidos |
| Añadir un cargo | no toca el del otro: mismo `ruleId`, mismas obligaciones |
| Apagar uno | tampoco, y pide novedad |
| Cambio de cargo | resuelto en el acto, sin cron |
| Al aprobar | constancia con su código |

## 10. Lo que ya hizo NO se le vuelve a pedir (2026-09-05)

Era el único pendiente de este tipo, y se cerró antes de que apareciera en la matriz real.

**Lo que pasaba:** la deduplicación del motor es **por regla** —una obligación por regla, persona y
ronda—, que es lo correcto mientras cada formación cuelgue de un solo cargo. En cuanto la matriz
repite una formación en varios puestos deja de serlo: quien la **completó** y cambia de cargo no
tiene historia con la regla del cargo nuevo, así que le nacía la ronda 1 de algo que acababa de
terminar, con constancia emitida. Y en su pantalla no había nada que se lo explicara.

No era hipotético: en transporte la inducción de bodega vale igual para auxiliar, montacarguista y
coordinador, y es exactamente lo que va a hacer la matriz del cliente.

**Lo que hace ahora** (`decidirPrimeraRonda`, lógica pura, seis pruebas unitarias). Al generar la
ronda 1 se mira si la persona ya completó **esa misma formación** por otra regla:

| | |
|---|---|
| La formación **no se repite** | no le nace nunca. El hecho no caduca: la hizo, punto |
| Su constancia **sigue vigente** | no le nace todavía. Le nacerá cuando se abra la ventana de la vigencia que ya tiene, **con su vencimiento** — el certificado es de la persona, no del cargo |
| Su constancia **caducó** | le nace como a cualquiera, con sus días de gracia. No se hereda una fecha ya pasada: una obligación no puede nacer vencida |

Solo cuenta lo **CUMPLIDO**. Una eximida o una retirada no son evidencia de que la persona sepa
hacer el trabajo: son la explicación de por qué no se le exigió, y esa explicación pertenece al
cargo donde se escribió.

**Y la evidencia no se mueve.** La obligación cumplida del cargo anterior sigue ahí —lo cumplido
nunca se retira— así que el auditor la encuentra donde siempre estuvo. Medido en el paso 14 del
recorrido: antes del cambio 1 CUMPLIDA, después 1 CUMPLIDA y **ninguna viva**.

**Lo que no cambia, y conviene saberlo:** si una formación se exige a la vez por dos reglas
distintas que alcanzan a la misma persona —cargo *y* área, que solo pasa en los tipos de alcance
`MANUAL`— siguen naciéndole **dos** obligaciones. Aquí solo se mira lo cumplido, no lo que está
vivo. No se ha visto en la práctica y no se ha tocado.

## 11. Lo que falta

Nada abierto de este tipo.

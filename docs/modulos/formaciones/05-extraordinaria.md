# Capacitación extraordinaria

*Lo común a todos los tipos está en `00-el-motor.md`.*

Verificado de punta a punta por `scripts/recorridos/extraordinaria.mjs` (13 pasos, en verde a la
primera). Con él se cierra la lista: los **seis** tipos tienen recorrido.

---

## 1. Qué es

La que no estaba planeada y hay que dar: cambió una norma, hubo un incidente, entró un cliente con
una exigencia nueva. Tiene fecha y sesión como la del plan, pero **no cuelga del plan**.

## 2. La configuración del tipo

```
requiresAssessment: true      requiresSurvey: true
issuesCertificate: true       defaultOfferingKind: EVENT
defaultAssignmentMode: MANUAL participatesInPlan: false
```

## 3. Es el tipo que se define por lo que NO hace solo

Las otras cuatro tienen automatismos: publicar una inducción general exige a los nuevos, publicar
una reinducción exige a la plantilla entera y abre convocatoria, programar una capacitación del plan
crea el renglón del año. Aquí **no se dispara nada**, y eso es el tipo, no una carencia.

| | |
|---|---|
| Al publicar | **ni requisito ni convocatoria**: `MANUAL` significa que lo decide una persona |
| El alcance | lo declara el analista: cargos, áreas, regionales, servicios o personas sueltas |
| La convocatoria | de **evento**: fecha, lugar, instructor y cupo. Hay que programarla |
| El plan | **no se toca**, ni programándola ni terminándola |
| Se repite | **no**. Una extraordinaria es de una vez |

## 4. Lo comprobado

| | |
|---|---|
| Publicar | 0 requisitos y 0 convocatorias: lo contrario de los otros cuatro tipos |
| Las facetas del alcance **se cruzan** | cargo 256 · área 142 · **las dos a la vez: 51**. No es la suma |
| Programar la jornada | **no crea renglón** en ningún plan — al revés que la del plan (Decisión #75) |
| Colarla en un plan por la API | **409 `ACTIVITY_NOT_PLANNABLE`**, con el motivo escrito (Decisión #78) |
| La obligación manual | queda con `source = MANUAL`: se ve de dónde salió |
| El aprendiz | **no se apunta solo**: con fecha y cupo, lo convoca quien la programa |
| El temario | lección, examen y **encuesta la última** |
| Al aprobar | constancia con su código |
| Después | **una sola ronda**: no hay campaña ni aniversario que la traiga de vuelta |
| Terminada y certificada | sigue sin tocar ningún plan de ningún año |

El cruce de facetas es la comprobación que más importa de las trece. La trampa clásica de un filtro
por varias facetas es sumarlas: «auxiliares logísticos DE Antioquia» acabaría siendo *todos* los
auxiliares del país **más** *todo* el mundo de Antioquia, la formación le caería a cientos de
personas que nadie quiso obligar, y quien la creó no se enteraría hasta que llegaran las quejas.

## 5. Una nota que costó una corrida entender

El motivo de un 409 viaja en **`title`**, no en `message`: el filtro global mueve allí el `message`
de la excepción y nunca reenvía `message` crudo (`global-exception.filter.ts`, para no exponer
detalle interno). Leerlo por `message` da vacío y parece que el servidor rechaza sin explicar — y no
es verdad, aquí sí explica.

Comparar con `CATALOG_IN_USE`, donde la excepción **no lleva** `message`, así que el `title` acaba
siendo «Conflict Exception» y la pantalla tiene que construir la frase con el desglose que viaja
aparte. Son dos formas distintas de decir por qué no se puede, y conviene saber cuál usa cada una.

## 6. Estado: CERRADA

Nada abierto. Las trece comprobaciones en verde a la primera, que es lo que cabía esperar de un tipo
sin automatismos que puedan equivocarse.

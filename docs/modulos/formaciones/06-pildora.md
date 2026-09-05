# Píldora (microlearning)

*Lo común a todos los tipos está en `00-el-motor.md`.*

Verificado de punta a punta por `scripts/recorridos/pildora.mjs` (10 pasos, **en verde a la
primera**). No encontró ningún fallo, y en este tipo eso es la noticia: lo que hay que comprobar
aquí es que las dos cosas que promete **no** hacer, de verdad no pasan.

---

## 1. Qué es

Contenido corto: tres o cuatro minutos, para reforzar algo puntual. No es una formación de
cumplimiento, y por eso **no emite constancia ni tiene examen**.

## 2. La configuración del tipo

```
requiresAssessment: false     issuesCertificate: false
isMicro: true                 defaultOfferingKind: PERMANENT
participatesInPlan: false
```

En la base el código del tipo es `MICROLEARNING`, y su `config` viene **sin modo de asignación**, así
que cae en `MANUAL`.

## 3. Lo que la distingue

- **No pide examen y no emite constancia.** Son las dos cosas que hay que comprobar que de verdad
  *no* pasan: un tipo que promete "sin examen" y luego exige uno bloquea al aprendiz sin explicación.
- **Convocatoria permanente**, se abre sola al publicar.
- **No cuenta para el plan.**

## 4. Lo comprobado

| | |
|---|---|
| **Se publica SIN examen** | es la comprobación de fondo: en los otros cuatro tipos, publicar sin evaluación se rechaza. Aquí no — y si se rechazara, una píldora no se podría publicar nunca y el mensaje mandaría a agregar un examen que este tipo no tiene por qué tener |
| El temario | **una sola pieza**: la lección. Ningún examen |
| Se abre sola una convocatoria | permanente: se hace cuando la persona pueda |
| Publicar **no la exige a nadie** | `MANUAL`: a quién le llega lo marca una persona |
| Al marcarla | el disparador es el que se pidió — aquí el servidor **no fuerza nada**, a diferencia del plan |
| Se da por **CUMPLIDA con ver el contenido** | sin examen no hay nada más que hacer, y desaparece de pendientes |
| **NO emite constancia** | la otra mitad de lo que promete el tipo |
| **No entra al plan** | 409 `ACTIVITY_NOT_PLANNABLE` |

## 5. Lo que falta

Nada abierto de este tipo.

# Como documentar en NEO PULSE

La documentacion no se pudre por falta de ganas: se pudre por **falta de regla**. Este documento
es la regla. Es corto a proposito.

---

## 1. La decision de fondo: se documenta por CONCEPTO, no por modulo

Se evaluaron las dos formas:

| | Por modulo (`docs/modulos/usuarios.md`) | **Por concepto de negocio** (elegida) |
|---|---|---|
| Estabilidad | Los modulos se parten, se renombran, se fusionan | Los conceptos duran anos: "asignacion" significara lo mismo en 2030 |
| Duplicacion | Un concepto como "asignacion" toca 4 modulos: se explica 4 veces y se desincroniza | Se explica una vez |
| Riesgo real | Se convierte en un espejo del codigo, y un espejo desactualizado es peor que nada | Explica el POR QUE, que el codigo no cuenta |
| Publico | Solo sirve a quien ya programa | Sirve al cliente, al analista funcional y al programador |

**Regla:** la documentacion explica **que significa y por que se decidio asi**. Lo que hace el
codigo, lo cuenta el codigo (y sus comentarios, que si viven pegados a el).

---

## 2. Los cinco documentos y que va en cada uno

| Documento | Que contiene | Naturaleza |
|---|---|---|
| `CLAUDE.md` | El modelo completo, las reglas de negocio y las **decisiones irreversibles** numeradas | Viva |
| `docs/glosario.md` | Que significa cada concepto del negocio, con ejemplos de Transprensa | Viva |
| `docs/arquitectura.md` | Como esta construido HOY: aislamiento, inmutabilidad, seguridad, calidad, deuda | Viva |
| `docs/RUNBOOK.md` | Como se opera: comandos, credenciales, **incidentes y lecciones** | Solo se ANADE |
| `docs/sprints/NN-*.md` | Que se hizo en un sprint y como se verifico | Historica: envejece |

Y los de referencia que no se tocan salvo correccion: `docs/00-brief-crudo.md` (lo que dijo el
cliente, literal), `docs/research/` (las investigaciones con sus fuentes),
`docs/02-aislamiento-proyectos.md` y `docs/03-infraestructura-produccion.md`.

---

## 3. La tabla que evita que se degrade

**Si cambias esto -> actualiza aquello. Sin excepciones.**

| Cambio | Que se actualiza |
|---|---|
| Aparece un **concepto nuevo** del negocio (o se renombra uno) | `glosario.md` **primero**, antes de escribir codigo |
| Se toma una **decision que costaria semanas revertir** | Tabla de decisiones irreversibles del `CLAUDE.md` (numerada, con el por que) |
| Cambia el **modelo de datos** | Seccion 6 del `CLAUDE.md` + `arquitectura.md` si cambia un flujo |
| Cambia una **regla de negocio** (nota minima, quien aprueba, como se calcula un indicador) | Seccion 3 del `CLAUDE.md` + `glosario.md` si afecta un concepto |
| Se agrega un **permiso** | `packages/shared/src/constants/permissions.ts` + seccion 7 del `CLAUDE.md` + el rol semilla |
| Cambia el **aspecto o un patron de interfaz** | `.claude/skills/pulse-ui/SKILL.md` |
| **Se rompe algo** y se aprende de ello | `RUNBOOK.md`, en el momento. No al final del dia |
| Cambia **como se opera** (comando, puerto, credencial) | `RUNBOOK.md` |
| Se **cierra un sprint** | `docs/sprints/NN-*.md` nuevo + estado en `CLAUDE.md` seccion 0 |
| Se **descubre deuda tecnica** | Tabla de deuda de `arquitectura.md`, con criticidad honesta |
| Se decide **no hacer algo** | Se escribe igual, con el por que. Lo descartado explica el diseno tanto como lo hecho |

---

## 4. Como se escribe

1. **Explica el problema antes que la solucion.** "Un auditor pregunta que examen presento esta
   persona en marzo" vale mas que "las versiones son inmutables".
2. **Ejemplos reales de Transprensa**, no genericos. "El Plan 2026 programo 50 y asistieron 43"
   se entiende; "la entidad A se relaciona con la B" no.
3. **Di lo que NO es.** La mitad del valor del glosario esta en las confusiones que despeja.
4. **Nada de emojis ni simbolos decorativos**, en ninguna parte del proyecto.
5. **Sin promesas.** "Se verifico con 7 pruebas en navegador, en verde" es documentacion;
   "el sistema es robusto" es publicidad.
6. **Si algo esta a medias, se dice.** Una deuda escrita se paga; una escondida explota.

---

## 5. Que NO se documenta

- Lo que el codigo ya dice con claridad (no se describe funcion por funcion).
- Listados de campos que se sacan del `schema.prisma`: se duplicarian y quedarian desfasados.
- Listados de endpoints: viven en los controladores; cuando se genere la especificacion desde
  los contratos, saldra sola.

---

## 6. Antes de cerrar un sprint

Lista de verificacion:

- [ ] Conceptos nuevos en el glosario
- [ ] Decisiones irreversibles numeradas en el `CLAUDE.md`
- [ ] Incidentes y lecciones en el `RUNBOOK.md`
- [ ] Deuda nueva en la tabla de `arquitectura.md`
- [ ] Documento del sprint con **resultados reales** de las pruebas, no promesas
- [ ] Estado actualizado en la seccion 0 del `CLAUDE.md`

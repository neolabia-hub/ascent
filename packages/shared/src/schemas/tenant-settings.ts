import { z } from 'zod';

/**
 * Settings del tenant (tenants.settings JSONB) — Zod es la fuente unica (Decision #18).
 * Version del esquema incluida para migraciones de settings sin romper tenants viejos.
 * Cascada de resolucion: default plataforma -> override tenant -> override actividad ->
 * SNAPSHOT en la version publicada (la que rige el intento). Ver CLAUDE.md 3.1.
 */
export const tenantSettingsSchema = z
  .object({
    schemaVersion: z.literal(1).default(1),

    // Reglas academicas por defecto (snapshot al publicar cada version de actividad).
    passingScoreDefault: z.number().int().min(1).max(100).default(80),
    maxAttemptsDefault: z.number().int().min(1).max(10).default(3),
    retryWaitHours: z.number().int().min(0).max(720).default(0),
    /**
     * Cuanto hay que ver de un video para darlo por visto, cuando la formacion no dice otra cosa.
     *
     * Vive aqui y no como una constante porque no es una preferencia estetica: una empresa que
     * capacita en SST puede exigir el 100% del video de un procedimiento, y otra darse por
     * satisfecha con el 80% porque los ultimos segundos son creditos. Antes estaba clavado en 90
     * dentro del reproductor y de la regla del servidor, en dos sitios distintos.
     */
    minWatchPctDefault: z.number().int().min(50).max(100).default(90),

    // Microlearning / engagement.
    pillCadencePerWeek: z.number().int().min(1).max(7).default(3),
    notificationWeeklyCap: z.number().int().min(1).max(21).default(5),
    streakFreezesMax: z.number().int().min(0).max(5).default(2),

    /**
     * LOS ESCALONES DE REPASO, en dias. Motor tipo Leitner (Decision #22,
     * `engagement/spaced-repetition.ts`): fallar una pregunta la manda al escalon 0; acertarla la
     * sube un escalon y la aleja en el tiempo; volver a fallarla la baja un escalon, nunca al 0 de
     * golpe. Acertar en el ULTIMO escalon la da por dominada.
     *
     * Antes era una constante fija (`1, 2, 7, 14, 30`) y dejo de serlo porque el compromiso que
     * representa NO es tecnico: una empresa que forma en seguridad vial puede querer que una falla
     * en "distancia de frenado" vuelva al dia siguiente y machaque una semana entera; otra, para
     * politica interna, puede conformarse con un ciclo mas relajado. Es la persona que conoce a su
     * gente quien decide eso, no quien escribe el codigo — el mismo argumento que ya justifica
     * `minWatchPctDefault` y `efficacyDaysDefault` aqui mismo.
     *
     * ESTRICTAMENTE CRECIENTE, y se valida: un escalon 2 tiene que tardar MAS que el escalon 1, o
     * "subir de escalon" dejaria de significar "se aleja en el tiempo". Minimo dos escalones —sin
     * al menos dos no hay progresion que registrar—, maximo ocho — mas que eso es granularidad que
     * nadie percibe y una cola que tarda meses en vaciar a alguien que ya domina el tema.
     */
    reviewIntervalsDays: z
      .array(z.number().int().min(1).max(365))
      .min(2)
      .max(8)
      .default([1, 2, 7, 14, 30])
      .refine((dias) => dias.every((valor, indice) => indice === 0 || valor > (dias[indice - 1] as number)), {
        message: 'Cada escalon debe tardar mas dias que el anterior',
      }),

    // Eficacia diferida (Kirkpatrick nivel 3).
    efficacyDaysDefault: z.number().int().min(1).max(180).default(30),

    /**
     * CUANTOS DIAS ANTES DEL CIERRE se le recuerda el ciclo de desempeno a quien no ha respondido.
     *
     * Estaba escrito en el codigo y no es una constante tecnica: en una empresa donde la campaña
     * dura seis semanas, tres dias de aviso llegan tarde; en una de dos semanas, avisar con diez
     * es avisar el primer dia. Es la misma clase de decision que `efficacyDaysDefault`, y la toma
     * quien conoce a su gente.
     *
     * 0 apaga el recordatorio: hay empresas que prefieren que lo lleve el jefe por su cuenta.
     */
    performanceReminderDays: z.number().int().min(0).max(30).default(3),

    /**
     * CUANTOS DIAS HACIA ADELANTE mira el aviso semanal de vencimientos (`PENDIENTES` 3.3).
     *
     * No es una constante tecnica: lo que se tarda en conseguir un cupo de alturas con la ARL no se
     * parece a lo que se tarda en programar una charla propia, y avisar con quince dias de algo que
     * necesita dos meses de gestion es avisar tarde. Por defecto 45, que es un mes y medio: cabe la
     * ventana de 60 dias en la que el motor hace nacer la ronda siguiente sin llenar el aviso de
     * cosas del año que viene.
     *
     * 0 lo apaga. Hay empresas que prefieren llevarlo por su cuenta, y un aviso que no se quiere es
     * el que enseña a ignorar todos los demas.
     */
    expirationDigestDays: z.number().int().min(0).max(180).default(45),

    /**
     * A PARTIR DE CUANTAS PREGUNTAS VENCIDAS DE REPASO se avisa a la persona (`PENDIENTES` 5.1).
     *
     * El motor de repeticion espaciada ya existe (Decision #22) y ya se ve en la pantalla —Repaso,
     * "Sigue donde ibas"— pero nadie se entera cuando algo VUELVE a estar vencido: hay que acordarse
     * de entrar a mirar. Es el mismo argumento que ya resolvio `expirationDigestDays` para quien
     * administra, aplicado a quien cursa.
     *
     * El umbral evita avisar por UNA sola pregunta que vencio ayer —eso pasa todos los dias con
     * cualquiera que este activo, y un aviso diario por una pregunta enseña a ignorarlo—; con
     * varias juntas, ya vale la pena interrumpir.
     *
     * 0 apaga el aviso: mismo convenio que `expirationDigestDays` y `performanceReminderDays`, para
     * no inventar un interruptor aparte cuando el numero ya hace ese trabajo.
     */
    reviewDigestMinDue: z.number().int().min(0).max(20).default(3),

    // Rotulos de UI (Decision #31: fijos en F1; previstos aqui, sin UI de edicion todavia).
    labels: z
      .object({
        activity: z.string().min(1).default('Actividad formativa'),
        catalog: z.string().min(1).default('Contenido formativo'),
        offering: z.string().min(1).default('Convocatoria'),
        plan: z.string().min(1).default('Plan de capacitacion'),
        pill: z.string().min(1).default('Pildora'),
        extra: z.string().min(1).default('Capacitacion extraordinaria'),
      })
      .default({}),

    /**
     * A QUIEN ACUDE alguien de esta empresa que no puede entrar (Decision #97).
     *
     * Mientras no haya recuperacion por correo, la pantalla de ingreso no puede prometer un enlace
     * que no existe: lo unico honesto es decir a quien pedirselo. Y eso cambia por empresa —en una
     * lo lleva SST, en otra el area de sistemas—, asi que no puede estar escrito en el codigo.
     *
     * SE PUBLICA SIN SESION, porque la pantalla de ingreso no la tiene. Por eso lo que va aqui es
     * un contacto INSTITUCIONAL —un area, un correo corporativo, una extension—, nunca el movil
     * personal de nadie: cualquiera que sepa el subdominio lo puede leer. La UI lo advierte donde
     * se escribe.
     *
     * Vacio es un estado legitimo y frecuente el primer dia: entonces la pantalla enseña el
     * contacto de la plataforma, que se configura por variable de entorno y no lo toca el cliente.
     */
    support: z
      .object({
        contactName: z.string().max(120).default(''),
        contactEmail: z.string().max(160).default(''),
        contactPhone: z.string().max(60).default(''),
        note: z.string().max(300).default(''),
      })
      .default({}),

    // Flags de modulos.
    features: z
      .object({
        pills: z.boolean().default(true),
        streaks: z.boolean().default(true),
        aiGeneration: z.boolean().default(true),
        scormRuntime: z.boolean().default(false), // F2, solo si el tenant lo necesita (Decision #25)
      })
      .default({}),
  })
  .strict();

export type TenantSettings = z.infer<typeof tenantSettingsSchema>;

/** Branding del tenant (tenants.branding JSONB). Colores en HEX validado. */
export const tenantBrandingSchema = z
  .object({
    logoKey: z.string().nullable().default(null),
    primaryColor: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .default('#1f3a5f'),
    accentColor: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .default('#e8734a'),
    companyDisplayName: z.string().min(1).max(120).default(''),
  })
  .strict();

export type TenantBranding = z.infer<typeof tenantBrandingSchema>;

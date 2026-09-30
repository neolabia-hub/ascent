'use client';

import {
  ArrowRight,
  Award,
  BriefcaseBusiness,
  Building2,
  Cake,
  CalendarDays,
  Camera,
  Download,
  Flame,
  Handshake,
  IdCard,
  Info,
  Layers,
  LogOut,
  Mail,
  MapPin,
  Network,
  Pencil,
  Phone,
  Play,
  Sparkles,
  Trophy,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ApiError, getMisDatos, logout, setMyAvatar, motivoDelError, updateMiContacto, type MisDatos } from '@/lib/api';
import { formatNumber } from '@/lib/format';
import { getMyProgress, type MyProgress } from '@/lib/learner-api';
import { useLearnerProfile } from '@/components/layout/learner-session';
import { clearOfflineData } from '@/components/providers/service-worker-bridge';
import { useTenant } from '@/components/providers/tenant-provider';
import { descargarPdf, getMyCertificates, type CertificateRow } from '@/lib/certificates-api';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { uploadMedia } from '@/lib/catalog-api';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/components/ui/cn';
import { useProximoPaso } from '@/components/modules/learner/proximo-paso';

/**
 * PERFIL. Aqui vive la racha, y vive SOLA: es privada (Decision #23), no se compara con nadie y
 * no existe ninguna pantalla donde otra persona la vea.
 *
 * Los puntos se ganan por logro real (terminar una leccion, aprobar un examen, hacer el repaso),
 * nunca por entrar. Por eso no hay "puntos por racha" ni moneda que gastar.
 *
 * ─── COMO QUEDO LA CABECERA (2026-09-30, tres vueltas con el cliente) ───
 *
 *   1. Cuatro recuadros de cristal con un numero cada uno: «generico, la rejilla de cualquier panel».
 *   2. Una linea de datos tipo ficha de pelicula con el boton «Empezar» dentro: el boton se comia la
 *      cabecera y los numeros perdian peso.
 *   3. AHORA: la cabecera es de la PERSONA y de lo que LLEVA. Los tres numeros son grandes, sin cajas,
 *      separados por un filo —como los marcadores de una retransmision—, porque son lo que se viene a
 *      mirar. La semana dice para que esta: «Esta semana». Y lo que hay que HACER sale de la
 *      cabecera y va debajo, en su propia pieza.
 */
export default function ProfilePage() {
  const profile = useLearnerProfile();
  const tenant = useTenant();
  const [progress, setProgress] = useState<MyProgress | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [avatarKey, setAvatarKey] = useState<string | null>(profile.avatarKey);
  const paso = useProximoPaso(progress);

  useEffect(() => {
    let cancelled = false;
    getMyProgress()
      .then((value) => {
        if (!cancelled) setProgress(value);
      })
      .catch(() => {
        if (!cancelled) setProgress(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleLogout() {
    setLeaving(true);
    // Antes de salir se borran del telefono la formacion cacheada y la cola pendiente.
    clearOfflineData();
    try {
      await logout();
    } finally {
      window.location.assign('/login');
    }
  }

  const racha = progress?.currentStreak ?? 0;

  return (
    <div className="space-y-8">
      <section
        className="relative overflow-hidden rounded-3xl text-white shadow-card"
        style={{
          backgroundImage:
            'radial-gradient(80% 60% at 85% 0%, color-mix(in srgb, var(--brand-accent) 50%, transparent), transparent 65%), radial-gradient(60% 50% at 0% 100%, color-mix(in srgb, var(--brand-accent) 22%, transparent), transparent 70%), linear-gradient(160deg, var(--brand-primary) 0%, color-mix(in srgb, var(--brand-primary) 55%, #000) 100%)',
        }}
      >
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/30 to-transparent" />

        <div className="relative px-5 pb-6 pt-8 sm:px-8 sm:pb-8 sm:pt-10">
          <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:items-center sm:gap-6 sm:text-left">
            <MiFoto fullName={profile.fullName} avatarKey={avatarKey} onChange={setAvatarKey} />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/60">{tenant.displayName}</p>
              <h1 className="mt-1.5 font-display text-[30px] font-extrabold leading-[1.05] tracking-tight sm:text-[40px]">
                {profile.fullName}
              </h1>
              {/*
                EL CARGO Y NO EL CORREO bajo el nombre (2026-09-24). El correo se edita en «Tus
                datos», y repetirlo aqui dejaba dos copias que no coincidian hasta recargar.
              */}
              {profile.jobTitle ? <p className="mt-1 text-sm text-white/75">{profile.jobTitle}</p> : null}
            </div>
          </div>

          {progress ? (
            <>
              <div className="mt-8 grid grid-cols-3 divide-x divide-white/15">
                <Marcador icono={Flame} rellena={racha > 0} valor={racha} etiqueta={racha === 1 ? 'día seguido' : 'días seguidos'} />
                <Marcador icono={Sparkles} valor={progress.points} etiqueta="puntos" />
                <Marcador icono={Trophy} valor={progress.longestStreak} etiqueta="mejor racha" />
              </div>
              <SemanaDeRacha progress={progress} />
            </>
          ) : (
            <div className="mt-8 h-24 animate-pulse rounded-2xl bg-white/10" />
          )}

          <p className="mt-6 text-center text-[11px] text-white/55 sm:text-left">
            Tu racha es privada: nadie más la ve.
            {progress && progress.freezesAvailable > 0
              ? ` Tienes ${progress.freezesAvailable} ${progress.freezesAvailable === 1 ? 'protector' : 'protectores'}: te cuidan la racha si un día no tienes señal.`
              : ''}
          </p>
        </div>
      </section>

      {/*
        LO QUE HAY QUE HACER, FUERA DE LA CABECERA y en su propia pieza (pedido del cliente). Nunca en
        rojo aunque haya atrasadas: la frase ya lo dice, y un rojo en el perfil se lee como un error.
        Es la misma decision que la del carril (`decidirProximoPaso`).
      */}
      {paso ? (
        <section className="card flex items-center gap-4 rounded-2xl p-4 sm:p-5">
          <span
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-white shadow-btn"
            style={{
              backgroundImage:
                'linear-gradient(150deg, var(--brand-primary), color-mix(in srgb, var(--brand-accent) 60%, var(--brand-primary)))',
            }}
          >
            <Play className="h-5 w-5" fill="currentColor" strokeWidth={0} aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-display text-base font-semibold text-ink-900">{paso.titulo}</p>
            <p className="mt-0.5 line-clamp-2 text-sm text-ink-500">{paso.detalle}</p>
          </div>
          <Link
            href={paso.href}
            className="focus-ring hidden h-10 shrink-0 items-center gap-1.5 rounded-full px-5 text-sm font-semibold text-white shadow-btn transition-transform duration-150 ease-pulse hover:-translate-y-px sm:inline-flex"
            style={{ backgroundColor: 'var(--brand-primary)' }}
          >
            {paso.accion}
            <ArrowRight className="h-4 w-4" strokeWidth={2.25} aria-hidden="true" />
          </Link>
          {/* En telefono el boton es la flecha: el texto no cabe al lado de la frase. */}
          <Link
            href={paso.href}
            aria-label={paso.accion}
            className="focus-ring flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white sm:hidden"
            style={{ backgroundColor: 'var(--brand-primary)' }}
          >
            <ArrowRight className="h-4 w-4" strokeWidth={2.25} aria-hidden="true" />
          </Link>
        </section>
      ) : null}

      {/*
        LAS CONSTANCIAS, en el perfil y no en una pantalla aparte (Decision #112), y SIEMPRE
        visibles desde el 2026-09-30: el cliente creyo que se habian quitado porque la cuenta con la
        que miraba no tenia ninguna y la seccion no se pintaba.
      */}
      <MisConstancias />

      {/*
        TUS DATOS, DEBAJO DE LA GAMIFICACION (2026-09-30, pedido del cliente). La ficha se consulta
        de vez en cuando; lo que se mira cada dia va arriba.
      */}
      <TusDatos />

      {/*
        SU DESEMPENO YA NO VIVE AQUI (Decision #140): esta en "Desempeno", que aparece en el menu
        cuando hay algo — lo tuyo o lo de tu gente.
      */}

      <Button variant="outline" size="lg" className="w-full" loading={leaving} onClick={() => void handleLogout()}>
        <LogOut className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
        Cerrar sesión
      </Button>
    </div>
  );
}

/**
 * UN MARCADOR: el numero grande, sin caja. Como el de una retransmision: lo que importa es la cifra,
 * y la etiqueta va pequeña debajo. La llama va rellena solo con la racha viva.
 */
function Marcador({
  icono: Icono,
  valor,
  etiqueta,
  rellena = false,
}: {
  icono: LucideIcon;
  valor: number;
  etiqueta: string;
  rellena?: boolean;
}) {
  return (
    <div role="group" aria-label={`${valor} ${etiqueta}`} className="flex flex-col items-center px-2 text-center">
      <Icono
        className={cn('h-4 w-4 text-white/70', rellena && 'animate-breathe text-white')}
        fill={rellena ? 'currentColor' : 'none'}
        strokeWidth={rellena ? 1.5 : 2}
        aria-hidden="true"
      />
      <p className="mt-1.5 font-display text-[34px] font-extrabold leading-none tabular-nums sm:text-[44px]">
        {formatNumber(valor)}
      </p>
      <p className="mt-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-white/65">{etiqueta}</p>
    </div>
  );
}

/** Fecha civil en Colombia (AAAA-MM-DD): el servidor cuenta la racha en esa zona. */
const FECHA_BOGOTA = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' });
const INICIAL_DEL_DIA = new Intl.DateTimeFormat('es-CO', { weekday: 'narrow', timeZone: 'America/Bogota' });
const DIA_LARGO = new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', timeZone: 'America/Bogota' });

/**
 * LA SEMANA DE LA RACHA: los ultimos siete dias, con los que cuentan encendidos.
 *
 * Se deduce de dos datos que ya existen —cuantos dias lleva y cual fue el ultimo— porque la racha
 * es exactamente eso: los N dias seguidos que terminan en el ultimo. No hace falta pedir el
 * historial al servidor.
 *
 * HOY se marca aparte cuando todavia no cuenta: es el dia en que la racha se mantiene o se pierde,
 * y el circulo punteado dice «aqui falta algo» sin decirlo en rojo.
 */
function SemanaDeRacha({ progress }: { progress: MyProgress }) {
  const hoy = FECHA_BOGOTA.format(new Date());
  const ultimo = progress.lastActivityDate;
  const racha = progress.currentStreak;
  // El primer dia de la racha: el ultimo menos (racha - 1). A mediodia para no cruzar de dia por la zona.
  const primero =
    ultimo && racha > 0
      ? FECHA_BOGOTA.format(new Date(new Date(`${ultimo}T12:00:00-05:00`).getTime() - (racha - 1) * 86_400_000))
      : null;

  const dias = Array.from({ length: 7 }, (_, i) => {
    const fecha = new Date(Date.now() - (6 - i) * 86_400_000);
    const iso = FECHA_BOGOTA.format(fecha);
    return {
      iso,
      inicial: INICIAL_DEL_DIA.format(fecha).toUpperCase(),
      largo: DIA_LARGO.format(fecha),
      activo: Boolean(ultimo && primero && iso >= primero && iso <= ultimo),
      esHoy: iso === hoy,
    };
  });

  return (
    <div className="mt-7 flex flex-col items-center gap-2.5 sm:flex-row sm:gap-5">
      {/* PARA QUE ESTA: los dias de esta semana en que aprendiste. Sin el rotulo, siete circulos no decian nada. */}
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/60">Esta semana</p>
    <ol className="flex items-center justify-center gap-2 sm:justify-start" aria-label="Los días de esta semana en que aprendiste">
      {dias.map((dia) => (
        <li key={dia.iso} className="flex flex-col items-center gap-1.5">
          <span
            title={`${dia.largo}: ${dia.activo ? 'aprendiste' : dia.esHoy ? 'aún no' : 'sin actividad'}`}
            className={cn(
              'flex h-9 w-9 items-center justify-center rounded-full transition-transform duration-200 sm:h-10 sm:w-10',
              dia.activo && 'bg-white shadow-md',
              !dia.activo && dia.esHoy && 'border-2 border-dashed border-white/60',
              !dia.activo && !dia.esHoy && 'bg-white/10',
            )}
          >
            {dia.activo ? (
              <Flame
                className={cn('h-4 w-4', dia.esHoy && 'animate-breathe')}
                fill="currentColor"
                strokeWidth={1.5}
                style={{ color: 'var(--brand-accent)' }}
                aria-hidden="true"
              />
            ) : null}
          </span>
          <span className={cn('text-[11px] font-semibold', dia.esHoy ? 'text-white' : 'text-white/55')}>{dia.inicial}</span>
          <span className="sr-only">{`${dia.largo}: ${dia.activo ? 'aprendiste' : 'sin actividad'}`}</span>
        </li>
      ))}
    </ol>
    </div>
  );
}

/**
 * LA FOTO DE PERFIL, que cambia SOLO su dueno (Decision #105).
 *
 * Se sube desde aqui y desde ningun otro sitio. Se penso en dejarlo tambien en la ficha de
 * Usuarios, donde quien administra edita al resto, y se descarto: la cara de alguien no es un dato
 * que deba poder cambiarle su jefe. El endpoint tampoco lo permite —opera sobre la sesion y no
 * recibe un id—, asi que la regla esta en los dos lados y no solo en la pantalla.
 *
 * Se guarda AL MOMENTO, sin boton de guardar. En esta pantalla no hay formulario ninguno: un
 * "guardar cambios" para un solo campo que ya se ve aplicado seria un paso que no explica nada.
 */
function MiFoto({
  fullName,
  avatarKey,
  onChange,
}: {
  fullName: string;
  avatarKey: string | null;
  onChange: (clave: string | null) => void;
}) {
  const { showToast } = useToast();
  const input = useRef<HTMLInputElement | null>(null);
  const [subiendo, setSubiendo] = useState(false);

  async function guardar(clave: string | null) {
    const previo = avatarKey;
    onChange(clave);
    try {
      await setMyAvatar(clave);
    } catch (error) {
      // Se devuelve lo que habia: dejar la foto nueva puesta despues de un fallo haria creer que
      // se guardo, y al recargar habria desaparecido sin explicacion.
      onChange(previo);
      showToast({ kind: 'danger', title: 'No se pudo guardar la foto', description: motivoDelError(error) });
    }
  }

  return (
    <div className="flex flex-col items-center">
      <div className="relative">
        <span className="block rounded-full ring-4 ring-white/25">
          <Avatar avatarKey={avatarKey} fullName={fullName} size={88} />
        </span>
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={subiendo}
          aria-label={avatarKey ? 'Cambiar tu foto' : 'Subir tu foto'}
          title={avatarKey ? 'Cambiar tu foto' : 'Subir tu foto'}
          /*
            El boton va SOBRE la foto, en la esquina. Es donde lo pone todo el mundo y por eso no
            hay que explicarlo; ademas deja el nombre justo debajo de la cara, que es como se lee
            una ficha de persona.
          */
          className="focus-ring absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full border-2 border-white/60 bg-white shadow-btn transition-transform duration-150 hover:-translate-y-px disabled:opacity-60"
          style={{ color: 'var(--brand-primary)' }}
        >
          <Camera className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
        </button>
      </div>

      {avatarKey ? (
        <button
          type="button"
          onClick={() => void guardar(null)}
          className="focus-ring mt-2 text-xs text-white/75 underline-offset-2 hover:text-white hover:underline"
        >
          Quitar la foto
        </button>
      ) : (
        <p className="mt-2 text-xs text-white/75">Ponle cara a tu cuenta</p>
      )}

      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={async (event) => {
          const file = event.target.files?.[0];
          // Se limpia SIEMPRE y antes de nada: sin esto, elegir dos veces la misma foto no
          // dispara el evento la segunda vez y parece que el boton dejo de funcionar.
          event.target.value = '';
          if (!file) return;
          setSubiendo(true);
          try {
            const subido = await uploadMedia(file, 'avatar');
            await guardar(subido.storageKey);
          } catch (error) {
            showToast({ kind: 'danger', title: 'No se pudo subir la foto', description: motivoDelError(error) });
          } finally {
            setSubiendo(false);
          }
        }}
      />
    </div>
  );
}

/**
 * LAS CONSTANCIAS PROPIAS, para ver y descargar: una FILA que se desliza (2026-09-30).
 *
 * Como la fila de «seguir viendo» de una plataforma de video: tarjetas con portada, una al lado de
 * otra, y en el telefono se pasan con el dedo. Cada una dice que es, cuando se emitio y si esta
 * vencida o anulada, y se descarga desde ella misma.
 *
 * SIEMPRE SE PINTA. Antes, sin ninguna, la seccion no salia, y el cliente creyo que se habian
 * quitado del perfil. Sin constancias se dice que van a aparecer aqui y cuando: es una promesa, no
 * un reproche.
 */
function MisConstancias() {
  const { showToast } = useToast();
  const [filas, setFilas] = useState<CertificateRow[] | null>(null);
  const [bajando, setBajando] = useState<string | null>(null);

  useEffect(() => {
    void getMyCertificates()
      .then(setFilas)
      .catch(() => setFilas([]));
  }, []);

  async function descargar(fila: CertificateRow) {
    setBajando(fila.id);
    try {
      await descargarPdf(`/me/certificados/${fila.id}/pdf`, `${fila.activityName}.pdf`);
    } catch (error) {
      showToast({ kind: 'danger', title: 'No se pudo generar el PDF', description: motivoDelError(error) });
    } finally {
      setBajando(null);
    }
  }

  return (
    <section aria-labelledby="titulo-constancias">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <h2 id="titulo-constancias" className="font-display text-lg font-bold text-ink-900">
            Tus constancias
          </h2>
          <p className="text-sm text-ink-500">Descárgalas cuando te las pidan.</p>
        </div>
        {filas && filas.length > 0 ? (
          <span className="shrink-0 text-sm font-semibold tabular-nums text-ink-500">{filas.length}</span>
        ) : null}
      </div>

      {filas === null ? (
        <div className="flex gap-3 overflow-hidden">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-[230px] w-[210px] shrink-0 rounded-2xl" />
          ))}
        </div>
      ) : filas.length === 0 ? (
        <div className="card flex items-center gap-4 rounded-2xl p-5">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary-soft text-primary">
            <Award className="h-6 w-6" strokeWidth={1.75} aria-hidden="true" />
          </span>
          <p className="text-sm text-ink-500">
            Aún no tienes constancias. Cuando termines una formación que la entregue, aparecerá aquí lista para descargar.
          </p>
        </div>
      ) : (
        /*
          LA FILA SE DESLIZA y se engancha tarjeta a tarjeta (`snap`). La barra de desplazamiento se
          oculta: en una fila de tarjetas lo que dice «hay mas» es la tarjeta cortada contra el borde.
        */
        <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {filas.map((fila) => {
            const vencida = fila.validUntil !== null && new Date(fila.validUntil).getTime() < Date.now();
            const estado = fila.revoked ? 'Anulada' : vencida ? 'Vencida' : null;
            return (
              <article
                key={fila.id}
                className={cn('card flex w-[210px] shrink-0 snap-start flex-col overflow-hidden rounded-2xl', fila.revoked && 'opacity-70')}
              >
                {/* LA PORTADA: el color de la empresa y el sello. Es lo que hace de la lista una fila. */}
                <div
                  className="relative flex h-24 items-center justify-center"
                  style={{
                    backgroundImage:
                      'radial-gradient(70% 90% at 100% 0%, color-mix(in srgb, var(--brand-accent) 55%, transparent), transparent 70%), linear-gradient(150deg, var(--brand-primary), color-mix(in srgb, var(--brand-primary) 60%, #000))',
                  }}
                >
                  <Award className="h-10 w-10 text-white/85" strokeWidth={1.5} aria-hidden="true" />
                  <span className="absolute left-2.5 top-2.5 rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                    {fila.typeName ?? 'Constancia'}
                  </span>
                  {/*
                    Vencida y anulada se dicen distinto porque significan cosas distintas: la
                    vencida acredita que se hizo y hay que repetirla; la anulada la retiro la
                    empresa.
                  */}
                  {estado ? (
                    <span className="absolute right-2.5 top-2.5 rounded-full bg-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-ink-900">
                      {estado}
                    </span>
                  ) : null}
                </div>
                <div className="flex flex-1 flex-col p-3.5">
                  <p className="line-clamp-2 text-sm font-semibold leading-snug text-ink-900">{fila.activityName}</p>
                  <p className="mt-1 text-xs text-ink-500">
                    {new Date(fila.issuedAt).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })}
                    {fila.hours ? ` · ${fila.hours} h` : ''}
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-auto w-full"
                    loading={bajando === fila.id}
                    onClick={() => void descargar(fila)}
                    aria-label={`Descargar la constancia de ${fila.activityName}`}
                  >
                    <Download className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                    Descargar
                  </Button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

const VINCULACION: Record<string, string> = {
  DIRECTO: 'Directo',
  CONTRATISTA: 'Contratista',
  TEMPORAL: 'Temporal',
  EN_MISION: 'En misión',
};

/**
 * La frase que se le ensena a la persona si no se guardo. En una validacion el titulo del error es
 * el generico en ingles de la API; la frase util esta en el primer campo que fallo, y viene del
 * esquema compartido ya escrita en español.
 */
function fraseDelError(e: unknown): string {
  if (e instanceof ApiError && e.code === 'VALIDATION_ERROR') {
    const errores = e.body.errors as Array<{ message?: string }> | undefined;
    const primera = errores?.find((x) => x.message)?.message;
    if (primera) return primera;
  }
  return motivoDelError(e) ?? 'No se pudieron guardar tus datos. Inténtalo de nuevo.';
}

/** AAAA-MM-DD a «5 de enero de 2024». A mediodia para que ninguna zona horaria le reste un dia. */
function fechaLarga(fecha: string | null): string | null {
  if (!fecha) return null;
  return new Date(`${fecha}T12:00:00`).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
}

/**
 * TUS DATOS (2026-09-24): lo que la empresa tiene de ti, y lo que puedes cambiar tu.
 *
 * Dos bloques y la frontera se ve: **contacto** (correo y telefono) lo edita la persona, porque
 * solo ella sabe cual es su correo o si cambio de numero; **lo laboral** (documento, cargo, area,
 * regional, vinculacion, fechas) es de solo lectura, porque de ahi cuelgan sus obligaciones de
 * formacion y lo mantiene quien administra o el archivo de personal. Es la misma linea que trazan
 * los LMS corporativos.
 *
 * Se ensena lo laboral aunque no se pueda tocar para que la persona detecte un error —«esa no es
 * mi area»— y lo pida corregir: le cambia lo que se le exige, y nadie mas lo mira con sus ojos.
 *
 * Nada de lo vacio se pinta: una fila «Regional: —» en una empresa sin regionales es ruido.
 */
function TusDatos() {
  const { showToast } = useToast();
  const [datos, setDatos] = useState<MisDatos | null>(null);
  const [editando, setEditando] = useState(false);
  const [correo, setCorreo] = useState('');
  const [telefono, setTelefono] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void getMisDatos()
      .then(setDatos)
      .catch(() => setDatos(null));
  }, []);

  if (datos === null) return <Skeleton className="h-48 w-full rounded-xl" />;

  function abrir() {
    if (!datos) return;
    setCorreo(datos.email ?? '');
    setTelefono(datos.phone ?? '');
    setError(null);
    setEditando(true);
  }

  async function guardar() {
    setGuardando(true);
    setError(null);
    try {
      const nuevos = await updateMiContacto({ email: correo.trim(), phone: telefono.trim() });
      setDatos(nuevos);
      setEditando(false);
      showToast({ kind: 'success', title: 'Datos guardados' });
    } catch (e) {
      // El error se queda EN el formulario, no en un aviso que se va solo: la persona tiene que
      // corregir el campo y necesita seguir leyendo que le falla mientras lo hace.
      setError(fraseDelError(e));
    } finally {
      setGuardando(false);
    }
  }

  const laborales: Array<{ etiqueta: string; valor: string | null; icono: LucideIcon }> = [
    { etiqueta: 'Documento', valor: datos.documentNumber, icono: IdCard },
    { etiqueta: 'Cargo', valor: datos.jobTitle, icono: BriefcaseBusiness },
    { etiqueta: 'Área', valor: datos.area, icono: Network },
    { etiqueta: 'Regional', valor: datos.regional, icono: MapPin },
    { etiqueta: 'Servicio', valor: datos.service, icono: Layers },
    { etiqueta: 'Vinculación', valor: VINCULACION[datos.employmentType] ?? datos.employmentType, icono: Handshake },
    { etiqueta: 'Fecha de ingreso', valor: fechaLarga(datos.hiredAt), icono: CalendarDays },
    { etiqueta: 'Fecha de nacimiento', valor: fechaLarga(datos.birthDate), icono: Cake },
  ];

  /*
    TUS DATOS COMO UNA FICHA (2026-09-30, pedido del cliente: *"con iconos, que se vea mejor, tipo
    CRM"*). Era una tabla de dos columnas —etiqueta a la izquierda, valor a la derecha— que se leia
    como un formulario de papel. Ahora:

      - el CONTACTO son dos tarjetas con su icono, y la que falta invita a agregarla en vez de decir
        «Sin correo» en gris: es lo unico que la persona puede cambiar, y tiene que parecerlo;
      - lo de LA EMPRESA es una rejilla de fichas, cada una con su icono. Un icono por dato hace que
        se encuentre de un vistazo el que se busca —«¿en que area me tienen?»— sin leer la lista.

    Siguen siendo `dt`/`dd`: es una lista de definiciones, y asi la leen los lectores de pantalla.
  */
  return (
    <section className="card rounded-2xl p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-lg font-bold text-ink-900">Tus datos</h3>
          <p className="mt-0.5 text-sm text-ink-500">Tu correo y tu teléfono los puedes cambiar tú.</p>
        </div>
        {editando ? null : (
          /*
            PROPIO Y NO EL GENERICO (2026-09-30): el cliente vio el boton con borde como «uno mas de
            cualquier formulario». Pastilla tenida del color de la empresa, y dice QUE se edita —el
            contacto—, porque lo demas de esta ficha no se puede tocar.
          */
          <button
            type="button"
            onClick={abrir}
            className="focus-ring inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold transition-transform duration-150 ease-pulse hover:-translate-y-px"
            style={{ backgroundColor: 'color-mix(in srgb, var(--brand-primary) 10%, transparent)', color: 'var(--brand-primary)' }}
          >
            <Pencil className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
            Editar contacto
          </button>
        )}
      </div>

      {editando ? (
        <form
          className="mt-4 space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void guardar();
          }}
        >
          <Field htmlFor="mi-correo" label="Correo" hint="Déjalo en blanco si no tienes. Siempre puedes entrar con tu documento.">
            <Input
              id="mi-correo"
              type="email"
              autoComplete="email"
              inputMode="email"
              value={correo}
              onChange={(e) => setCorreo(e.target.value)}
              placeholder="nombre@correo.com"
            />
          </Field>
          <Field htmlFor="mi-telefono" label="Teléfono">
            <Input
              id="mi-telefono"
              type="tel"
              autoComplete="tel"
              inputMode="tel"
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              placeholder="300 123 4567"
            />
          </Field>
          {error ? (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          ) : null}
          <div className="flex gap-2">
            <Button type="submit" loading={guardando} className="flex-1">
              Guardar
            </Button>
            <Button type="button" variant="outline" disabled={guardando} onClick={() => setEditando(false)}>
              Cancelar
            </Button>
          </div>
        </form>
      ) : (
        <dl className="mt-5 grid gap-4 sm:grid-cols-2">
          <TarjetaContacto icono={Mail} etiqueta="Correo" valor={datos.email} vacio="Agrega tu correo" onAgregar={abrir} />
          <TarjetaContacto icono={Phone} etiqueta="Teléfono" valor={datos.phone} vacio="Agrega tu teléfono" onAgregar={abrir} />
        </dl>
      )}

      <div className="mt-6 flex items-center gap-2 border-t border-line pt-5">
        <Building2 className="h-4 w-4 text-ink-500" strokeWidth={1.75} aria-hidden="true" />
        <h4 className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-500">En la empresa</h4>
      </div>
      <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-4 min-[420px]:grid-cols-2 lg:grid-cols-3">
        {laborales.map(({ etiqueta, valor, icono: Icono }) =>
          valor ? (
            <div key={etiqueta} className="flex items-start gap-3">
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                style={{ backgroundColor: 'color-mix(in srgb, var(--brand-primary) 8%, transparent)', color: 'var(--brand-primary)' }}
              >
                <Icono className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <dt className="text-[11px] font-medium uppercase tracking-[0.04em] text-ink-500">{etiqueta}</dt>
                <dd className="break-words text-sm font-semibold text-ink-900">{valor}</dd>
              </div>
            </div>
          ) : null,
        )}
      </dl>
      <p className="mt-4 flex items-start gap-2 text-xs text-ink-500">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
        Si algo de esto no es correcto, pide a quien administra la plataforma que lo corrija: de tu cargo y tu área
        dependen las formaciones que te corresponden.
      </p>
    </section>
  );
}

/**
 * UN DATO DE CONTACTO, en su tarjeta. Si falta, la tarjeta entera invita a agregarlo: es lo unico
 * de la ficha que la persona puede cambiar, y un «Sin correo» en gris no dice que se pueda.
 */
function TarjetaContacto({
  icono: Icono,
  etiqueta,
  valor,
  vacio,
  onAgregar,
}: {
  icono: LucideIcon;
  etiqueta: string;
  valor: string | null;
  vacio: string;
  onAgregar: () => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <span
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
        style={
          valor
            ? { backgroundColor: 'var(--brand-primary)', color: '#ffffff' }
            : { backgroundColor: 'color-mix(in srgb, var(--brand-primary) 8%, transparent)', color: 'var(--brand-primary)' }
        }
      >
        <Icono className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <dt className="text-[11px] font-medium uppercase tracking-[0.04em] text-ink-500">{etiqueta}</dt>
        {valor ? (
          <dd className="truncate text-sm font-semibold text-ink-900" title={valor}>
            {valor}
          </dd>
        ) : (
          <dd>
            <button
              type="button"
              onClick={onAgregar}
              className="focus-ring rounded text-sm font-semibold hover:underline"
              style={{ color: 'var(--brand-primary)' }}
            >
              {vacio}
            </button>
          </dd>
        )}
      </div>
    </div>
  );
}

'use client';

import { Award, Camera, Download, Flame, LogOut, Shield, Trophy } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { logout, setMyAvatar } from '@/lib/api';
import { formatNumber } from '@/lib/format';
import { getMyProgress, type MyProgress } from '@/lib/learner-api';
import { useLearnerProfile } from '@/components/layout/learner-session';
import { clearOfflineData } from '@/components/providers/service-worker-bridge';
import { useTenant } from '@/components/providers/tenant-provider';
import { descargarPdf, getMyCertificates, type CertificateRow } from '@/lib/certificates-api';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { uploadMedia } from '@/lib/catalog-api';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * PERFIL. Aqui vive la racha, y vive SOLA: es privada (Decision #23), no se compara con nadie y
 * no existe ninguna pantalla donde otra persona la vea.
 *
 * Los puntos se ganan por logro real (terminar una leccion, aprobar un examen, hacer el repaso),
 * nunca por entrar. Por eso no hay "puntos por racha" ni moneda que gastar.
 */
export default function ProfilePage() {
  const profile = useLearnerProfile();
  const tenant = useTenant();
  const [progress, setProgress] = useState<MyProgress | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [avatarKey, setAvatarKey] = useState<string | null>(profile.avatarKey);

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

  return (
    <div className="space-y-6">
      <section className="card rounded-xl p-6 text-center">
        <MiFoto fullName={profile.fullName} avatarKey={avatarKey} onChange={setAvatarKey} />
        <h2 className="mt-3 font-display text-lg font-semibold text-ink-900">{profile.fullName}</h2>
        <p className="mt-0.5 text-sm text-ink-500">{profile.email}</p>
        <p className="mt-2 text-xs uppercase tracking-[0.04em] text-ink-500">{tenant.name}</p>
      </section>

      {progress === null ? (
        <Skeleton className="h-32 w-full rounded-xl" />
      ) : (
        <section className="grid grid-cols-2 gap-3">
          <StatTile
            icon={Flame}
            label="Racha actual"
            value={`${progress.currentStreak}`}
            hint={progress.currentStreak === 1 ? 'dia seguido' : 'dias seguidos'}
          />
          <StatTile icon={Trophy} label="Puntos" value={formatNumber(progress.points)} hint="por logro real" />
          <StatTile
            icon={Flame}
            label="Racha mas larga"
            value={`${progress.longestStreak}`}
            hint={progress.longestStreak === 1 ? 'dia' : 'dias'}
          />
          <StatTile
            icon={Shield}
            label="Protectores"
            value={`${progress.freezesAvailable}`}
            hint="cubren un dia sin senal"
          />
        </section>
      )}

      {/*
        LAS CONSTANCIAS, en el perfil y no en una pantalla aparte (Decision #112).

        Es el expediente formativo de la persona y lo consulta ella misma, casi siempre porque se
        la esta pidiendo alguien: el cliente al que va a entrar, una empresa a la que se postula.
        Una pantalla propia para una lista que casi siempre tiene tres filas seria una entrada mas
        en la navegacion para algo que se mira dos veces al ano.
      */}
      <MisConstancias />

      <p className="text-center text-sm text-ink-500">
        Tu racha es privada: nadie mas la ve.
      </p>

      <Button variant="outline" size="lg" className="w-full" loading={leaving} onClick={() => void handleLogout()}>
        <LogOut className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
        Cerrar sesion
      </Button>
    </div>
  );
}

function StatTile({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Flame;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="card rounded-xl p-4">
      <div className="flex items-center gap-2 text-ink-500">
        <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        <span className="text-xs font-medium uppercase tracking-[0.04em]">{label}</span>
      </div>
      <p className="mt-2 font-display text-[28px] font-extrabold tabular-nums leading-none text-ink-900">{value}</p>
      <p className="mt-1 text-xs text-ink-500">{hint}</p>
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
    } catch {
      // Se devuelve lo que habia: dejar la foto nueva puesta despues de un fallo haria creer que
      // se guardo, y al recargar habria desaparecido sin explicacion.
      onChange(previo);
      showToast({ kind: 'danger', title: 'No se pudo guardar la foto' });
    }
  }

  return (
    <div className="flex flex-col items-center">
      <div className="relative">
        <Avatar avatarKey={avatarKey} fullName={fullName} size={88} />
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
          className="focus-ring absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full border-2 border-surface text-white shadow-btn transition-transform duration-150 hover:-translate-y-px disabled:opacity-60"
          style={{ backgroundColor: 'var(--brand-primary)' }}
        >
          <Camera className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
        </button>
      </div>

      {avatarKey ? (
        <button
          type="button"
          onClick={() => void guardar(null)}
          className="focus-ring mt-2 text-xs text-ink-500 underline-offset-2 hover:text-ink-900 hover:underline"
        >
          Quitar la foto
        </button>
      ) : (
        <p className="mt-2 text-xs text-ink-500">Ponle cara a tu cuenta</p>
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
          } catch {
            showToast({ kind: 'danger', title: 'No se pudo subir la foto' });
          } finally {
            setSubiendo(false);
          }
        }}
      />
    </div>
  );
}

/**
 * LAS CONSTANCIAS PROPIAS, para descargar.
 *
 * Si no hay ninguna NO se pinta nada. Un bloque vacio diciendo "aun no tienes constancias" en el
 * perfil de alguien que lleva tres dias en la empresa se lee como un reproche, y ademas ocupa el
 * sitio de la racha, que si tiene algo que decirle.
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

  if (filas === null || filas.length === 0) return null;

  async function descargar(fila: CertificateRow) {
    setBajando(fila.id);
    try {
      await descargarPdf(`/me/certificados/${fila.id}/pdf`, `${fila.activityName}.pdf`);
    } catch {
      showToast({ kind: 'danger', title: 'No se pudo generar el PDF' });
    } finally {
      setBajando(null);
    }
  }

  return (
    <section className="card p-5">
      <h3 className="font-display text-base font-semibold text-ink-900">Tus constancias</h3>
      <p className="mt-0.5 text-sm text-ink-500">Descargalas cuando te las pidan.</p>

      <div className="mt-3 divide-y divide-line">
        {filas.map((fila) => {
          const vencida = fila.validUntil !== null && new Date(fila.validUntil).getTime() < Date.now();
          return (
            <div key={fila.id} className="flex items-center gap-3 py-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
                <Award className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink-900">{fila.activityName}</p>
                <p className="text-xs text-ink-500">
                  {new Date(fila.issuedAt).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })}
                  {fila.hours ? ` · ${fila.hours} horas` : ''}
                  {/*
                    Vencida y anulada se dicen distinto porque significan cosas distintas: la
                    vencida acredita que se hizo y hay que repetirla; la anulada la retiro la
                    empresa. Confundirlas en una sola etiqueta gris seria lo peor de las dos.
                  */}
                  {fila.revoked ? ' · Anulada' : vencida ? ' · Vencida' : ''}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                loading={bajando === fila.id}
                onClick={() => void descargar(fila)}
                aria-label={`Descargar la constancia de ${fila.activityName}`}
              >
                <Download className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              </Button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

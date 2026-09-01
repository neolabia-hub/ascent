'use client';

import { Eye, EyeOff, HelpCircle, IdCard, Lock } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { resolveTenantSlug } from '@/lib/tenant';
import { ApiError, getPublicTenant, login, me, setAccessToken, type TenantBranding } from '@/lib/api';
import { ADMIN_HOME, landingFor } from '@/lib/landing';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { useMediaUrl } from '@/lib/use-media-url';

/**
 * NO_FOUND y UNREACHABLE son cosas distintas y hay que decirlas distinto.
 *
 * Antes cualquier fallo caia en "Empresa no encontrada": si la API estaba reiniciando, si se cayo
 * el wifi un segundo o si devolvio un 500, la pantalla afirmaba que la empresa NO EXISTE y se
 * quedaba ahi, sin salida y sin reintentar. Eso es mentir con seguridad sobre lo unico que la
 * persona no puede comprobar, y desde fuera se ve como "la aplicacion no carga".
 */
type BrandingState =
  | { status: 'loading' }
  | { status: 'ready'; tenantSlug: string; branding: TenantBranding }
  | { status: 'not_found' }
  | { status: 'unreachable' };

function applyBranding(branding: TenantBranding): void {
  document.documentElement.style.setProperty('--brand-primary', branding.primaryColor);
  document.documentElement.style.setProperty('--brand-accent', branding.accentColor);
}

export function LoginForm() {
  const router = useRouter();
  const [brandingState, setBrandingState] = useState<BrandingState>({ status: 'loading' });
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [retry, setRetry] = useState(0);
  const [verContrasena, setVerContrasena] = useState(false);

  useEffect(() => {
    const tenantSlug = resolveTenantSlug(window.location.host, new URLSearchParams(window.location.search));

    getPublicTenant(tenantSlug)
      .then((tenant) => {
        applyBranding(tenant.branding);
        setBrandingState({ status: 'ready', tenantSlug, branding: tenant.branding });
      })
      .catch((error: unknown) => {
        // Solo un 404 significa que esa empresa no existe. Todo lo demas es que no se pudo
        // preguntar, y entonces lo honesto es ofrecer reintentar en vez de dar un veredicto.
        const notFound = error instanceof ApiError && error.status === 404;
        setBrandingState({ status: notFound ? 'not_found' : 'unreachable' });
      });
  }, [retry]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (brandingState.status !== 'ready') {
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);

    try {
      const response = await login(brandingState.tenantSlug, identifier, password);
      setAccessToken(response.accessToken);

      if (response.user.mustChangePassword) {
        router.push('/cambiar-contrasena');
      } else if (!response.user.activated) {
        router.push('/activacion');
      } else {
        // A donde entra depende de lo que PUEDE hacer: el rol Usuario solo tiene su propia
        // formacion, y el panel de administracion seria una pantalla donde todo esta prohibido.
        const profile = await me().catch(() => null);
        router.push(profile ? landingFor(profile.permissions) : ADMIN_HOME);
      }
    } catch (error) {
      if (error instanceof ApiError && error.code === 'INVALID_CREDENTIALS') {
        setErrorMessage('Cedula/correo o contraseña incorrectos.');
      } else if (error instanceof ApiError && error.code === 'ACCOUNT_LOCKED') {
        const minutes = error.retryAfter ? Math.max(1, Math.ceil(error.retryAfter / 60)) : null;
        setErrorMessage(
          minutes
            ? `Cuenta bloqueada temporalmente. Intenta de nuevo en ${minutes} minutos.`
            : 'Cuenta bloqueada temporalmente. Intenta de nuevo mas tarde.',
        );
      } else {
        setErrorMessage('No se pudo iniciar sesion. Intenta de nuevo.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (brandingState.status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper px-4">
        <p className="text-sm text-ink-500">Cargando...</p>
      </div>
    );
  }

  if (brandingState.status === 'not_found') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper px-4">
        <p className="text-sm text-ink-700">Empresa no encontrada.</p>
      </div>
    );
  }

  if (brandingState.status === 'unreachable') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-paper px-4 text-center">
        <div>
          <p className="text-sm font-medium text-ink-900">No pudimos conectar con el servidor.</p>
          <p className="mt-1 text-sm text-ink-500">
            La empresa existe; lo que fallo fue la conexion. Comprueba tu red y vuelve a intentarlo.
          </p>
        </div>
        <Button
          onClick={() => {
            setBrandingState({ status: 'loading' });
            setRetry((previous) => previous + 1);
          }}
        >
          Reintentar
        </Button>
      </div>
    );
  }

  const { branding } = brandingState;

  return (
    /*
      UNA TARJETA QUE FLOTA, partida en dos (Decision #94).

      QUE SE TOMA DE LAS REFERENCIAS Y QUE NO. Las dos que trajo el cliente coinciden en lo mejor
      que tienen: la tarjeta despegada de los bordes sobre un fondo tenido, y campos generosos con
      su icono dentro. Eso se toma, y ademas encaja con el resto del producto —las dos barras
      laterales ya son tarjetas que flotan—.

      Lo que NO se toma, y es la mitad de cada referencia: la foto de banco de imagenes y la
      ilustracion comprada (no dicen nada de esta empresa y envejecen en un ano), el "Sign Up"
      (aqui nadie se registra solo: las cuentas las crea quien administra) y el "entrar con Google"
      (no existe ese proveedor). Copiar esas piezas seria poner botones que no llevan a ninguna
      parte para que la pantalla se parezca a un pantallazo de Dribbble.

      El lado de la marca ocupa superficie de color SOLO aqui. Dentro, con datos por delante, ese
      mismo color a esta escala pelearia con el contenido; ahi es acento.
    */
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-paper px-4 py-6 lg:px-8">
      {/* El fondo tenido de las referencias, con el color de la empresa y muy diluido. */}
      <span
        aria-hidden="true"
        className="aurora-a pointer-events-none absolute -left-40 -top-40 h-[60vh] w-[60vh] rounded-full opacity-[0.07] blur-3xl"
        style={{ backgroundColor: 'var(--brand-primary)' }}
      />
      <span
        aria-hidden="true"
        className="aurora-b pointer-events-none absolute -bottom-40 -right-40 h-[55vh] w-[55vh] rounded-full opacity-[0.07] blur-3xl"
        style={{ backgroundColor: 'var(--brand-accent)' }}
      />

      <div className="relative grid w-full max-w-5xl overflow-hidden rounded-[28px] border border-line bg-surface shadow-card-hover lg:grid-cols-2">
        {/* ─────────────── El formulario ─────────────── */}
        <div className="order-2 flex items-center justify-center px-6 py-10 sm:px-10 lg:order-1 lg:px-12 lg:py-14">
          <div className="w-full max-w-[360px]">
            <h1 className="font-display text-[28px] font-bold leading-tight text-ink-900">Ingresa</h1>
            <p className="mt-1.5 text-sm text-ink-500">Con tu cedula o tu correo de la empresa.</p>

            <form onSubmit={handleSubmit} className="mt-8 space-y-4">
              {/*
                EL ICONO DENTRO DEL CAMPO es lo unico que se copia tal cual de las referencias, y
                se gana el sitio: distingue los dos campos de un vistazo sin leer la etiqueta, que
                es como se rellena un formulario que ya se conoce.
              */}
              <Field htmlFor="identifier" label="Cedula o correo">
                <div className="aurora-focus relative rounded-xl">
                  <IdCard
                    className="pointer-events-none absolute left-3.5 top-1/2 z-10 h-[18px] w-[18px] -translate-y-1/2 text-ink-300"
                    strokeWidth={1.75}
                    aria-hidden="true"
                  />
                  <Input
                    id="identifier"
                    name="identifier"
                    type="text"
                    autoComplete="username"
                    autoFocus
                    required
                    className="relative h-12 rounded-xl pl-11 text-base"
                    value={identifier}
                    onChange={(event) => setIdentifier(event.target.value)}
                  />
                </div>
              </Field>

              <Field htmlFor="password" label="Contraseña">
                <div className="aurora-focus relative rounded-xl">
                  <Lock
                    className="pointer-events-none absolute left-3.5 top-1/2 z-10 h-[18px] w-[18px] -translate-y-1/2 text-ink-300"
                    strokeWidth={1.75}
                    aria-hidden="true"
                  />
                  <Input
                    id="password"
                    name="password"
                    type={verContrasena ? 'text' : 'password'}
                    autoComplete="current-password"
                    required
                    className="relative h-12 rounded-xl pl-11 pr-11 text-base"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                  {/*
                    VER LA CONTRASENA. En un telefono, con guantes o con prisa, teclear a ciegas
                    una contrasena generada de catorce caracteres es la primera causa de intento
                    fallido — y cinco fallidos bloquean la cuenta quince minutos.
                  */}
                  <button
                    type="button"
                    onClick={() => setVerContrasena((valor) => !valor)}
                    aria-label={verContrasena ? 'Ocultar la contraseña' : 'Ver la contraseña'}
                    title={verContrasena ? 'Ocultar la contraseña' : 'Ver la contraseña'}
                    className="focus-ring absolute right-1 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-lg text-ink-500 transition-colors hover:text-ink-900"
                  >
                    {verContrasena ? (
                      <EyeOff className="h-[18px] w-[18px]" strokeWidth={1.75} />
                    ) : (
                      <Eye className="h-[18px] w-[18px]" strokeWidth={1.75} />
                    )}
                  </button>
                </div>
              </Field>

              {errorMessage ? (
                <p role="alert" className="animate-card-in rounded-xl bg-danger-soft px-3.5 py-2.5 text-sm text-danger">
                  {errorMessage}
                </p>
              ) : null}

              <Button type="submit" loading={submitting} size="lg" className="w-full rounded-xl">
                {submitting ? 'Ingresando...' : 'Ingresar'}
              </Button>
            </form>

            {/*
              "NO PUEDO ENTRAR" dice la verdad y nada mas.

              No hay recuperacion por correo todavia, y sin correo verificado cualquier
              auto-recuperacion es una forma de que quien conozca una cedula se lleve la cuenta —la
              cedula es semipublica dentro de la empresa—. Aqui no se promete un enlace que no
              existe: se dice a quien pedirselo.

              En Sprint 6 esto trae el CONTACTO REAL de quien administra en cada empresa
              (parametrizable por tenant) y, con correo verificado, el enlace de un solo uso.
            */}
            <details className="mt-6">
              <summary className="focus-ring inline-flex cursor-pointer list-none items-center gap-1.5 text-sm font-medium text-ink-500 transition-colors hover:text-ink-900">
                <HelpCircle className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                No puedo entrar
              </summary>
              <div className="animate-card-in mt-3 rounded-xl bg-paper p-4">
                <p className="text-sm leading-relaxed text-ink-700">
                  Todavia no se puede recuperar la contraseña por correo. Pideselo a quien administra
                  la plataforma en tu empresa: puede restablecerla y darte una nueva.
                </p>
                <p className="mt-2 text-xs leading-relaxed text-ink-500">
                  Si te equivocaste cinco veces, la cuenta se bloquea quince minutos y despues vuelve
                  a funcionar sola.
                </p>
              </div>
            </details>
          </div>
        </div>

        {/* ─────────────── El lado de la empresa ─────────────── */}
        <div
          className="relative isolate order-1 flex min-h-[180px] flex-col justify-between overflow-hidden p-7 lg:order-2 lg:min-h-[620px] lg:p-10"
          style={{ backgroundColor: 'var(--brand-primary)' }}
        >
          <span
            aria-hidden="true"
            className="aurora-a pointer-events-none absolute -right-1/3 -top-1/3 h-[60vh] w-[60vh] rounded-full opacity-60 blur-3xl"
            style={{ backgroundColor: 'var(--brand-accent)' }}
          />
          <span
            aria-hidden="true"
            className="aurora-b pointer-events-none absolute -bottom-1/3 -left-1/4 h-[50vh] w-[50vh] rounded-full opacity-40 blur-3xl"
            style={{ backgroundColor: 'color-mix(in srgb, var(--brand-primary) 35%, white)' }}
          />

          <div className="relative flex items-center gap-3">
            <LogoEmpresa branding={branding} />
            <div className="min-w-0">
              <p className="truncate font-display text-base font-bold leading-tight text-white">
                {branding.companyDisplayName}
              </p>
              <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-white/55">NEO PULSE</p>
            </div>
          </div>

          <div className="relative mt-8 hidden lg:block">
            <FraseQueSeEscribe />
          </div>

          <p className="relative mt-8 hidden text-xs text-white/40 lg:block">
            Formacion y cumplimiento · {new Date().getFullYear()}
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * LA FRASE QUE SE ESCRIBE SOLA.
 *
 * Lo pregunto el cliente y la respuesta es que si, pero NO con saludos. "Bienvenido" o "Hola de
 * nuevo" rotando no informa de nada y a la tercera vez cansa. Lo que si se gana el movimiento es
 * decir QUE ES esto, que es la pregunta real de alguien que entra por primera vez y no sabe por
 * que le dieron un usuario.
 *
 * Se escribe y se borra como si alguien tecleara: es lo unico que hace que la vista vuelva a una
 * frase que ya leyo. Cuatro lineas, todas ciertas y todas del negocio de esta empresa.
 *
 * SE APAGA con `prefers-reduced-motion` y entonces se queda la primera fija — que sigue diciendo
 * lo mismo—. Un texto que se reescribe es de lo peor que hay para quien se marea o usa lector de
 * pantalla, asi que el bloque entero es `aria-hidden` y debajo va la frase completa para ellos.
 */
const FRASES = [
  'Lo que te toca hacer, y cuando vence.',
  'Tus certificados, siempre a la mano.',
  'Desde el computador o desde el telefono.',
  'Con senal o sin ella.',
];

function FraseQueSeEscribe() {
  const [indice, setIndice] = useState(0);
  const [texto, setTexto] = useState('');
  const [borrando, setBorrando] = useState(false);
  const [animar, setAnimar] = useState(true);

  useEffect(() => {
    setAnimar(!window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }, []);

  useEffect(() => {
    if (!animar) return;
    const frase = FRASES[indice] as string;

    // Escribir rapido y borrar mas rapido: borrar es transito, no contenido.
    if (!borrando && texto === frase) {
      const espera = setTimeout(() => setBorrando(true), 2200);
      return () => clearTimeout(espera);
    }
    if (borrando && texto === '') {
      setBorrando(false);
      setIndice((valor) => (valor + 1) % FRASES.length);
      return;
    }
    const paso = setTimeout(
      () => setTexto(borrando ? frase.slice(0, texto.length - 1) : frase.slice(0, texto.length + 1)),
      borrando ? 22 : 45,
    );
    return () => clearTimeout(paso);
  }, [texto, borrando, indice, animar]);

  return (
    <>
      <p
        aria-hidden="true"
        className="min-h-[6.5rem] font-display text-[30px] font-bold leading-[1.2] text-white"
      >
        {animar ? texto : FRASES[0]}
        {animar ? (
          // El cursor solo mientras escribe: parado detras de una frase quieta parece un error.
          <span className="ml-0.5 inline-block h-[0.9em] w-[3px] translate-y-[0.08em] animate-pulse rounded-full bg-white/80" />
        ) : null}
      </p>
      {/* Para lector de pantalla: la idea completa, de una vez y sin reescribirse. */}
      <p className="sr-only">{FRASES.join(' ')}</p>
    </>
  );
}

/**
 * EL LOGO de la empresa.
 *
 * Si hay archivo subido (`logoKey`), manda ese. Si no, se dibuja la marca TP —la T verde y la P
 * blanca del logotipo— en vez de una inicial suelta: un hueco donde deberia ir el logo se lee como
 * que la pagina esta rota, y una letra sola se lee como que nadie lo configuro. Esto se lee como
 * una decision, y desaparece en cuanto se suba el archivo de verdad.
 */
function LogoEmpresa({ branding }: { branding: TenantBranding }) {
  const logo = useMediaUrl(branding.logoKey);

  if (logo) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logo}
        alt={branding.companyDisplayName}
        className="h-11 w-11 shrink-0 rounded-xl bg-white/95 object-contain p-1.5"
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/20 bg-white/10 backdrop-blur-sm"
    >
      <svg viewBox="0 0 40 40" className="h-7 w-7" role="presentation">
        {/* La T, en el verde de la empresa. */}
        <path d="M4 8h17v6h-5.5v18H9.5V14H4z" fill="var(--brand-accent)" />
        {/* La P, en blanco, montada sobre la T como en el logotipo. */}
        <path
          d="M19 8h11a7.5 7.5 0 0 1 0 15h-4.5v9H19zm6.5 6v3H29a1.5 1.5 0 0 0 0-3z"
          fill="#ffffff"
        />
      </svg>
    </span>
  );
}
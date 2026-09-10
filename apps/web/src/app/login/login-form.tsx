'use client';

import { ArrowLeft, Eye, EyeOff, HelpCircle, IdCard, Lock, Mail, Phone } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { resolveTenantSlug } from '@/lib/tenant';
import {
  ApiError,
  getPublicTenant,
  login,
  me,
  mediaUrlFromPath,
  setAccessToken,
  solicitarAyudaDeIngreso,
  type TenantBranding,
  type TenantSupport,
} from '@/lib/api';
import { ADMIN_HOME, landingFor } from '@/lib/landing';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';

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
  | {
      status: 'ready';
      tenantSlug: string;
      branding: TenantBranding;
      logoUrl: string | null;
      support: TenantSupport | null;
    }
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
  /** Cual de las dos caras de la tarjeta se ve. Ver el comentario en el JSX. */
  const [cara, setCara] = useState<'entrar' | 'ayuda'>('entrar');
  const [retry, setRetry] = useState(0);
  const [verContrasena, setVerContrasena] = useState(false);

  useEffect(() => {
    const tenantSlug = resolveTenantSlug(window.location.host, new URLSearchParams(window.location.search));

    getPublicTenant(tenantSlug)
      .then((tenant) => {
        applyBranding(tenant.branding);
        setBrandingState({
          status: 'ready',
          tenantSlug,
          branding: tenant.branding,
          logoUrl: mediaUrlFromPath(tenant.logoUrl),
          support: tenant.support,
        });
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
        setErrorMessage('No se pudo iniciar sesión. Intenta de nuevo.');
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

  const { branding, logoUrl, support, tenantSlug } = brandingState;

  return (
    /*
      A SANGRE Y PARTIDA EN DOS (Decision #94).

      SE VOLVIO A ESTO despues de probar la tarjeta flotante de las referencias, y el cliente tenia
      razon: encerrar la marca en una tarjeta de 1000 px la convierte en un recuadro decorativo. A
      sangre, el color de la empresa ES la pantalla — y esta es la unica pantalla del producto donde
      eso corresponde, porque no hay ningun dato con el que competir.

      De las referencias se conserva lo que si se sostiene: los campos generosos con su icono
      dentro. Lo que no: la foto de banco de imagenes, el "Sign Up" —aqui nadie se registra solo— y
      el "entrar con Google", que no existe.

      En telefono el lado de la marca se pliega a una banda: cuando la pantalla mide 375 px, una
      imagen bonita que empuja el campo de la contrasena por debajo del teclado es un estorbo con
      buena intencion.
    */
    <div className="flex min-h-screen flex-col bg-paper lg:flex-row">
      {/* ─────────────── El lado de la empresa ─────────────── */}
      <div
        className="relative isolate flex shrink-0 flex-col justify-between overflow-hidden px-6 py-7 lg:min-h-screen lg:w-[52%] lg:px-14 lg:py-12"
        style={{ backgroundColor: 'var(--brand-primary)' }}
      >
        {/* Dos manchas que respiran, muy despacio. Ver `.aurora-a` / `.aurora-b`. */}
        <span
          aria-hidden="true"
          className="aurora-a pointer-events-none absolute -left-1/4 -top-1/3 h-[80vh] w-[80vh] rounded-full opacity-70 blur-3xl"
          style={{ backgroundColor: 'var(--brand-accent)' }}
        />
        <span
          aria-hidden="true"
          className="aurora-b pointer-events-none absolute -bottom-1/3 -right-1/4 h-[70vh] w-[70vh] rounded-full opacity-40 blur-3xl"
          style={{ backgroundColor: 'color-mix(in srgb, var(--brand-primary) 30%, white)' }}
        />
        {/*
          EL PULSO: la firma de la marca, en grande (skill pulse-ui, "Firma 1 — anillo de pulso").

          Aqui iban tres filas de icono y frase, y el cliente las rechazo con razon: es el recurso
          de todas las paginas de producto —tres ventajas con un cuadradito al lado— y no dice nada
          que el parrafo de arriba no diga ya. Ademas repartia la atencion justo donde la pantalla
          solo pide una cosa: entrar.

          En su lugar va lo que ESTE producto ya usa para significar avance: anillos concentricos
          que laten muy despacio. No es adorno importado: es el mismo gesto que el anillo de
          cumplimiento del plan y el de una formacion terminada. Y es CSS, no una ilustracion
          comprada que envejece.
        */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -right-40 top-1/2 hidden -translate-y-1/2 lg:block"
        >
          {[0, 1, 2, 3].map((anillo) => (
            <span
              key={anillo}
              className="aurora-a absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/[0.09]"
              style={{
                width: `${18 + anillo * 13}rem`,
                height: `${18 + anillo * 13}rem`,
                // Cada anillo late con su propio retraso: juntos parecen una onda que sale.
                animationDelay: `${anillo * 1.6}s`,
                animationDuration: `${16 + anillo * 3}s`,
              }}
            />
          ))}
        </span>

        <div className="relative flex items-center gap-3.5">
          <LogoEmpresa logoUrl={logoUrl} nombre={branding.companyDisplayName} />
          <div className="min-w-0">
            <p className="truncate font-display text-lg font-bold leading-tight text-white">
              {branding.companyDisplayName}
            </p>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/50">Ascent</p>
          </div>
        </div>

        <div className="relative mt-10 hidden lg:block">
          <FraseQueSeEscribe />
          {/*
            LA DESCRIPCION, quieta debajo de la frase que rota. Y REESCRITA (2026-09-09).

            La anterior —«la plataforma donde X lleva la formacion de su gente: lo obligatorio y lo
            que suma, con la evidencia lista para cuando la pidan»— es una frase de VENTA: le explica
            el producto a quien lo compra. Pero quien esta mirando esta pantalla no lo compra: es un
            conductor a las seis de la mañana que quiere entrar. A esa persona no le importa que la
            evidencia este lista para una auditoria; le importa que lo suyo este ahi y como se entra.

            Ahora dice eso, y termina con el dato que de verdad hace falta y nadie pone: **con que se
            entra**. La mitad de las llamadas de soporte del primer dia son esa pregunta.
          */}
          <p className="mt-5 max-w-md text-[15px] leading-relaxed text-white/65">
            Tu formación en {branding.companyDisplayName}, en un solo sitio: lo que tienes que hacer, lo
            que ya hiciste y el papel que lo prueba.{' '}
            <span className="text-white/85">Se entra con tu número de cédula.</span>
          </p>

        </div>

        <p className="relative mt-8 hidden text-xs text-white/35 lg:block">
          Formacion y cumplimiento · {new Date().getFullYear()}
        </p>
      </div>

      {/* ─────────────── El formulario ─────────────── */}
      {/*
        EL FORMULARIO VA EN UNA TARJETA, sobre papel.

        Era blanco plano de borde a borde: al lado de un panel de marca con profundidad, esa mitad
        se leia como el hueco que queda, no como la pieza principal. Elevarla sobre papel la
        convierte en un objeto —el mismo lenguaje que las barras laterales y las tarjetas del
        catalogo— y ademas la centra sola a cualquier ancho.

        En telefono NO lleva tarjeta: ahi el formulario ya ocupa toda la pantalla y meterle un
        borde alrededor solo roba ancho al unico contenido que hay.
      */}
      <div className="flex flex-1 items-center justify-center px-5 py-10 lg:px-14">
        {/*
          DOS CARAS, Y SE PASA DE UNA A OTRA (2026-09-09, pedido del cliente: *«que esa informacion
          pase con animacion al otro lado, que se sienta vivo»*).

          Antes «No puedo entrar» era un `<details>` que se desplegaba HACIA ABAJO, empujando la
          tarjeta y, en un telefono, sacando el contacto fuera de la pantalla — justo el dato que la
          persona vino a buscar.

          Ahora la tarjeta tiene dos caras y se desliza entre ellas. No es un adorno: el movimiento
          **dice a donde fue lo que estaba** —se fue a la derecha, y con «Volver» regresa—, que es
          justo lo que un desplegable no cuenta. Y la altura la manda la cara visible, asi que en un
          telefono la ayuda ocupa la pantalla entera, que es lo que hace falta cuando uno esta
          atascado.

          SOLO UNA CARA EXISTE A LA VEZ. No se dejan las dos montadas y una escondida con CSS: un
          campo invisible que sigue recibiendo el foco es una trampa para quien navega con teclado, y
          aqui hay un formulario entero.

          La animacion es la del reproductor (`slide-next` / `slide-prev`), no una nueva: entrar
          hacia un lado y volver hacia el otro ya significa algo en este producto.
        */}
        <div className="w-full max-w-[400px] overflow-hidden lg:rounded-3xl lg:border lg:border-line lg:bg-surface lg:p-10 lg:shadow-card">
          {cara === 'ayuda' ? (
            <div className="animate-slide-next">
              <button
                type="button"
                onClick={() => setCara('entrar')}
                className="focus-ring -ml-1 inline-flex items-center gap-1.5 rounded-md px-1 py-0.5 text-sm text-ink-500 transition-colors hover:text-ink-900"
              >
                <ArrowLeft size={15} strokeWidth={1.75} />
                Volver
              </button>
              <h1 className="mt-4 font-display text-[26px] font-bold leading-tight text-ink-900">
                ¿No puedes entrar?
              </h1>
              <p className="mt-1.5 text-sm text-ink-500">
                Quien administra en tu empresa puede darte una contraseña nueva.
              </p>
              <NoPuedoEntrar tenantSlug={tenantSlug} identifier={identifier} support={support} />
            </div>
          ) : (
            <div className="animate-slide-prev">
          <h1 className="font-display text-[30px] font-bold leading-tight text-ink-900">Ingresa</h1>
          <p className="mt-1.5 text-sm text-ink-500">Con tu cedula o tu correo de la empresa.</p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
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
                  VER LA CONTRASENA. Teclear a ciegas una generada de catorce caracteres, en un
                  telefono y con prisa, es la primera causa de intento fallido — y cinco fallidos
                  bloquean la cuenta quince minutos.
                */}
                <button
                  type="button"
                  onClick={() => setVerContrasena((valor) => !valor)}
                  aria-label={verContrasena ? 'Ocultar' : 'Mostrar'}
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

            <Button type="submit" loading={submitting} size="lg" glow className="w-full rounded-xl">
              {submitting ? 'Ingresando...' : 'Ingresar'}
            </Button>
          </form>

              {/* La puerta a la otra cara. Icono y texto: un icono solo aqui no se entiende. */}
              <button
                type="button"
                onClick={() => setCara('ayuda')}
                className="focus-ring mt-6 inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-ink-500 transition-colors hover:text-ink-900"
              >
                <HelpCircle className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                No puedo entrar
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * LA FRASE QUE SE ESCRIBE SOLA.
 *
 * NO son saludos: "bienvenido" rotando no informa de nada y a la tercera vez cansa. Son frases del
 * negocio de ESTA empresa —lo que la plataforma hace por quien entra—, que es la pregunta real de
 * alguien que recibe un usuario y no sabe para que.
 *
 * SE APAGA con `prefers-reduced-motion` y queda la primera fija, que dice lo mismo. El bloque es
 * `aria-hidden` y debajo va el texto completo para lector de pantalla: un parrafo que se reescribe
 * solo es de lo peor que existe para quien navega escuchando.
 */
const FRASES = [
  'Lo que te toca hacer, y cuando vence.',
  'Tus constancias, siempre a la mano.',
  'Tu formación, aunque estés en ruta.',
  'Lo aprendido no se olvida: vuelve.',
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

    // Se escribe despacio y se borra rapido: borrar es transito, no contenido.
    if (!borrando && texto === frase) {
      const espera = setTimeout(() => setBorrando(true), 2600);
      return () => clearTimeout(espera);
    }
    if (borrando && texto === '') {
      setBorrando(false);
      setIndice((valor) => (valor + 1) % FRASES.length);
      return;
    }
    const paso = setTimeout(
      () => setTexto(borrando ? frase.slice(0, texto.length - 1) : frase.slice(0, texto.length + 1)),
      borrando ? 20 : 42,
    );
    return () => clearTimeout(paso);
  }, [texto, borrando, indice, animar]);

  return (
    <>
      {/* Alto fijo: sin el, el bloque de abajo sube y baja con cada letra. */}
      <p aria-hidden="true" className="min-h-[5.2rem] font-display text-[38px] font-bold leading-[1.15] text-white">
        {animar ? texto : FRASES[0]}
        {animar ? (
          <span className="ml-1 inline-block h-[0.85em] w-[3px] translate-y-[0.06em] animate-pulse rounded-full bg-[var(--brand-accent)]" />
        ) : null}
      </p>
      <p className="sr-only">{FRASES.join(' ')}</p>
    </>
  );
}

/**
 * EL LOGO de la empresa.
 *
 * La URL llega YA FIRMADA del endpoint publico (Decision #96): esta pantalla no tiene sesion, asi
 * que no puede pedir la firma como hace el resto del producto. Sin eso, la unica pantalla donde la
 * marca de verdad importa seria la unica que no la puede enseñar.
 *
 * Mientras no haya archivo se pinta la inicial sobre vidrio: un hueco donde deberia ir el logo se
 * lee como que la pagina esta rota.
 */
function LogoEmpresa({ logoUrl, nombre }: { logoUrl: string | null; nombre: string }) {
  if (logoUrl) {
    return (
      /*
        `contain` Y NO `cover`, y sobre una pastilla clara.

        Un logotipo puede ser cuadrado, redondo o una palabra alargada, y no se sabe cual sube cada
        empresa. Con `cover` se recorta: el primero que se subio aqui era un logotipo con texto y
        salio cortado por la mitad, ilegible. Con `contain` cabe entero sea cual sea su forma.

        Y va sobre blanco porque muchos logotipos llevan tinta oscura: sobre el azul de la marca
        desaparecerian. El blanco es el fondo que cualquier logotipo espera.
      */
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logoUrl}
        alt={nombre}
        className="h-12 shrink-0 rounded-xl bg-white object-contain p-1.5 shadow-lg ring-1 ring-white/20"
        style={{ maxWidth: '120px' }}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-white/20 bg-white/10 font-display text-xl font-bold text-white backdrop-blur-sm"
    >
      {nombre.charAt(0).toUpperCase()}
    </span>
  );
}

/**
 * "NO PUEDO ENTRAR" (Decision #97).
 *
 * Antes decia la verdad y nada mas: "pideselo a quien administra en tu empresa". Correcto e
 * inutil — no decia a QUIEN, que es justo lo unico que la persona necesita. Ahora trae el
 * contacto de esa empresa, y si esa empresa todavia no lo ha puesto, el nuestro.
 *
 * DOS COSAS Y NADA MAS: el contacto de esa empresa y un boton que deja constancia. Son para dos
 * personas distintas —la que tiene al jefe de SST a diez metros y solo necesitaba su extension, y
 * la que entra a las cinco de la mañana desde una bodega y no va a llamar a nadie— y por eso estan
 * las dos. El boton no manda ninguna contrasena: pone un aviso en la bandeja de quien SI puede
 * restablecerla.
 *
 * DICE LO MISMO PASE LO QUE PASE. Ni "listo, te avisamos" ni "esa cedula no existe": esta pantalla
 * esta abierta a internet, y una respuesta que cambie segun exista la cuenta la convierte en un
 * comprobador de quien trabaja en la empresa. Se responde a ciegas a proposito.
 */
function NoPuedoEntrar({
  tenantSlug,
  identifier,
  support,
}: {
  tenantSlug: string;
  identifier: string;
  support: TenantSupport | null;
}) {
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);

  // Sin cedula no hay a quien avisar. Se pide la de arriba en vez de poner un segundo campo: son
  // el mismo dato, y dos campos pidiendo lo mismo en la misma tarjeta se contestan mal.
  const puedeAvisar = identifier.trim().length >= 3;

  async function avisar() {
    setEnviando(true);
    await solicitarAyudaDeIngreso(tenantSlug, identifier.trim());
    setEnviando(false);
    setEnviado(true);
  }

  return (
    <div className="mt-5 space-y-3">
      {/*
        CASI TODO EL TEXTO SE FUE (Decision #99). Habia cinco parrafos: como se recupera, de quien
        es el contacto, que pasa si la empresa no lo ha puesto, que el boton no manda contrasenas
        y que a los cinco fallos se bloquea la cuenta. Todo cierto y todo de mas.

        Quien abre esto tiene un problema y busca UNA cosa: a quien acudir. Cinco parrafos
        explicando el mecanismo no se leen —se saltan—, y al saltarlos se salta tambien el
        telefono, que era lo unico que servia. Queda el contacto y el boton; lo demas se aprende
        usandolo o no hacia falta.
      */}
      {support ? (
        <div className="rounded-lg border border-line bg-surface p-3.5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-500">
            {support.scope === 'tenant' ? 'En tu empresa' : 'Soporte de la plataforma'}
          </p>
          {support.contactName ? (
            <p className="mt-1 font-display text-sm font-semibold text-ink-900">{support.contactName}</p>
          ) : null}

          <div className="mt-2 space-y-1.5">
            {support.contactEmail ? (
              <a
                href={`mailto:${support.contactEmail}`}
                className="focus-ring flex items-center gap-2 text-sm text-primary hover:underline"
              >
                <Mail className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
                <span className="truncate">{support.contactEmail}</span>
              </a>
            ) : null}
            {support.contactPhone ? (
              <a
                href={`tel:${support.contactPhone.replace(/[^+\d]/g, '')}`}
                className="focus-ring flex items-center gap-2 text-sm text-primary hover:underline"
              >
                <Phone className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
                <span className="truncate">{support.contactPhone}</span>
              </a>
            ) : null}
          </div>

          {support.note ? <p className="mt-2 text-xs text-ink-500">{support.note}</p> : null}
        </div>
      ) : (
        // Sin contacto configurado no se deja el hueco mudo: sigue estando el boton, pero hay que
        // decir a que lleva, porque aqui no hay nadie a quien llamar.
        <p className="text-sm leading-relaxed text-ink-700">
          Quien administra en tu empresa puede darte una contraseña nueva.
        </p>
      )}

      {enviado ? (
        <p className="rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm text-ink-700">
          Listo. Quien administra ya tiene tu aviso.
        </p>
      ) : (
        <Button
          type="button"
          variant="outline"
          className="w-full"
          disabled={!puedeAvisar}
          loading={enviando}
          onClick={() => void avisar()}
          // Sin cedula arriba no hay a quien avisar, y un boton apagado sin decir por que es de
          // lo que mas desespera. Se dice en el propio boton, que es donde se mira.
          title={puedeAvisar ? undefined : 'Escribe arriba tu cedula o tu correo'}
        >
          {puedeAvisar ? 'Avisar a quien administra' : 'Escribe tu cedula arriba'}
        </Button>
      )}
    </div>
  );
}

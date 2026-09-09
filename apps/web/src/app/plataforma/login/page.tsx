'use client';

import { Lock, Mail, ShieldCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { ApiError } from '@/lib/api';
import { platformLogin } from '@/lib/platform-api';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';

/**
 * INGRESO DE LA PLATAFORMA (Decision #100). No es el de ningun cliente y tiene que NOTARSE.
 *
 * Deliberadamente SOBRIO, y es lo contrario del de los clientes: aquel es la cara de la empresa
 * —color de marca a media pantalla, logo, el pulso latiendo— porque es donde se presenta ante su
 * gente. Este lo abren dos personas que ya saben donde estan; adornarlo igual solo conseguiria que
 * las dos pantallas se confundieran, y confundirlas es justo lo que no puede pasar: se entra aqui
 * con credenciales que administran a todos los clientes a la vez.
 *
 * Por eso tampoco lleva colores de tenant: en esta pantalla no hay tenant. Los tokens de marca no
 * estan inyectados, asi que se usa la tinta de la plataforma y nada mas.
 */
export default function PlatformLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      await platformLogin(email.trim(), password);
      router.push('/plataforma');
    } catch (problema) {
      // Un solo mensaje para "no existe", "contrasena mala" y "cuenta bloqueada": distinguirlos
      // diria si una direccion tiene cuenta de proveedor, que no es algo que deba poder averiguarse
      // desde fuera.
      setError(
        problema instanceof ApiError && problema.status >= 500
          ? 'No pudimos conectar con el servidor.'
          : 'Correo o contraseña incorrectos.',
      );
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper px-5 py-10">
      <div className="w-full max-w-[380px]">
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden="true"
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-ink-900 text-white"
          >
            <ShieldCheck className="h-5 w-5" strokeWidth={1.75} />
          </span>
          <div>
            <p className="font-display text-base font-bold leading-tight text-ink-900">Ascent</p>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-500">Plataforma</p>
          </div>
        </div>

        <h1 className="mt-8 font-display text-[26px] font-bold text-ink-900">Administracion</h1>
        <p className="mt-1.5 text-sm text-ink-500">
          Esta no es la entrada de ningun cliente. Si buscas la tuya, es la direccion de tu empresa.
        </p>

        <form onSubmit={onSubmit} className="mt-7 space-y-4">
          <Field htmlFor="p-email" label="Correo">
            <div className="relative">
              <Mail
                className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-ink-300"
                strokeWidth={1.75}
                aria-hidden="true"
              />
              <Input
                id="p-email"
                type="email"
                autoComplete="username"
                autoFocus
                required
                className="h-12 pl-11 text-base"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
          </Field>

          <Field htmlFor="p-password" label="Contraseña">
            <div className="relative">
              <Lock
                className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-ink-300"
                strokeWidth={1.75}
                aria-hidden="true"
              />
              <Input
                id="p-password"
                type="password"
                autoComplete="current-password"
                required
                className="h-12 pl-11 text-base"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>
          </Field>

          {error ? (
            <p role="alert" className="animate-card-in rounded-lg bg-danger-soft px-3.5 py-2.5 text-sm text-danger">
              {error}
            </p>
          ) : null}

          <Button type="submit" loading={enviando} size="lg" className="w-full rounded-xl">
            {enviando ? 'Ingresando...' : 'Ingresar'}
          </Button>
        </form>

        {/*
          NO HAY "no puedo entrar". En los clientes ese enlace lleva a quien administra su empresa;
          aqui no hay nadie por encima a quien acudir. La vuelta es el script del servidor
          (`cuenta:plataforma`), que exige el mismo acceso que la cuenta concede — y decirlo aqui
          seria contarle a cualquiera por donde se rehace la cuenta que manda sobre todo.
        */}
      </div>
    </div>
  );
}

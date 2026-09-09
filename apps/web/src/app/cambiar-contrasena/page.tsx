'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { changePassword, me } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';

interface Requirement {
  label: string;
  met: boolean;
}

export default function CambiarContrasenaPage() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const requirements: Requirement[] = [
    { label: 'Mínimo 10 caracteres', met: newPassword.length >= 10 },
    { label: 'Al menos una mayuscula', met: /[A-Z]/.test(newPassword) },
    { label: 'Al menos una minuscula', met: /[a-z]/.test(newPassword) },
    { label: 'Al menos un número', met: /[0-9]/.test(newPassword) },
  ];
  const allRequirementsMet = requirements.every((requirement) => requirement.met);
  const passwordsMatch = confirmPassword.length > 0 && newPassword === confirmPassword;
  const canSubmit = currentPassword.length > 0 && allRequirementsMet && passwordsMatch && !submitting;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);

    try {
      await changePassword(currentPassword, newPassword);
      const profile = await me();
      router.push(profile.activated ? '/inicio' : '/activacion');
    } catch {
      setErrorMessage('No se pudo actualizar la contraseña. Verifica la contraseña actual.');
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="font-display text-xl font-semibold text-ink-900">Cambiar contraseña</h1>
          <p className="mt-1 text-sm text-ink-500">Debes definir una nueva contraseña para continuar.</p>
        </div>

        <form onSubmit={handleSubmit} className="card space-y-4 p-6">
          <Field htmlFor="currentPassword" label="Contraseña actual">
            <Input
              id="currentPassword"
              name="currentPassword"
              type="password"
              autoComplete="current-password"
              required
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
            />
          </Field>

          <div className="space-y-1.5">
            <Field htmlFor="newPassword" label="Nueva contraseña">
              <Input
                id="newPassword"
                name="newPassword"
                type="password"
                autoComplete="new-password"
                required
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
              />
            </Field>
            <ul className="space-y-1 pt-1">
              {requirements.map((requirement) => (
                <li
                  key={requirement.label}
                  className={`text-xs ${requirement.met ? 'text-ok' : 'text-ink-500'}`}
                >
                  {requirement.met ? 'OK' : 'Pendiente'} — {requirement.label}
                </li>
              ))}
            </ul>
          </div>

          <Field
            htmlFor="confirmPassword"
            label="Confirmar nueva contraseña"
            error={confirmPassword.length > 0 && !passwordsMatch ? 'Las contraseñas no coinciden.' : undefined}
          >
            <Input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              required
              invalid={confirmPassword.length > 0 && !passwordsMatch}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
            />
          </Field>

          {errorMessage ? (
            <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
              {errorMessage}
            </p>
          ) : null}

          <Button type="submit" disabled={!canSubmit} loading={submitting} className="w-full">
            {submitting ? 'Guardando...' : 'Guardar contraseña'}
          </Button>
        </form>
      </div>
    </div>
  );
}

'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { activate } from '@/lib/api';
import { Button } from '@/components/ui/button';

export default function ActivacionPage() {
  const router = useRouter();
  const [acceptHabeasData, setAcceptHabeasData] = useState(false);
  const [acceptESignAgreement, setAcceptESignAgreement] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const canSubmit = acceptHabeasData && acceptESignAgreement && !submitting;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!acceptHabeasData || !acceptESignAgreement) {
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);

    try {
      await activate(true, true);
      router.push('/inicio');
    } catch {
      setErrorMessage('No se pudo activar la cuenta. Intenta de nuevo.');
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="font-display text-xl font-semibold text-ink-900">Activar cuenta</h1>
          <p className="mt-1 text-sm text-ink-500">
            Para continuar debes aceptar los siguientes terminos.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="card space-y-4 p-6">
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={acceptHabeasData}
              onChange={(event) => setAcceptHabeasData(event.target.checked)}
              className="focus-ring mt-1 h-4 w-4 rounded border-line-strong text-primary"
            />
            <span className="text-sm text-ink-700">
              Autorizo el tratamiento de mis datos personales conforme a la Ley 1581 de 2012 y la
              politica de tratamiento de datos.
            </span>
          </label>

          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={acceptESignAgreement}
              onChange={(event) => setAcceptESignAgreement(event.target.checked)}
              className="focus-ring mt-1 h-4 w-4 rounded border-line-strong text-primary"
            />
            <span className="text-sm text-ink-700">
              Acepto el acuerdo de uso de firma electronica (Decreto 2364 de 2012): mis acciones
              autenticadas en la plataforma (asistencias, evaluaciones) tienen valor de firma.
            </span>
          </label>

          {errorMessage ? (
            <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
              {errorMessage}
            </p>
          ) : null}

          <Button type="submit" disabled={!canSubmit} loading={submitting} className="w-full">
            {submitting ? 'Activando...' : 'Activar mi cuenta'}
          </Button>
        </form>
      </div>
    </div>
  );
}

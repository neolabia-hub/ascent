'use client';

import { useEffect, useState } from 'react';
import { Award, Download, ShieldOff } from 'lucide-react';
import {
  descargarPdf,
  getCertificatesOf,
  revokeCertificate,
  type CertificateRow,
} from '@/lib/certificates-api';
import { Button } from '@/components/ui/button';
import { Drawer } from '@/components/ui/drawer';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusPill } from '@/components/ui/status-pill';
import { useToast } from '@/components/ui/toast';
import { useCan } from '@/components/providers/session-provider';
import { motivoDelError } from '@/lib/api';

/**
 * LAS CONSTANCIAS DE UNA PERSONA, PARA QUIEN LLEVA EL EXPEDIENTE (Decision #128).
 *
 * ─── POR QUE HACE FALTA SI EL APRENDIZ YA LAS TIENE ───
 *
 * Porque la peticion real no la hace el aprendiz: la hace **la empresa**. "Mandame el certificado de
 * alturas de Juan" llega por WhatsApp un viernes, y Juan puede estar en carretera, sin datos o
 * haberse ido hace un mes. Decirle a quien administra que se lo pida a Juan no es una respuesta.
 *
 * El endpoint existia desde el Sprint 5 (`GET /certificates?userId=`, con `certificates:issue`) y
 * ninguna pantalla lo usaba: la unica forma de bajar una constancia ajena era encontrar a esa
 * persona dentro del detalle de una formacion concreta en Seguimiento — es decir, sabiendo de
 * antemano cual buscar.
 *
 * ─── REVOCAR PIDE MOTIVO, Y NO SE BORRA ───
 *
 * Anular la evidencia de que alguien se capacito es un acto grave y con consecuencias legales. Se
 * conserva la fila, se marca revocada y se exige por que: una revocacion sin explicacion es
 * indefendible seis meses despues, que es justo cuando alguien pregunta.
 */
export function ConstanciasDePersona({
  userId,
  nombre,
  open,
  onOpenChange,
}: {
  userId: string | null;
  nombre: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { showToast } = useToast();
  const puedeRevocar = useCan()('certificates:revoke');
  const [filas, setFilas] = useState<CertificateRow[] | null>(null);
  const [bajando, setBajando] = useState<string | null>(null);
  const [aRevocar, setARevocar] = useState<CertificateRow | null>(null);
  const [motivo, setMotivo] = useState('');
  const [revocando, setRevocando] = useState(false);

  useEffect(() => {
    if (!open || !userId) return;
    setFilas(null);
    void getCertificatesOf(userId)
      .then(setFilas)
      .catch(() => setFilas([]));
  }, [open, userId]);

  const descargar = async (fila: CertificateRow) => {
    setBajando(fila.id);
    try {
      await descargarPdf(`/certificates/${fila.id}/pdf`, `${nombre} - ${fila.activityName}.pdf`);
    } catch (error) {
      showToast({ kind: 'danger', title: 'No se pudo descargar la constancia', description: motivoDelError(error) });
    } finally {
      setBajando(null);
    }
  };

  const revocar = async () => {
    if (!aRevocar || motivo.trim().length < 10) return;
    setRevocando(true);
    try {
      await revokeCertificate(aRevocar.id, motivo.trim());
      showToast({ kind: 'success', title: 'Constancia revocada' });
      setARevocar(null);
      setMotivo('');
      if (userId) setFilas(await getCertificatesOf(userId));
    } catch (error) {
      showToast({ kind: 'danger', title: 'No se pudo revocar', description: motivoDelError(error) });
    } finally {
      setRevocando(false);
    }
  };

  return (
    <>
      <Drawer open={open} onOpenChange={onOpenChange} title="Constancias" description={nombre}>
        {filas === null ? (
          <div className="space-y-2">
            <Skeleton className="h-16 w-full rounded-xl" />
            <Skeleton className="h-16 w-full rounded-xl" />
          </div>
        ) : filas.length === 0 ? (
          <div className="py-8 text-center">
            <Award className="mx-auto h-8 w-8 text-ink-300" strokeWidth={1.5} aria-hidden="true" />
            <p className="mt-3 text-sm text-ink-700">Todavia no tiene constancias.</p>
            {/*
              Se dice POR QUE puede no haberlas: no toda formacion acredita, y un vacio sin
              explicacion se lee como que el sistema perdio algo.
            */}
            <p className="mt-1 text-xs leading-relaxed text-ink-500">
              Se emiten al terminar una formacion que acredite. Una pildora o una charla no dejan
              constancia, y eso es lo esperado.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {filas.map((fila) => (
              <li key={fila.id} className="rounded-xl border border-line p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-ink-900">{fila.activityName}</p>
                    <p className="mt-0.5 text-xs tabular-nums text-ink-500">
                      Emitida el {new Date(fila.issuedAt).toLocaleDateString('es-CO')}
                      {fila.validUntil
                        ? ` · vence el ${new Date(fila.validUntil).toLocaleDateString('es-CO')}`
                        : ' · sin vencimiento'}
                    </p>
                    <p className="mt-1 font-mono text-[11px] text-ink-500">{fila.serialNumber}</p>
                  </div>
                  <EstadoDeConstancia fila={fila} />
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    loading={bajando === fila.id}
                    onClick={() => descargar(fila)}
                    aria-label={`Descargar la constancia de ${fila.activityName}`}
                  >
                    <Download size={14} />
                    Descargar
                  </Button>
                  {puedeRevocar && !fila.revoked ? (
                    <Button variant="ghost" size="sm" className="text-danger" onClick={() => setARevocar(fila)}>
                      <ShieldOff size={14} />
                      Revocar
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Drawer>

      <Drawer
        open={aRevocar !== null}
        onOpenChange={(abierto) => {
          if (!abierto) {
            setARevocar(null);
            setMotivo('');
          }
        }}
        title="Revocar constancia"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setARevocar(null)}>
              Cancelar
            </Button>
            <Button variant="danger" loading={revocando} disabled={motivo.trim().length < 10} onClick={revocar}>
              Revocar
            </Button>
          </div>
        }
      >
        <p className="text-sm leading-relaxed text-ink-700">
          La constancia de <span className="font-semibold">{aRevocar?.activityName}</span> quedara
          anulada y la verificacion publica lo dira. <span className="font-semibold">No se borra</span>:
          es evidencia, y el registro se conserva con el motivo.
        </p>
        <div className="mt-4">
          <Field
            htmlFor="motivo-revocacion"
            label="Motivo"
            hint="Minimo 10 caracteres. Queda guardado: sin el, la revocacion es indefendible dentro de seis meses."
          >
            <Input
              id="motivo-revocacion"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ej.: se emitio con la version equivocada del examen"
            />
          </Field>
        </div>
      </Drawer>
    </>
  );
}

/** Vigente, vencida o revocada. Se calcula de las fechas: no hay un estado guardado que pueda mentir. */
function EstadoDeConstancia({ fila }: { fila: CertificateRow }) {
  if (fila.revoked) return <StatusPill kind="danger" label="REVOCADA" />;
  if (fila.validUntil && new Date(fila.validUntil) < new Date()) return <StatusPill kind="warn" label="VENCIDA" />;
  return <StatusPill kind="ok" label="VIGENTE" />;
}

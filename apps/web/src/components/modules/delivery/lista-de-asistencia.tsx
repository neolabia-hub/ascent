'use client';

import { ClipboardList } from 'lucide-react';
import { useMemo, useState } from 'react';
import { marcarAsistencia, type CertificadoExterno, type RosterRow } from '@/lib/delivery-api';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { StatusPill } from '@/components/ui/status-pill';
import { TBody, THead, Table, Td, Th, Tr } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';

/**
 * LA LISTA DE ASISTENCIA (Decision #157).
 *
 * ─── POR QUE HACIA FALTA ───
 *
 * Hasta aqui una formacion solo se podia dar por cumplida de UNA forma: la persona entrando a la
 * plataforma y completando el contenido. En una empresa bajo SG-SST la mayor parte del plan anual
 * se dicta en salon —charlas de seguridad vial, brigadas, lo que trae la ARL— y de eso no queda
 * contenido que completar: queda una hoja firmada. Sin esta pantalla, todo lo dictado
 * presencialmente contaba como incumplido, y el indicador enseñaba cero de lo que si se hizo.
 *
 * ─── SOLO EN LAS JORNADAS `EVENT`, Y NO POR LA MODALIDAD ───
 *
 * Una jornada con fecha y cupo se cierra por asistencia la dicte como la dicte: presencial o
 * virtual en vivo. En las dos hay una lista de quien estuvo. En una convocatoria PERMANENTE no:
 * ahi la persona entra sola y la evidencia es lo que la plataforma registro.
 *
 * ─── LO QUE SE DECIDIO EN LA FORMA ───
 *
 * **Todos empiezan marcados como presentes.** Lo normal es que quien fue convocado asista, y en una
 * lista de cuarenta obliga a desmarcar tres en vez de marcar treinta y siete. Quien no vino es la
 * excepcion, y es la que hay que buscar a proposito.
 *
 * **Quien no vino NO se toca**: no se cierra nada y no se le retira la obligacion. La sigue
 * debiendo, que es el punto entero de tomar asistencia.
 *
 * **El papel del tercero solo se pide si el TIPO lo lleva** (`tracksExternalCertificate`). Pedir un
 * numero de certificado en una charla de quince minutos llena el expediente de campos vacios y
 * enseña a saltarselos.
 */
export function ListaDeAsistencia({
  offeringId,
  roster,
  pideCertificado,
  onHecho,
}: {
  offeringId: string;
  roster: RosterRow[];
  /** `activity_types.config.tracksExternalCertificate`: lo decide la empresa, no esta pantalla. */
  pideCertificado: boolean;
  onHecho: () => void;
}) {
  const { showToast } = useToast();
  const [abierta, setAbierta] = useState(false);
  const [busy, setBusy] = useState(false);
  const [heldOn, setHeldOn] = useState(() => new Date().toISOString().slice(0, 10));

  /**
   * Quien ya tiene su formacion cerrada no entra en la lista: no hay nada que marcarle, y dejarlo
   * invita a "revisar" a alguien cuya evidencia ya esta escrita.
   */
  const porRevisar = useMemo(() => roster.filter((fila) => !fila.completedAt), [roster]);
  const yaRevisados = roster.length - porRevisar.length;

  const [presentes, setPresentes] = useState<Record<string, boolean>>({});
  const [papeles, setPapeles] = useState<Record<string, CertificadoExterno>>({});

  const vino = (id: string) => presentes[id] ?? true;
  const papel = (id: string) => papeles[id] ?? { issuer: '', number: '' };

  const cuentaPresentes = porRevisar.filter((fila) => vino(fila.id)).length;

  /**
   * El papel es OPCIONAL, pero a medias no vale: un numero sin entidad no se puede rastrear y una
   * entidad sin numero no identifica nada. O los dos, o ninguno.
   */
  const papelIncompleto = porRevisar.some((fila) => {
    if (!pideCertificado || !vino(fila.id)) return false;
    const p = papel(fila.id);
    const algo = p.issuer.trim() || p.number.trim() || p.validUntil;
    return Boolean(algo) && !(p.issuer.trim().length >= 2 && p.number.trim().length >= 1);
  });

  async function guardar() {
    setBusy(true);
    try {
      const resultado = await marcarAsistencia(offeringId, {
        heldOn,
        items: porRevisar.map((fila) => {
          const p = papel(fila.id);
          const tienePapel = pideCertificado && vino(fila.id) && p.issuer.trim() && p.number.trim();
          return {
            enrollmentId: fila.id,
            attended: vino(fila.id),
            ...(tienePapel
              ? {
                  certificate: {
                    issuer: p.issuer.trim(),
                    number: p.number.trim(),
                    ...(p.issuedAt ? { issuedAt: p.issuedAt } : {}),
                    ...(p.validUntil ? { validUntil: p.validUntil } : {}),
                  },
                }
              : {}),
          };
        }),
      });
      showToast({
        kind: 'success',
        title: `${resultado.cerradas} formacion(es) dada(s) por cumplida(s)`,
        description:
          resultado.ausentes > 0
            ? `${resultado.ausentes} no asistieron y la siguen debiendo.`
            : 'Asistieron todos los convocados.',
      });
      setAbierta(false);
      onHecho();
    } catch (error) {
      showToast({
        kind: 'danger',
        title: 'No se pudo guardar la asistencia',
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  }

  if (roster.length === 0) return null;

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <div>
          <h2 className="font-display text-base font-semibold text-ink-900">Lista de asistencia</h2>
          <p className="mt-0.5 text-sm text-ink-500">
            {porRevisar.length === 0
              ? 'Todos los inscritos ya tienen su formacion cerrada.'
              : `${porRevisar.length} por revisar${yaRevisados > 0 ? ` · ${yaRevisados} ya cerrada(s)` : ''}`}
          </p>
        </div>
        {porRevisar.length > 0 ? (
          <Button variant={abierta ? 'ghost' : 'primary'} onClick={() => setAbierta(!abierta)}>
            {abierta ? 'Cancelar' : 'Tomar asistencia'}
          </Button>
        ) : null}
      </div>

      {abierta && porRevisar.length > 0 ? (
        <div className="border-t border-line">
          <div className="flex flex-wrap items-end gap-4 px-5 py-4">
            <Field htmlFor="asist-fecha" label="Se dicto el" hint="Es la fecha que queda como cumplimiento.">
              <Input
                id="asist-fecha"
                type="date"
                className="max-w-[11rem]"
                value={heldOn}
                onChange={(e) => setHeldOn(e.target.value)}
              />
            </Field>
            <p className="pb-2 text-sm text-ink-500">
              <strong className="font-medium text-ink-900">{cuentaPresentes}</strong> de {porRevisar.length} asistieron.
              Quien no vino sigue debiendo la formacion.
            </p>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <THead>
                <Tr>
                  <Th>Asistio</Th>
                  <Th>Persona</Th>
                  <Th>Cargo</Th>
                  {pideCertificado ? <Th>Certificado del tercero</Th> : null}
                </Tr>
              </THead>
              <TBody>
                {porRevisar.map((fila) => (
                  <Tr key={fila.id}>
                    <Td>
                      <input
                        type="checkbox"
                        className="focus-ring size-4 accent-primary"
                        aria-label={`Asistio ${fila.user.fullName}`}
                        checked={vino(fila.id)}
                        onChange={(e) => setPresentes({ ...presentes, [fila.id]: e.target.checked })}
                      />
                    </Td>
                    <Td>
                      <div className={vino(fila.id) ? 'font-medium text-ink-900' : 'text-ink-500 line-through'}>
                        {fila.user.fullName}
                      </div>
                      <div className="font-mono text-xs text-ink-500">{fila.user.documentNumber}</div>
                    </Td>
                    <Td className="text-ink-700">{fila.user.jobTitle.name}</Td>
                    {pideCertificado ? (
                      <Td>
                        {vino(fila.id) ? (
                          <div className="flex flex-wrap gap-2">
                            <Input
                              className="max-w-[10rem]"
                              placeholder="Entidad (ARL...)"
                              aria-label={`Entidad que certifica a ${fila.user.fullName}`}
                              value={papel(fila.id).issuer}
                              onChange={(e) => setPapeles({ ...papeles, [fila.id]: { ...papel(fila.id), issuer: e.target.value } })}
                            />
                            <Input
                              className="max-w-[9rem]"
                              placeholder="No. certificado"
                              aria-label={`Numero de certificado de ${fila.user.fullName}`}
                              value={papel(fila.id).number}
                              onChange={(e) => setPapeles({ ...papeles, [fila.id]: { ...papel(fila.id), number: e.target.value } })}
                            />
                            <Input
                              type="date"
                              className="max-w-[9.5rem]"
                              aria-label={`Vence el certificado de ${fila.user.fullName}`}
                              value={papel(fila.id).validUntil ?? ''}
                              onChange={(e) =>
                                setPapeles({ ...papeles, [fila.id]: { ...papel(fila.id), validUntil: e.target.value } })
                              }
                            />
                          </div>
                        ) : (
                          <span className="text-sm text-ink-500">—</span>
                        )}
                      </Td>
                    ) : null}
                  </Tr>
                ))}
              </TBody>
            </Table>
          </div>

          {pideCertificado ? (
            <p className="flex items-start gap-2 border-t border-line px-5 py-3 text-sm text-ink-500">
              <ClipboardList size={15} className="mt-0.5 shrink-0" strokeWidth={2} />
              <span>
                El certificado es <strong className="font-medium text-ink-700">opcional</strong>: si todavia no llego,
                marca la asistencia y añadelo despues. Cuando lo pongas, <strong className="font-medium text-ink-700">su
                fecha de vencimiento manda</strong> sobre la que calcularia el sistema.
              </span>
            </p>
          ) : null}

          <div className="flex justify-end gap-2 border-t border-line px-5 py-4">
            <Button variant="ghost" onClick={() => setAbierta(false)}>
              Cancelar
            </Button>
            <Button onClick={guardar} loading={busy} disabled={papelIncompleto}>
              {papelIncompleto ? 'Falta entidad o numero' : `Dar por cumplida a ${cuentaPresentes}`}
            </Button>
          </div>
        </div>
      ) : null}

      {!abierta && yaRevisados > 0 ? (
        <div className="overflow-x-auto border-t border-line">
          <Table>
            <THead>
              <Tr>
                <Th>Persona</Th>
                <Th>Como consta</Th>
                <Th>Certificado</Th>
                <Th>Vence</Th>
              </Tr>
            </THead>
            <TBody>
              {roster
                .filter((fila) => fila.completedAt)
                .map((fila) => (
                  <Tr key={fila.id}>
                    <Td className="font-medium text-ink-900">{fila.user.fullName}</Td>
                    <Td>
                      <StatusPill
                        kind="ok"
                        label={fila.attendedAt ? 'ASISTIO' : 'EN PLATAFORMA'}
                      />
                    </Td>
                    <Td className="text-ink-700">
                      {fila.extCertNumber ? `${fila.extCertIssuer} · ${fila.extCertNumber}` : '—'}
                    </Td>
                    <Td className="text-ink-700">
                      {fila.extCertValidUntil ? fila.extCertValidUntil.slice(0, 10) : '—'}
                    </Td>
                  </Tr>
                ))}
            </TBody>
          </Table>
        </div>
      ) : null}
    </div>
  );
}

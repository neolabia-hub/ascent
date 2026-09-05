'use client';

import { ClipboardList } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  marcarAsistencia,
  type AsistenciaEstado,
  type CertificadoExterno,
  type RosterRow,
} from '@/lib/delivery-api';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
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
 * ─── LOS TRES ESTADOS, Y EL CUARTO QUE ES NO HABER MIRADO ───
 *
 * PRESENT / ABSENT / JUSTIFIED son los del diseno (CLAUDE.md 3.7) y se guardan en
 * `attendance_records`, la tabla que ya existia para esto desde el Sprint 5. El cuarto estado es
 * `null`: todavia sin revisar, que NO es lo mismo que ausente — la primera es trabajo pendiente y
 * la segunda es evidencia.
 *
 * **JUSTIFIED no exime la formacion**: explica por que no vino a ESA jornada, no que ya no tenga
 * que formarse. La sigue debiendo y va a la siguiente.
 *
 * ─── LO QUE SE DECIDIO EN LA FORMA ───
 *
 * **Todos empiezan como PRESENT.** Lo normal es que quien fue convocado asista, y en una lista de
 * cuarenta obliga a cambiar tres en vez de marcar treinta y siete. La excepcion es la que hay que
 * buscar a proposito.
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

  const [estados, setEstados] = useState<Record<string, AsistenciaEstado>>({});
  const [motivos, setMotivos] = useState<Record<string, string>>({});
  const [papeles, setPapeles] = useState<Record<string, CertificadoExterno>>({});

  const estadoDe = (id: string): AsistenciaEstado => estados[id] ?? 'PRESENT';
  const papel = (id: string) => papeles[id] ?? { issuer: '', number: '' };
  const cuentaPresentes = porRevisar.filter((fila) => estadoDe(fila.id) === 'PRESENT').length;

  /** Una justificacion sin motivo no justifica nada, y es lo que el auditor va a leer. */
  const faltaMotivo = porRevisar.some(
    (fila) => estadoDe(fila.id) === 'JUSTIFIED' && (motivos[fila.id] ?? '').trim().length < 5,
  );

  /**
   * El papel es OPCIONAL, pero a medias no vale: un numero sin entidad no se puede rastrear y una
   * entidad sin numero no identifica nada. O los dos, o ninguno.
   */
  const papelIncompleto = porRevisar.some((fila) => {
    if (!pideCertificado || estadoDe(fila.id) !== 'PRESENT') return false;
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
          const estado = estadoDe(fila.id);
          const p = papel(fila.id);
          const tienePapel = pideCertificado && estado === 'PRESENT' && p.issuer.trim() && p.number.trim();
          return {
            enrollmentId: fila.id,
            estado,
            ...(estado === 'JUSTIFIED' ? { motivo: (motivos[fila.id] ?? '').trim() } : {}),
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
            ? `${resultado.ausentes} no asistieron (${resultado.justificados} con justificacion) y la siguen debiendo.`
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
              Quien no vino <strong className="font-medium text-ink-700">sigue debiendo</strong> la formacion, aunque la
              falta este justificada.
            </p>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <THead>
                <Tr>
                  <Th>Persona</Th>
                  <Th>Asistencia</Th>
                  <Th>Motivo</Th>
                  {pideCertificado ? <Th>Certificado del tercero</Th> : null}
                </Tr>
              </THead>
              <TBody>
                {porRevisar.map((fila) => {
                  const estado = estadoDe(fila.id);
                  return (
                    <Tr key={fila.id}>
                      <Td>
                        <div className={estado === 'PRESENT' ? 'font-medium text-ink-900' : 'text-ink-500'}>
                          {fila.user.fullName}
                        </div>
                        <div className="font-mono text-xs text-ink-500">{fila.user.documentNumber}</div>
                        <div className="text-xs text-ink-500">{fila.user.jobTitle.name}</div>
                      </Td>
                      <Td>
                        <Select
                          className="max-w-[9.5rem]"
                          aria-label={`Asistencia de ${fila.user.fullName}`}
                          value={estado}
                          onChange={(e) => setEstados({ ...estados, [fila.id]: e.target.value as AsistenciaEstado })}
                        >
                          <option value="PRESENT">Asistio</option>
                          <option value="ABSENT">No asistio</option>
                          <option value="JUSTIFIED">Falta justificada</option>
                        </Select>
                      </Td>
                      <Td>
                        {estado === 'JUSTIFIED' ? (
                          <Input
                            className="max-w-[14rem]"
                            placeholder="Incapacidad, vacaciones..."
                            aria-label={`Motivo de la falta de ${fila.user.fullName}`}
                            value={motivos[fila.id] ?? ''}
                            onChange={(e) => setMotivos({ ...motivos, [fila.id]: e.target.value })}
                          />
                        ) : (
                          <span className="text-sm text-ink-500">—</span>
                        )}
                      </Td>
                      {pideCertificado ? (
                        <Td>
                          {estado === 'PRESENT' ? (
                            <div className="flex flex-wrap gap-2">
                              <Input
                                className="max-w-[10rem]"
                                placeholder="Entidad (ARL...)"
                                aria-label={`Entidad que certifica a ${fila.user.fullName}`}
                                value={papel(fila.id).issuer}
                                onChange={(e) =>
                                  setPapeles({ ...papeles, [fila.id]: { ...papel(fila.id), issuer: e.target.value } })
                                }
                              />
                              <Input
                                className="max-w-[9rem]"
                                placeholder="No. certificado"
                                aria-label={`Numero de certificado de ${fila.user.fullName}`}
                                value={papel(fila.id).number}
                                onChange={(e) =>
                                  setPapeles({ ...papeles, [fila.id]: { ...papel(fila.id), number: e.target.value } })
                                }
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
                  );
                })}
              </TBody>
            </Table>
          </div>

          {pideCertificado ? (
            <p className="flex items-start gap-2 border-t border-line px-5 py-3 text-sm text-ink-500">
              <ClipboardList size={15} className="mt-0.5 shrink-0" strokeWidth={2} />
              <span>
                El certificado es <strong className="font-medium text-ink-700">opcional</strong>: si todavia no llego,
                marca la asistencia y añadelo despues. Cuando lo pongas,{' '}
                <strong className="font-medium text-ink-700">su fecha de vencimiento manda</strong> sobre la que
                calcularia el sistema.
              </span>
            </p>
          ) : null}

          <div className="flex justify-end gap-2 border-t border-line px-5 py-4">
            <Button variant="ghost" onClick={() => setAbierta(false)}>
              Cancelar
            </Button>
            <Button onClick={guardar} loading={busy} disabled={papelIncompleto || faltaMotivo}>
              {faltaMotivo
                ? 'Falta el motivo de la justificacion'
                : papelIncompleto
                  ? 'Falta entidad o numero'
                  : `Dar por cumplida a ${cuentaPresentes}`}
            </Button>
          </div>
        </div>
      ) : null}

      {!abierta && roster.some((fila) => fila.attendanceStatus || fila.completedAt) ? (
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
                .filter((fila) => fila.attendanceStatus || fila.completedAt)
                .map((fila) => (
                  <Tr key={fila.id}>
                    <Td className="font-medium text-ink-900">{fila.user.fullName}</Td>
                    <Td>
                      <StatusPill
                        kind={fila.completedAt ? 'ok' : fila.attendanceStatus === 'JUSTIFIED' ? 'info' : 'warn'}
                        label={
                          fila.attendanceStatus === 'PRESENT'
                            ? 'ASISTIO'
                            : fila.attendanceStatus === 'JUSTIFIED'
                              ? 'FALTA JUSTIFICADA'
                              : fila.attendanceStatus === 'ABSENT'
                                ? 'NO ASISTIO'
                                : 'EN PLATAFORMA'
                        }
                      />
                      {fila.attendanceNote ? (
                        <div className="mt-0.5 text-xs text-ink-500">{fila.attendanceNote}</div>
                      ) : null}
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

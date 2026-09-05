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
 * `attendance_records`. El cuarto estado es `null`: todavia sin revisar, que NO es lo mismo que
 * ausente — la primera es trabajo pendiente y la segunda es evidencia.
 *
 * **JUSTIFIED no exime la formacion**: explica por que no vino a ESA jornada, no que ya no tenga
 * que formarse. La sigue debiendo y va a la siguiente.
 *
 * ─── LO QUE SE DECIDIO PARA QUE NO SEA UN TRABAJO DE CHINOS ───
 *
 * Lo pidio el cliente —*"por si son muchos... como se puede ayudar a ser mas automatico"*— y son
 * cuatro cosas, todas sobre lo mismo: **que una jornada normal se cierre sin tocar la lista**.
 *
 *   1. Todos empiezan como PRESENTE. Lo normal es que quien fue convocado asista, asi que en una
 *      lista de cuarenta hay que cambiar tres, no marcar treinta y siete.
 *   2. La fecha viene de la JORNADA, no de hoy. Se toma asistencia al dia siguiente mas veces de
 *      las que se toma en el salon, y poner "hoy" hace que el cumplimiento quede fechado mal.
 *   3. **Todos asistieron / Nadie asistio**, para el caso raro en que se cancelo de hecho.
 *   4. El EMISOR del certificado no se teclea: sale de quien dicta la jornada. Escribirlo cuarenta
 *      veces es copiar un dato que el sistema ya tiene, y garantizar que en la fila 23 alguien
 *      ponga "ARL sura". Lo unico propio de cada persona es su NUMERO.
 *
 * **El papel del tercero solo se pide si la FORMACION lo lleva.** La decision viene resuelta del
 * servidor (`registraCertificadoExterno`), porque sale de la formacion con su tipo de respaldo y
 * dos implementaciones de la misma cascada acaban discrepando.
 */
export function ListaDeAsistencia({
  offeringId,
  roster,
  pideCertificado,
  quienLaDicto,
  fechaDeLaJornada,
  onHecho,
}: {
  offeringId: string;
  roster: RosterRow[];
  /** Resuelto por el servidor: la formacion manda y su tipo es el punto de partida. */
  pideCertificado: boolean;
  /** Quien la dicta ("ARL Sura", "PROPIOS"): el emisor por defecto, para no teclearlo por cabeza. */
  quienLaDicto: string;
  fechaDeLaJornada: string | null;
  onHecho: () => void;
}) {
  const { showToast } = useToast();
  const [abierta, setAbierta] = useState(false);
  const [busy, setBusy] = useState(false);
  // La fecha de la JORNADA, no la de hoy: se toma asistencia al dia siguiente mas veces de las que
  // se toma en el salon, y fechar el cumplimiento en el dia que se teclea es fecharlo mal.
  const [heldOn, setHeldOn] = useState(
    () => (fechaDeLaJornada ?? new Date().toISOString()).slice(0, 10),
  );

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
  const papel = (id: string) => papeles[id] ?? { number: '' };
  const cuentaPresentes = porRevisar.filter((fila) => estadoDe(fila.id) === 'PRESENT').length;

  /** Marcar la lista entera de una vez: la jornada que fue como debia, o la que no se dicto. */
  function todos(estado: AsistenciaEstado) {
    setEstados(Object.fromEntries(porRevisar.map((fila) => [fila.id, estado])));
  }

  /** Una justificacion sin motivo no justifica nada, y es lo que el auditor va a leer. */
  const faltaMotivo = porRevisar.some(
    (fila) => estadoDe(fila.id) === 'JUSTIFIED' && (motivos[fila.id] ?? '').trim().length < 5,
  );

  async function guardar() {
    setBusy(true);
    try {
      const resultado = await marcarAsistencia(offeringId, {
        heldOn,
        items: porRevisar.map((fila) => {
          const estado = estadoDe(fila.id);
          const p = papel(fila.id);
          // El emisor lo pone el servidor desde la jornada; aqui solo viaja lo propio de la persona.
          const tienePapel = pideCertificado && estado === 'PRESENT' && p.number.trim();
          return {
            enrollmentId: fila.id,
            estado,
            ...(estado === 'JUSTIFIED' ? { motivo: (motivos[fila.id] ?? '').trim() } : {}),
            ...(tienePapel
              ? {
                  certificate: {
                    number: p.number.trim(),
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
            <div className="flex flex-wrap items-center gap-2 pb-1">
              <Button variant="ghost" onClick={() => todos('PRESENT')}>
                Todos asistieron
              </Button>
              <Button variant="ghost" onClick={() => todos('ABSENT')}>
                Nadie asistio
              </Button>
            </div>
          </div>

          <p className="px-5 pb-3 text-sm text-ink-500">
            <strong className="font-medium text-ink-900">{cuentaPresentes}</strong> de {porRevisar.length} asistieron.
            Quien no vino <strong className="font-medium text-ink-700">sigue debiendo</strong> la formacion, aunque la
            falta este justificada.
          </p>

          {pideCertificado ? (
            <p className="flex items-start gap-2 border-t border-line px-5 py-3 text-sm text-ink-500">
              <ClipboardList size={15} className="mt-0.5 shrink-0" strokeWidth={2} />
              <span>
                El certificado lo expide <strong className="font-medium text-ink-700">{quienLaDicto}</strong>, que es
                quien dicta esta jornada — no hay que escribirlo por persona. Solo su{' '}
                <strong className="font-medium text-ink-700">numero</strong>, y el vencimiento si lo trae:{' '}
                <strong className="font-medium text-ink-700">esa fecha manda</strong> sobre la que calcularia el sistema.
                Si el papel todavia no ha llegado, deja el numero en blanco y añadelo despues.
              </span>
            </p>
          ) : null}

          <div className="overflow-x-auto">
            <Table>
              <THead>
                <Tr>
                  <Th>Persona</Th>
                  <Th>Asistencia</Th>
                  <Th>Motivo</Th>
                  {pideCertificado ? <Th>No. de certificado</Th> : null}
                  {pideCertificado ? <Th>Vence</Th> : null}
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
                            <Input
                              className="max-w-[10rem]"
                              placeholder="Opcional"
                              aria-label={`Numero de certificado de ${fila.user.fullName}`}
                              value={papel(fila.id).number}
                              onChange={(e) =>
                                setPapeles({ ...papeles, [fila.id]: { ...papel(fila.id), number: e.target.value } })
                              }
                            />
                          ) : (
                            <span className="text-sm text-ink-500">—</span>
                          )}
                        </Td>
                      ) : null}
                      {pideCertificado ? (
                        <Td>
                          {estado === 'PRESENT' ? (
                            <Input
                              type="date"
                              className="max-w-[9.5rem]"
                              aria-label={`Vence el certificado de ${fila.user.fullName}`}
                              value={papel(fila.id).validUntil ?? ''}
                              onChange={(e) =>
                                setPapeles({ ...papeles, [fila.id]: { ...papel(fila.id), validUntil: e.target.value } })
                              }
                            />
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

          <div className="flex justify-end gap-2 border-t border-line px-5 py-4">
            <Button variant="ghost" onClick={() => setAbierta(false)}>
              Cancelar
            </Button>
            <Button onClick={guardar} loading={busy} disabled={faltaMotivo}>
              {faltaMotivo ? 'Falta el motivo de la justificacion' : `Dar por cumplida a ${cuentaPresentes}`}
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

'use client';

import { ClipboardList, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  marcarAsistencia,
  type AsistenciaEstado,
  type CertificadoExterno,
  type RosterRow,
} from '@/lib/delivery-api';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { StatusPill, type StatusPillKind } from '@/components/ui/status-pill';
import { TBody, THead, Table, Td, Th, Tr } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';

/**
 * LOS INSCRITOS, Y TOMAR SU ASISTENCIA — UNA SOLA TABLA CON DOS MODOS (Decision #157).
 *
 * ─── POR QUE UNA Y NO DOS ───
 *
 * Habia dos tarjetas con la MISMA gente: "Inscritos" y, al pulsar el boton, otra lista casi igual
 * debajo. Lo noto el cliente —*"¿no es redundante?"*— y tenia razon a medias: la informacion no era
 * la misma (una decia el origen y el estado, la otra pedia la marca), pero **la gente si**, y dos
 * tablas de las mismas personas obligan a mirar dos veces para responder una pregunta.
 *
 * MIRAR ensena quien esta y como consta lo suyo; TOMAR ASISTENCIA, las mismas filas con lo que hay
 * que marcar. **No se pierde ni una columna de las que habia** —persona, cargo, area, origen y
 * estado siguen todas— porque eso era justo lo que no se podia sacrificar al juntarlas.
 *
 * ─── POR QUE HACIA FALTA TOMAR ASISTENCIA ───
 *
 * Hasta el 2026-09-05 una formacion solo se daba por cumplida de UNA forma: la persona entrando a
 * la plataforma y completando el contenido. En una empresa bajo SG-SST buena parte del plan se
 * dicta en salon, y de eso no queda contenido que completar: queda una hoja firmada.
 *
 * ─── DONDE APARECE ───
 *
 * `admiteAsistencia` viene RESUELTO del servidor (`cierre-de-la-jornada.ts`) y esta pantalla no
 * repite la condicion. Cambio dos veces en dos dias, y una condicion que ya cambio dos veces es
 * justo la que no puede vivir en dos sitios.
 *
 * ─── LO QUE SE DECIDIO PARA QUE NO SEA UN TRABAJO DE CHINOS ───
 *
 *   1. Todos empiezan como PRESENTE: en una lista de cuarenta se cambian tres, no se marcan 37.
 *   2. La fecha viene de la JORNADA, no de hoy: se toma asistencia al dia siguiente muchas veces.
 *   3. **Todos asistieron / Nadie asistio** para la lista entera.
 *   4. El EMISOR del certificado sale de quien dicta la jornada; lo unico propio de cada persona es
 *      su NUMERO. Y el vencimiento se pone una vez y se reparte.
 *   5. La columna **Motivo solo sale si hay alguna falta justificada**: una columna de guiones en
 *      todas las filas hace que nadie lea la unica que si dice algo.
 */
export function ListaDeAsistencia({
  offeringId,
  roster,
  admiteAsistencia,
  puedeInscribir,
  pideCertificado,
  quienLaDicto,
  fechaDeLaJornada,
  onHecho,
}: {
  offeringId: string;
  roster: RosterRow[];
  /** Resuelto por el servidor: si esta jornada se cierra con lista o con la plataforma. */
  admiteAsistencia: boolean;
  /** Para el mensaje de la lista vacia: si ya se puede convocar o todavia hay que publicar. */
  puedeInscribir: boolean;
  pideCertificado: boolean;
  /** Quien la dicta ("ARL Sura"): el emisor por defecto, para no teclearlo por cabeza. */
  quienLaDicto: string;
  fechaDeLaJornada: string | null;
  onHecho: () => void;
}) {
  const { showToast } = useToast();
  const [tomando, setTomando] = useState(false);
  const [busy, setBusy] = useState(false);
  // La fecha de la JORNADA, no la de hoy: se toma asistencia al dia siguiente mas veces de las que
  // se toma en el salon, y fechar el cumplimiento el dia que se teclea es fecharlo mal.
  const [heldOn, setHeldOn] = useState(() => (fechaDeLaJornada ?? new Date().toISOString()).slice(0, 10));

  /** Quien ya tiene su formacion cerrada no entra a marcarse: no hay nada que hacerle. */
  const porRevisar = useMemo(() => roster.filter((fila) => !fila.completedAt), [roster]);

  const [estados, setEstados] = useState<Record<string, AsistenciaEstado>>({});
  const [motivos, setMotivos] = useState<Record<string, string>>({});
  const [papeles, setPapeles] = useState<Record<string, CertificadoExterno>>({});
  const [vencePorLote, setVencePorLote] = useState('');

  const estadoDe = (id: string): AsistenciaEstado => estados[id] ?? 'PRESENT';
  const papel = (id: string) => papeles[id] ?? { number: '' };
  const presentes = porRevisar.filter((fila) => estadoDe(fila.id) === 'PRESENT').length;

  /** La columna de motivo, solo cuando hay algo que justificar. Ver la nota de la cabecera. */
  const hayJustificadas = porRevisar.some((fila) => estadoDe(fila.id) === 'JUSTIFIED');
  const faltaMotivo = porRevisar.some(
    (fila) => estadoDe(fila.id) === 'JUSTIFIED' && (motivos[fila.id] ?? '').trim().length < 5,
  );

  function todos(estado: AsistenciaEstado) {
    setEstados(Object.fromEntries(porRevisar.map((fila) => [fila.id, estado])));
  }

  /**
   * La misma fecha de vencimiento para todos: es individual en el modelo —cada certificado es de una
   * persona— pero en la practica es la misma para toda la jornada. Escribirla veinte veces es
   * teclear veinte veces el mismo dato, y a la decima alguien pone otro ano.
   */
  function repartirVencimiento() {
    if (!vencePorLote) return;
    setPapeles((previos) =>
      Object.fromEntries(
        porRevisar.map((fila) => [fila.id, { ...(previos[fila.id] ?? { number: '' }), validUntil: vencePorLote }]),
      ),
    );
  }

  async function guardar() {
    setBusy(true);
    try {
      const resultado = await marcarAsistencia(offeringId, {
        heldOn,
        items: porRevisar.map((fila) => {
          const estado = estadoDe(fila.id);
          const p = papel(fila.id);
          const tienePapel = pideCertificado && estado === 'PRESENT' && p.number.trim();
          return {
            enrollmentId: fila.id,
            estado,
            ...(estado === 'JUSTIFIED' ? { motivo: (motivos[fila.id] ?? '').trim() } : {}),
            ...(tienePapel
              ? { certificate: { number: p.number.trim(), ...(p.validUntil ? { validUntil: p.validUntil } : {}) } }
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
      setTomando(false);
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

  /** COMO CONSTA lo suyo, que dice mas que "completada": por asistencia o por la plataforma. */
  const comoConsta = (fila: RosterRow): { kind: StatusPillKind; label: string } => {
    if (fila.completedAt) {
      return { kind: 'ok', label: fila.attendanceStatus === 'PRESENT' ? 'ASISTIO' : 'EN PLATAFORMA' };
    }
    if (fila.attendanceStatus === 'JUSTIFIED') return { kind: 'info', label: 'FALTA JUSTIFICADA' };
    if (fila.attendanceStatus === 'ABSENT') return { kind: 'warn', label: 'NO ASISTIO' };
    return { kind: 'neutral', label: 'INSCRITO' };
  };

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <div>
          <h2 className="font-display text-base font-semibold text-ink-900">Inscritos</h2>
          <p className="mt-0.5 text-sm text-ink-500">
            {roster.length} persona{roster.length === 1 ? '' : 's'}
            {admiteAsistencia && porRevisar.length > 0 ? ` · ${porRevisar.length} por revisar` : ''}
            {admiteAsistencia && porRevisar.length === 0 && roster.length > 0 ? ' · asistencia tomada' : ''}
          </p>
        </div>
        {admiteAsistencia && porRevisar.length > 0 ? (
          <Button variant={tomando ? 'ghost' : 'primary'} onClick={() => setTomando(!tomando)}>
            {tomando ? 'Cancelar' : 'Tomar asistencia'}
          </Button>
        ) : null}
      </div>

      {roster.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Nadie inscrito todavia"
          description={
            puedeInscribir
              ? 'Inscribe a quienes ya tienen la obligacion de esta actividad en la sede de la convocatoria.'
              : 'Publica la convocatoria para poder inscribir personas.'
          }
        />
      ) : null}

      {/* ── MODO TOMAR ASISTENCIA ─────────────────────────────────────────────────────────────── */}
      {tomando && porRevisar.length > 0 ? (
        <div className="border-t border-line">
          <div className="flex flex-wrap items-end gap-x-6 gap-y-3 px-5 py-4">
            <Field htmlFor="asist-fecha" label="Se dicto el" hint="El dia de la sesion: queda como fecha de cumplimiento.">
              <Input
                id="asist-fecha"
                type="date"
                className="w-[11rem]"
                value={heldOn}
                onChange={(e) => setHeldOn(e.target.value)}
              />
            </Field>
            <div className="flex items-center gap-2 pb-1">
              <Button variant="ghost" onClick={() => todos('PRESENT')}>
                Todos asistieron
              </Button>
              <Button variant="ghost" onClick={() => todos('ABSENT')}>
                Nadie asistio
              </Button>
            </div>
            <p className="pb-2 text-sm text-ink-500">
              <strong className="font-medium text-ink-900">{presentes}</strong> de {porRevisar.length} asistieron
            </p>
          </div>

          {pideCertificado ? (
            <div className="border-t border-line bg-paper px-5 py-4">
              <p className="flex items-start gap-2 text-sm text-ink-500">
                <ClipboardList size={15} className="mt-0.5 shrink-0" strokeWidth={2} />
                <span>
                  El certificado lo expide <strong className="font-medium text-ink-700">{quienLaDicto}</strong>, que
                  dicta esta jornada: no hay que escribirlo por persona, solo su{' '}
                  <strong className="font-medium text-ink-700">numero</strong>. Si todavia no ha llegado, dejalo en
                  blanco y añadelo despues.
                </span>
              </p>
              <div className="mt-3 flex flex-wrap items-end gap-3">
                <Field
                  htmlFor="asist-vence-lote"
                  label="El certificado vence el"
                  hint="Lo que dice el papel — puede ser dentro de anos, no el dia de la sesion. Esa fecha manda sobre la que calcularia el sistema."
                >
                  <Input
                    id="asist-vence-lote"
                    type="date"
                    className="w-[11rem]"
                    value={vencePorLote}
                    onChange={(e) => setVencePorLote(e.target.value)}
                  />
                </Field>
                <Button variant="ghost" onClick={repartirVencimiento} disabled={!vencePorLote}>
                  Ponerselo a todos
                </Button>
              </div>
            </div>
          ) : null}

          <div className="overflow-x-auto border-t border-line">
            <Table>
              <THead>
                <Tr>
                  <Th>Persona</Th>
                  <Th>Cargo y area</Th>
                  <Th>Asistencia</Th>
                  {hayJustificadas ? <Th>Motivo de la falta</Th> : null}
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
                      </Td>
                      <Td className="text-sm text-ink-700">
                        {fila.user.jobTitle.name}
                        <div className="text-xs text-ink-500">{fila.user.area.name}</div>
                      </Td>
                      <Td>
                        <Select
                          className="w-[10.5rem]"
                          aria-label={`Asistencia de ${fila.user.fullName}`}
                          value={estado}
                          onChange={(e) => setEstados({ ...estados, [fila.id]: e.target.value as AsistenciaEstado })}
                        >
                          <option value="PRESENT">Asistio</option>
                          <option value="ABSENT">No asistio</option>
                          <option value="JUSTIFIED">Falta justificada</option>
                        </Select>
                      </Td>
                      {hayJustificadas ? (
                        <Td>
                          {estado === 'JUSTIFIED' ? (
                            <Input
                              className="w-[15rem]"
                              placeholder="Incapacidad, vacaciones..."
                              aria-label={`Motivo de la falta de ${fila.user.fullName}`}
                              value={motivos[fila.id] ?? ''}
                              onChange={(e) => setMotivos({ ...motivos, [fila.id]: e.target.value })}
                            />
                          ) : null}
                        </Td>
                      ) : null}
                      {pideCertificado ? (
                        <Td>
                          {estado === 'PRESENT' ? (
                            <Input
                              className="w-[10rem]"
                              placeholder="Opcional"
                              aria-label={`Numero de certificado de ${fila.user.fullName}`}
                              value={papel(fila.id).number}
                              onChange={(e) =>
                                setPapeles({ ...papeles, [fila.id]: { ...papel(fila.id), number: e.target.value } })
                              }
                            />
                          ) : null}
                        </Td>
                      ) : null}
                      {pideCertificado ? (
                        <Td>
                          {estado === 'PRESENT' ? (
                            <Input
                              type="date"
                              className="w-[10.5rem]"
                              aria-label={`Vence el certificado de ${fila.user.fullName}`}
                              value={papel(fila.id).validUntil ?? ''}
                              onChange={(e) =>
                                setPapeles({ ...papeles, [fila.id]: { ...papel(fila.id), validUntil: e.target.value } })
                              }
                            />
                          ) : null}
                        </Td>
                      ) : null}
                    </Tr>
                  );
                })}
              </TBody>
            </Table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-4">
            <p className="text-sm text-ink-500">
              Quien no vino <strong className="font-medium text-ink-700">sigue debiendo</strong> la formacion, aunque la
              falta este justificada.
            </p>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setTomando(false)}>
                Cancelar
              </Button>
              <Button onClick={guardar} loading={busy} disabled={faltaMotivo}>
                {faltaMotivo ? 'Falta el motivo' : `Dar por cumplida a ${presentes}`}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {/* ── MODO MIRAR: todo lo que ensenaba "Inscritos", mas como consta ─────────────────────── */}
      {!tomando && roster.length > 0 ? (
        <div className="overflow-x-auto border-t border-line">
          <Table>
            <THead>
              <Tr>
                <Th>Persona</Th>
                <Th>Cargo</Th>
                <Th>Area</Th>
                <Th>Origen</Th>
                <Th>Como consta</Th>
                {pideCertificado ? <Th>Certificado</Th> : null}
              </Tr>
            </THead>
            <TBody>
              {roster.map((fila) => {
                const pill = comoConsta(fila);
                return (
                  <Tr key={fila.id}>
                    <Td>
                      <div className="font-medium text-ink-900">{fila.user.fullName}</div>
                      <div className="font-mono text-xs text-ink-500">{fila.user.documentNumber}</div>
                    </Td>
                    <Td className="text-ink-700">{fila.user.jobTitle.name}</Td>
                    <Td className="text-ink-500">{fila.user.area.name}</Td>
                    <Td className="text-ink-500">{fila.assignmentId ? 'Obligacion' : 'Inscripcion directa'}</Td>
                    <Td>
                      <StatusPill kind={pill.kind} label={pill.label} />
                      {fila.attendanceNote ? (
                        <div className="mt-0.5 text-xs text-ink-500">{fila.attendanceNote}</div>
                      ) : null}
                    </Td>
                    {pideCertificado ? (
                      <Td className="text-ink-700">
                        {fila.extCertNumber ? (
                          <>
                            <div>{fila.extCertNumber}</div>
                            <div className="text-xs text-ink-500">
                              {fila.extCertIssuer}
                              {fila.extCertValidUntil ? ` · vence ${fila.extCertValidUntil.slice(0, 10)}` : ''}
                            </div>
                          </>
                        ) : (
                          '—'
                        )}
                      </Td>
                    ) : null}
                  </Tr>
                );
              })}
            </TBody>
          </Table>
        </div>
      ) : null}
    </div>
  );
}

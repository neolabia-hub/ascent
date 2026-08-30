'use client';

import { useCallback, useEffect, useState } from 'react';
import { ClipboardCheck, Grid3x3, Plus, Search, Target, Users } from 'lucide-react';
import { ApiError } from '@/lib/api';
import { listCatalog, type CatalogRow } from '@/lib/admin-api';
import { listActivities, type ActivityListItem } from '@/lib/catalog-api';
import {
  createAssignmentRule,
  createAssignments,
  createAudience,
  EMPTY_RULE,
  getJobTitleMatrix,
  listAssignmentRules,
  listAssignments,
  listAudiences,
  previewAudience,
  toggleJobTitleMatrix,
  updateAssignmentRule,
  waiveAssignment,
  type AssignmentRow,
  type AssignmentRuleRow,
  type AssignmentStatus,
  type AudienceRow,
  type JobTitleMatrix,
  type RuleTrigger,
} from '@/lib/delivery-api';
import { describeDueOffset, formatDate } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Drawer } from '@/components/ui/drawer';
import { EmptyState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusPill, type StatusPillKind } from '@/components/ui/status-pill';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/components/ui/cn';

type Tab = 'requisitos' | 'matriz' | 'audiencias' | 'obligaciones';

const TABS: Array<{ key: Tab; label: string; icon: typeof Target }> = [
  { key: 'requisitos', label: 'Requisitos', icon: Target },
  { key: 'matriz', label: 'Matriz por cargo', icon: Grid3x3 },
  { key: 'audiencias', label: 'Audiencias', icon: Users },
  { key: 'obligaciones', label: 'Obligaciones', icon: ClipboardCheck },
];

const TRIGGER_LABEL: Record<RuleTrigger, string> = {
  ON_HIRE: 'Al ingresar a la empresa',
  ON_JOIN: 'Al entrar a la audiencia',
  SCHEDULED: 'Programado / recurrente',
};

const ASSIGNMENT_STATUS: Record<AssignmentStatus, { kind: StatusPillKind; label: string }> = {
  PENDING: { kind: 'warn', label: 'PENDIENTE' },
  IN_PROGRESS: { kind: 'info', label: 'EN CURSO' },
  COMPLETED: { kind: 'ok', label: 'CUMPLIDA' },
  OVERDUE: { kind: 'danger', label: 'VENCIDA' },
  WITHDRAWN_LEFT_AUDIENCE: { kind: 'neutral', label: 'RETIRADA' },
  WAIVED: { kind: 'neutral', label: 'EXIMIDA' },
};

export default function AsignacionesPage() {
  const { showToast } = useToast();
  const [tab, setTab] = useState<Tab>('requisitos');

  const [activities, setActivities] = useState<ActivityListItem[]>([]);
  const [jobTitles, setJobTitles] = useState<CatalogRow[]>([]);
  const [areas, setAreas] = useState<CatalogRow[]>([]);
  const [regionals, setRegionals] = useState<CatalogRow[]>([]);
  const [services, setServices] = useState<CatalogRow[]>([]);

  const [rules, setRules] = useState<AssignmentRuleRow[] | null>(null);
  const [audiences, setAudiences] = useState<AudienceRow[] | null>(null);
  const [matrix, setMatrix] = useState<JobTitleMatrix | null>(null);
  const [assignments, setAssignments] = useState<AssignmentRow[] | null>(null);
  const [assignmentQuery, setAssignmentQuery] = useState({ q: '', status: '' });

  const [busy, setBusy] = useState(false);
  const [ruleOpen, setRuleOpen] = useState(false);
  const [ruleForm, setRuleForm] = useState({ audienceId: '', targetId: '', trigger: 'ON_HIRE' as RuleTrigger, dueDays: '-1', everyMonths: '' });
  const [audienceOpen, setAudienceOpen] = useState(false);
  const [audienceForm, setAudienceForm] = useState({
    name: '',
    jobTitleIds: [] as string[],
    areaIds: [] as string[],
    regionalIds: [] as string[],
    serviceIds: [] as string[],
  });
  const [audiencePreview, setAudiencePreview] = useState<{ count: number; reachesEveryone: boolean } | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignForm, setAssignForm] = useState({ targetId: '', jobTitleId: '', areaId: '', dueAt: '' });

  useEffect(() => {
    void listActivities({ pageSize: 100 }).then((result) => setActivities(result.items));
    void listCatalog('job-titles').then((rows) => setJobTitles(rows.filter((row) => row.active)));
    void listCatalog('areas').then((rows) => setAreas(rows.filter((row) => row.active)));
    void listCatalog('regionals').then((rows) => setRegionals(rows.filter((row) => row.active)));
    void listCatalog('services').then((rows) => setServices(rows.filter((row) => row.active)));
  }, []);

  const loadTab = useCallback(async () => {
    try {
      if (tab === 'requisitos') setRules(await listAssignmentRules());
      if (tab === 'audiencias') setAudiences(await listAudiences());
      if (tab === 'matriz') setMatrix(await getJobTitleMatrix());
      if (tab === 'obligaciones') {
        const page = await listAssignments({ q: assignmentQuery.q || undefined, status: assignmentQuery.status || undefined });
        setAssignments(page.items);
      }
    } catch {
      showToast({ kind: 'danger', title: 'No se pudo cargar la informacion' });
    }
  }, [tab, assignmentQuery, showToast]);

  useEffect(() => {
    void loadTab();
  }, [loadTab]);

  // ── Requisitos ──
  const saveRule = async () => {
    setBusy(true);
    try {
      const result = await createAssignmentRule({
        audienceId: ruleForm.audienceId,
        targetId: ruleForm.targetId,
        trigger: ruleForm.trigger,
        dueDaysAfterTrigger: Number(ruleForm.dueDays || 0),
        recurrence:
          ruleForm.trigger === 'SCHEDULED' && ruleForm.everyMonths
            ? { everyMonths: Number(ruleForm.everyMonths), windowDays: 60 }
            : null,
      });
      showToast({
        kind: 'success',
        title: 'Requisito creado',
        description: `Nacieron ${result.generated} obligaciones para quienes ya pertenecen a la audiencia.`,
      });
      setRuleOpen(false);
      await loadTab();
    } catch (error) {
      showToast({
        kind: 'danger',
        title:
          error instanceof ApiError && error.code === 'RULE_ALREADY_EXISTS'
            ? 'Esa audiencia ya tiene este requisito'
            : 'No se pudo crear el requisito',
      });
    } finally {
      setBusy(false);
    }
  };

  const retireRule = async (rule: AssignmentRuleRow) => {
    setBusy(true);
    try {
      await updateAssignmentRule(rule.id, { active: false });
      showToast({ kind: 'success', title: 'Requisito retirado', description: 'Lo pendiente quedo retirado; lo cumplido no se toca.' });
      await loadTab();
    } catch {
      showToast({ kind: 'danger', title: 'No se pudo retirar' });
    } finally {
      setBusy(false);
    }
  };

  // ── Audiencias ──
  const runPreview = useCallback(async () => {
    try {
      setAudiencePreview(
        await previewAudience({
          ...EMPTY_RULE,
          jobTitleIds: audienceForm.jobTitleIds,
          areaIds: audienceForm.areaIds,
          regionalIds: audienceForm.regionalIds,
          serviceIds: audienceForm.serviceIds,
        }),
      );
    } catch {
      setAudiencePreview(null);
    }
  }, [audienceForm]);

  useEffect(() => {
    if (audienceOpen) void runPreview();
  }, [audienceOpen, runPreview]);

  const saveAudience = async () => {
    setBusy(true);
    try {
      await createAudience({
        name: audienceForm.name.trim(),
        rule: {
          ...EMPTY_RULE,
          jobTitleIds: audienceForm.jobTitleIds,
          areaIds: audienceForm.areaIds,
          regionalIds: audienceForm.regionalIds,
          serviceIds: audienceForm.serviceIds,
        },
      });
      showToast({ kind: 'success', title: 'Audiencia creada' });
      setAudienceOpen(false);
      setAudienceForm({ name: '', jobTitleIds: [], areaIds: [], regionalIds: [], serviceIds: [] });
      await loadTab();
    } catch {
      showToast({ kind: 'danger', title: 'No se pudo crear la audiencia' });
    } finally {
      setBusy(false);
    }
  };

  // ── Matriz ──
  const toggleCell = async (jobTitleId: string, activityId: string, enabled: boolean) => {
    setBusy(true);
    try {
      await toggleJobTitleMatrix({ jobTitleId, activityId, enabled, dueDaysAfterTrigger: 0 });
      await loadTab();
    } catch {
      showToast({ kind: 'danger', title: 'No se pudo cambiar la casilla' });
    } finally {
      setBusy(false);
    }
  };

  // ── Asignacion manual ──
  const assignManually = async () => {
    setBusy(true);
    try {
      const result = await createAssignments({
        targetId: assignForm.targetId,
        jobTitleIds: assignForm.jobTitleId ? [assignForm.jobTitleId] : [],
        areaIds: assignForm.areaId ? [assignForm.areaId] : [],
        dueAt: assignForm.dueAt || null,
      });
      showToast({
        kind: 'success',
        title: `${result.created} obligaciones creadas`,
        description: result.skipped > 0 ? `${result.skipped} personas ya la tenian pendiente.` : undefined,
      });
      setAssignOpen(false);
      setTab('obligaciones');
      await loadTab();
    } catch {
      showToast({ kind: 'danger', title: 'No se pudo asignar' });
    } finally {
      setBusy(false);
    }
  };

  const waive = async (assignment: AssignmentRow) => {
    const reason = window.prompt('Motivo para eximir a esta persona (queda registrado):');
    if (!reason || reason.trim().length < 10) {
      showToast({ kind: 'warning', title: 'El motivo debe tener al menos 10 caracteres' });
      return;
    }
    try {
      await waiveAssignment(assignment.id, reason.trim());
      showToast({ kind: 'success', title: 'Obligacion eximida' });
      await loadTab();
    } catch {
      showToast({ kind: 'danger', title: 'No se pudo eximir' });
    }
  };

  const cellMap = new Set((matrix?.cells ?? []).map((cell) => `${cell.jobTitleId}:${cell.activityId}`));

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-[28px] font-semibold text-ink-900">Asignaciones</h1>
          <p className="mt-1 text-sm text-ink-500">
            A quienes aplica cada formacion, que se les exige y desde cuando. Las obligaciones nacen solas al entrar o cambiar de cargo.
          </p>
        </div>
        <div className="flex gap-2">
          {tab === 'requisitos' ? (
            <Button onClick={() => setRuleOpen(true)}>
              <Plus size={16} />
              Nuevo requisito
            </Button>
          ) : null}
          {tab === 'audiencias' ? (
            <Button onClick={() => setAudienceOpen(true)}>
              <Plus size={16} />
              Nueva audiencia
            </Button>
          ) : null}
          {tab === 'obligaciones' ? (
            <Button onClick={() => setAssignOpen(true)}>
              <Plus size={16} />
              Asignar formacion
            </Button>
          ) : null}
        </div>
      </div>

      <div className="mb-4 flex gap-1 border-b border-line">
        {TABS.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => setTab(item.key)}
              className={cn(
                'focus-ring -mb-px flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm transition-colors duration-150',
                tab === item.key ? 'border-ink-900 font-medium text-ink-900' : 'border-transparent text-ink-500 hover:text-ink-900',
              )}
            >
              <Icon size={15} strokeWidth={1.75} />
              {item.label}
            </button>
          );
        })}
      </div>

      {tab === 'requisitos' ? (
        !rules ? (
          <Skeleton className="h-80 w-full" />
        ) : rules.length === 0 ? (
          <div className="card">
            <EmptyState
              icon={Target}
              title="Sin requisitos definidos"
              description="Un requisito une una audiencia con una formacion: quien entre a esa audiencia queda obligado automaticamente."
              action={
                <Button onClick={() => setRuleOpen(true)}>
                  <Plus size={16} />
                  Nuevo requisito
                </Button>
              }
            />
          </div>
        ) : (
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <THead>
                  <Tr>
                    <Th>Formacion exigida</Th>
                    <Th>Audiencia</Th>
                    <Th>Disparador</Th>
                    <Th>Vence</Th>
                    <Th>Repite</Th>
                    <Th className="text-right">Obligaciones</Th>
                    <Th>Estado</Th>
                    <Th className="w-24 text-right">Accion</Th>
                  </Tr>
                </THead>
                <TBody>
                  {rules.map((rule) => (
                    <Tr key={rule.id}>
                      <Td className="font-medium text-ink-900">{rule.targetName ?? 'Actividad'}</Td>
                      <Td className="text-ink-700">{rule.audience.name}</Td>
                      <Td className="text-ink-500">{TRIGGER_LABEL[rule.trigger]}</Td>
                      <Td className="text-ink-500">{describeDueOffset(rule.dueDaysAfterTrigger)}</Td>
                      <Td className="text-ink-500">
                        {rule.recurrence?.everyMonths
                          ? `Cada ${rule.recurrence.everyMonths} meses`
                          : rule.recurrence?.fixedDate
                            ? `Cada ano el ${rule.recurrence.fixedDate}`
                            : 'Una vez'}
                      </Td>
                      <Td className="text-right tabular-nums text-ink-700">{rule.assignmentCount}</Td>
                      <Td>
                        <StatusPill kind={rule.active ? 'ok' : 'neutral'} label={rule.active ? 'VIGENTE' : 'RETIRADO'} />
                      </Td>
                      <Td className="text-right">
                        {rule.active ? (
                          <Button variant="ghost" size="sm" onClick={() => retireRule(rule)} disabled={busy}>
                            Retirar
                          </Button>
                        ) : null}
                      </Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            </div>
          </div>
        )
      ) : null}

      {tab === 'matriz' ? (
        !matrix ? (
          <Skeleton className="h-80 w-full" />
        ) : matrix.jobTitles.length === 0 || matrix.activities.length === 0 ? (
          <div className="card">
            <EmptyState
              icon={Grid3x3}
              title="Faltan cargos o actividades"
              description="La matriz cruza los cargos del catalogo con las actividades formativas. Crea al menos uno de cada uno."
            />
          </div>
        ) : (
          <div className="card overflow-hidden">
            <div className="px-5 py-4">
              <h2 className="font-display text-base font-semibold text-ink-900">Que debe hacer cada cargo</h2>
              <p className="mt-1 text-sm text-ink-500">
                Marcar una casilla crea el requisito de ingreso para ese cargo. Al contratar a alguien con ese cargo, la formacion
                le nace sola.
                {matrix.broaderRules > 0
                  ? ` Ademas hay ${matrix.broaderRules} requisitos definidos sobre audiencias mas amplias, que no se administran aqui.`
                  : ''}
              </p>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <THead>
                  <Tr>
                    <Th className="sticky left-0 bg-paper">Cargo</Th>
                    {matrix.activities.map((activity) => (
                      <Th key={activity.id} className="min-w-[7rem] text-center">
                        {activity.name}
                      </Th>
                    ))}
                  </Tr>
                </THead>
                <TBody>
                  {matrix.jobTitles.map((jobTitle) => (
                    <Tr key={jobTitle.id}>
                      <Td className="sticky left-0 bg-surface">
                        <div className="font-medium text-ink-900">{jobTitle.name}</div>
                        <div className="text-xs text-ink-500">{jobTitle.jobTitleType.name}</div>
                      </Td>
                      {matrix.activities.map((activity) => {
                        const checked = cellMap.has(`${jobTitle.id}:${activity.id}`);
                        return (
                          <Td key={activity.id} className="text-center">
                            <input
                              type="checkbox"
                              className="focus-ring h-4 w-4 rounded border-line-strong"
                              checked={checked}
                              disabled={busy}
                              aria-label={`${jobTitle.name} debe hacer ${activity.name}`}
                              onChange={(event) => void toggleCell(jobTitle.id, activity.id, event.target.checked)}
                            />
                          </Td>
                        );
                      })}
                    </Tr>
                  ))}
                </TBody>
              </Table>
            </div>
          </div>
        )
      ) : null}

      {tab === 'audiencias' ? (
        !audiences ? (
          <Skeleton className="h-80 w-full" />
        ) : audiences.length === 0 ? (
          <div className="card">
            <EmptyState
              icon={Users}
              title="Sin audiencias"
              description="Una audiencia agrupa personas por cargo, area o regional, y se recalcula sola cuando alguien cambia."
              action={
                <Button onClick={() => setAudienceOpen(true)}>
                  <Plus size={16} />
                  Nueva audiencia
                </Button>
              }
            />
          </div>
        ) : (
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <THead>
                  <Tr>
                    <Th>Audiencia</Th>
                    <Th className="text-right">Personas</Th>
                    <Th className="text-right">Requisitos</Th>
                    <Th>Tipo</Th>
                    <Th>Estado</Th>
                  </Tr>
                </THead>
                <TBody>
                  {audiences.map((audience) => (
                    <Tr key={audience.id}>
                      <Td className="font-medium text-ink-900">{audience.name}</Td>
                      <Td className="text-right tabular-nums text-ink-700">{audience.memberCount}</Td>
                      <Td className="text-right tabular-nums text-ink-700">{audience.ruleCount}</Td>
                      <Td className="text-ink-500">{audience.isDynamic ? 'Dinamica' : 'Fija'}</Td>
                      <Td>
                        <StatusPill kind={audience.active ? 'ok' : 'neutral'} label={audience.active ? 'ACTIVA' : 'INACTIVA'} />
                      </Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            </div>
          </div>
        )
      ) : null}

      {tab === 'obligaciones' ? (
        <>
          <div className="mb-4 flex flex-wrap gap-2">
            <div className="relative">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-300" />
              <Input
                value={assignmentQuery.q}
                onChange={(event) => setAssignmentQuery({ ...assignmentQuery, q: event.target.value })}
                placeholder="Buscar por nombre o documento"
                className="w-72 pl-9"
              />
            </div>
            <Select
              value={assignmentQuery.status}
              onChange={(event) => setAssignmentQuery({ ...assignmentQuery, status: event.target.value })}
              className="w-52"
            >
              <option value="">Todos los estados</option>
              <option value="PENDING">Pendientes</option>
              <option value="OVERDUE">Vencidas</option>
              <option value="COMPLETED">Cumplidas</option>
              <option value="WITHDRAWN_LEFT_AUDIENCE">Retiradas</option>
              <option value="WAIVED">Eximidas</option>
            </Select>
          </div>
          {!assignments ? (
            <Skeleton className="h-80 w-full" />
          ) : assignments.length === 0 ? (
            <div className="card">
              <EmptyState
                icon={ClipboardCheck}
                title="Sin obligaciones"
                description="Cuando definas requisitos o asignes una formacion a un cargo o area, apareceran aqui."
              />
            </div>
          ) : (
            <div className="card overflow-hidden">
              <div className="overflow-x-auto">
                <Table>
                  <THead>
                    <Tr>
                      <Th>Persona</Th>
                      <Th>Formacion</Th>
                      <Th>Origen</Th>
                      <Th>Ronda</Th>
                      <Th>Vence</Th>
                      <Th>Estado</Th>
                      <Th className="w-24 text-right">Accion</Th>
                    </Tr>
                  </THead>
                  <TBody>
                    {assignments.map((assignment) => (
                      <Tr key={assignment.id}>
                        <Td>
                          <div className="font-medium text-ink-900">{assignment.user.fullName}</div>
                          <div className="text-xs text-ink-500">
                            {assignment.user.jobTitle.name} · {assignment.user.area.name}
                          </div>
                        </Td>
                        <Td className="text-ink-700">{assignment.targetName ?? 'Actividad'}</Td>
                        <Td className="text-ink-500">
                          {assignment.source === 'RULE'
                            ? 'Requisito'
                            : assignment.source === 'PLAN'
                              ? 'Plan anual'
                              : 'Manual'}
                        </Td>
                        <Td className="tabular-nums text-ink-500">{assignment.cycleNumber}</Td>
                        <Td className="text-ink-700">{formatDate(assignment.dueAt)}</Td>
                        <Td>
                          <StatusPill
                            kind={ASSIGNMENT_STATUS[assignment.status].kind}
                            label={ASSIGNMENT_STATUS[assignment.status].label}
                          />
                        </Td>
                        <Td className="text-right">
                          {assignment.status === 'PENDING' || assignment.status === 'OVERDUE' ? (
                            <Button variant="ghost" size="sm" onClick={() => void waive(assignment)}>
                              Eximir
                            </Button>
                          ) : null}
                        </Td>
                      </Tr>
                    ))}
                  </TBody>
                </Table>
              </div>
            </div>
          )}
        </>
      ) : null}

      <Drawer
        open={ruleOpen}
        onOpenChange={setRuleOpen}
        title="Nuevo requisito"
        description="Une una audiencia con una formacion. Quien pertenezca a la audiencia queda obligado."
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setRuleOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={saveRule} loading={busy} disabled={!ruleForm.audienceId || !ruleForm.targetId}>
              Crear requisito
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Field htmlFor="r-audience" label="Audiencia" required>
            <Select
              id="r-audience"
              value={ruleForm.audienceId}
              onChange={(event) => setRuleForm({ ...ruleForm, audienceId: event.target.value })}
              onFocus={() => void listAudiences().then(setAudiences)}
            >
              <option value="">Seleccionar...</option>
              {(audiences ?? []).map((audience) => (
                <option key={audience.id} value={audience.id}>
                  {audience.name} ({audience.memberCount} personas)
                </option>
              ))}
            </Select>
          </Field>
          <Field htmlFor="r-target" label="Formacion exigida" required>
            <Select id="r-target" value={ruleForm.targetId} onChange={(event) => setRuleForm({ ...ruleForm, targetId: event.target.value })}>
              <option value="">Seleccionar...</option>
              {activities.map((activity) => (
                <option key={activity.id} value={activity.id}>
                  {activity.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field htmlFor="r-trigger" label="Cuando se exige" required>
            <Select id="r-trigger" value={ruleForm.trigger} onChange={(event) => setRuleForm({ ...ruleForm, trigger: event.target.value as RuleTrigger })}>
              <option value="ON_HIRE">Al ingresar a la empresa</option>
              <option value="ON_JOIN">Al entrar a la audiencia</option>
              <option value="SCHEDULED">Programado / recurrente</option>
            </Select>
          </Field>
          <Field
            htmlFor="r-due"
            label="Dias respecto a ese momento"
            hint="Negativo = antes. La induccion de ingreso debe vencer ANTES del primer dia de labores."
          >
            <Input id="r-due" type="number" value={ruleForm.dueDays} onChange={(event) => setRuleForm({ ...ruleForm, dueDays: event.target.value })} />
          </Field>
          {ruleForm.trigger === 'SCHEDULED' ? (
            <Field htmlFor="r-every" label="Se repite cada (meses)" required hint="Reinduccion anual: 12.">
              <Input
                id="r-every"
                type="number"
                min={1}
                value={ruleForm.everyMonths}
                onChange={(event) => setRuleForm({ ...ruleForm, everyMonths: event.target.value })}
              />
            </Field>
          ) : null}
        </div>
      </Drawer>

      <Drawer
        open={audienceOpen}
        onOpenChange={setAudienceOpen}
        title="Nueva audiencia"
        description="Se recalcula sola: quien cambie de cargo o area entra o sale, y su historia queda registrada."
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setAudienceOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={saveAudience} loading={busy} disabled={audienceForm.name.trim().length < 3}>
              Crear audiencia
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Field htmlFor="a-name" label="Nombre" required>
            <Input id="a-name" value={audienceForm.name} onChange={(event) => setAudienceForm({ ...audienceForm, name: event.target.value })} maxLength={160} />
          </Field>
          <Field htmlFor="a-job" label="Cargo" hint="Deja todo en blanco para alcanzar a toda la empresa.">
            <Select
              id="a-job"
              value={audienceForm.jobTitleIds[0] ?? ''}
              onChange={(event) => {
                const next = { ...audienceForm, jobTitleIds: event.target.value ? [event.target.value] : [] };
                setAudienceForm(next);
              }}
            >
              <option value="">Cualquiera</option>
              {jobTitles.map((jobTitle) => (
                <option key={jobTitle.id} value={jobTitle.id}>
                  {jobTitle.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field htmlFor="a-area" label="Area">
            <Select
              id="a-area"
              value={audienceForm.areaIds[0] ?? ''}
              onChange={(event) => setAudienceForm({ ...audienceForm, areaIds: event.target.value ? [event.target.value] : [] })}
            >
              <option value="">Cualquiera</option>
              {areas.map((area) => (
                <option key={area.id} value={area.id}>
                  {area.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field htmlFor="a-regional" label="Regional">
            <Select
              id="a-regional"
              value={audienceForm.regionalIds[0] ?? ''}
              onChange={(event) => setAudienceForm({ ...audienceForm, regionalIds: event.target.value ? [event.target.value] : [] })}
            >
              <option value="">Cualquiera</option>
              {regionals.map((regional) => (
                <option key={regional.id} value={regional.id}>
                  {regional.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field htmlFor="a-service" label="Servicio" hint="Solo alcanza a quien lo tenga puesto en su ficha.">
            <Select
              id="a-service"
              value={audienceForm.serviceIds[0] ?? ''}
              onChange={(event) =>
                setAudienceForm({ ...audienceForm, serviceIds: event.target.value ? [event.target.value] : [] })
              }
            >
              <option value="">Cualquiera</option>
              {services.map((service) => (
                <option key={service.id} value={service.id}>
                  {service.name}
                </option>
              ))}
            </Select>
          </Field>
          <Button variant="ghost" size="sm" onClick={() => void runPreview()}>
            Ver a cuantas personas alcanza
          </Button>
          {audiencePreview ? (
            <p className={cn('rounded-md px-3 py-2 text-sm', audiencePreview.reachesEveryone ? 'bg-warn-soft text-warn' : 'bg-info-soft text-info')}>
              Alcanza a {audiencePreview.count} personas.
              {audiencePreview.reachesEveryone ? ' Sin filtros, la audiencia es TODA la empresa.' : ''}
            </p>
          ) : null}
        </div>
      </Drawer>

      <Drawer
        open={assignOpen}
        onOpenChange={setAssignOpen}
        title="Asignar formacion"
        description="Asignacion puntual, fuera de los requisitos. No pisa lo que ya esta pendiente."
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setAssignOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={assignManually} loading={busy} disabled={!assignForm.targetId || (!assignForm.jobTitleId && !assignForm.areaId)}>
              Asignar
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Field htmlFor="m-target" label="Formacion" required>
            <Select id="m-target" value={assignForm.targetId} onChange={(event) => setAssignForm({ ...assignForm, targetId: event.target.value })}>
              <option value="">Seleccionar...</option>
              {activities.map((activity) => (
                <option key={activity.id} value={activity.id}>
                  {activity.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field htmlFor="m-job" label="A todo el cargo">
            <Select id="m-job" value={assignForm.jobTitleId} onChange={(event) => setAssignForm({ ...assignForm, jobTitleId: event.target.value })}>
              <option value="">Ninguno</option>
              {jobTitles.map((jobTitle) => (
                <option key={jobTitle.id} value={jobTitle.id}>
                  {jobTitle.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field htmlFor="m-area" label="A toda el area">
            <Select id="m-area" value={assignForm.areaId} onChange={(event) => setAssignForm({ ...assignForm, areaId: event.target.value })}>
              <option value="">Ninguna</option>
              {areas.map((area) => (
                <option key={area.id} value={area.id}>
                  {area.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field htmlFor="m-due" label="Fecha limite">
            <Input id="m-due" type="date" value={assignForm.dueAt} onChange={(event) => setAssignForm({ ...assignForm, dueAt: event.target.value })} />
          </Field>
        </div>
      </Drawer>
    </div>
  );
}

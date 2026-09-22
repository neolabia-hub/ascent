'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  BadgeCheck,
  Copy,
  Download,
  MoreVertical,
  KeyRound,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  Upload,
  UserCheck,
  UserMinus,
  UserRound,
} from 'lucide-react';
import { ApiError, motivoDelError } from '@/lib/api';
import {
  createUser,
  downloadImportTemplate,
  getUser,
  importUsers,
  listRoles,
  setAnalystScopes,
  listCatalog,
  listUsers,
  nombreConRama,
  resetUserPassword,
  updateUser,
  type CatalogRow,
  type CreateUserBody,
  type ImportResult,
  type UserRow,
  type UsersPage,
} from '@/lib/admin-api';
import { UserPermissionsDrawer } from '@/components/modules/admin/user-permissions-drawer';
import { PapelesDePersona } from '@/components/modules/admin/papeles-de-persona';
import { MultiSelect } from '@/components/ui/multi-select';
import { Button } from '@/components/ui/button';
import { cn } from '@/components/ui/cn';
import { Drawer } from '@/components/ui/drawer';
import { EmptyState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Popover } from '@/components/ui/popover';
import { StatusPill } from '@/components/ui/status-pill';
import { Table, TablePagination, TBody, Td, Th, THead, Tr } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';

const PAGE_SIZE = 20;

const EMPTY_FORM: CreateUserBody = {
  documentNumber: '',
  fullName: '',
  email: '',
  emailKind: 'PERSONAL',
  jobTitleId: '',
  areaId: '',
  roleCode: 'USUARIO',
  employmentType: 'DIRECTO',
};

function apiErrorText(error: unknown): string {
  if (error instanceof ApiError) {
    const map: Record<string, string> = {
      DUPLICATE_DOCUMENT: 'Ya existe una persona con ese documento.',
      DUPLICATE_EMAIL: 'Ya existe una persona con ese correo.',
      VALIDATION_ERROR: 'Revisa los campos marcados.',
    };
    return map[error.code] ?? error.message;
  }
  return 'Ocurrio un error. Intenta de nuevo.';
}

export default function UsuariosPage() {
  const { showToast } = useToast();
  const router = useRouter();

  // Filtros y datos
  const [q, setQ] = useState('');
  const [areaFilter, setAreaFilter] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<UsersPage | null>(null);
  const [areas, setAreas] = useState<CatalogRow[]>([]);
  const [jobTitles, setJobTitles] = useState<CatalogRow[]>([]);
  const [regionals, setRegionals] = useState<CatalogRow[]>([]);
  const [services, setServices] = useState<CatalogRow[]>([]);
  const [processes, setProcesses] = useState<CatalogRow[]>([]);
  /** Permisos que concede cada rol: con ellos se decide si "Gestiona" tiene sentido. */
  const [rolePermissions, setRolePermissions] = useState<Record<string, string[]>>({});

  /**
   * Alcance de la persona que se esta creando o editando. Ver el campo "Gestiona".
   *
   * DOS OPCIONES Y DOS LISTAS, no cuatro casos. La version anterior tenia una opcion por forma de
   * alcance ("su area", "estos procesos") y se quedaba corta en cuanto la realidad no encajaba:
   * alcance sobre OTRA area, sobre dos, o sobre un area Y un proceso a la vez —todo eso lo permite
   * el modelo y lo permite el cajon de Permisos—. Lo que no cabia aparecia como "a medida", que no
   * se podia editar aqui y encima se leia distinto segun el caso: confuso, y por debajo se estaba
   * reescribiendo el alcance al guardar cualquier otra cosa de la ficha.
   *
   * Ahora se marca lo mismo que en Permisos —areas y procesos, con sus dos listas— asi que este
   * cajon representa CUALQUIER alcance y no hay estado que no sepa mostrar.
   */
  const [scopeKind, setScopeKind] = useState<'all' | 'scoped'>('all');
  const [scopeProcessIds, setScopeProcessIds] = useState<string[]>([]);
  const [scopeAreaIds, setScopeAreaIds] = useState<string[]>([]);

  // Drawer crear/editar
  const [drawerOpen, setDrawerOpen] = useState(false);
  /*
    EL EXPEDIENTE DE CONSTANCIAS, desde la ficha de la persona.

    Aqui y no en una pantalla aparte porque la peticion siempre llega con un nombre delante
    —"mandame el certificado de alturas de Juan"— y nunca con una formacion. Buscar a Juan es el
    primer gesto, asi que la descarga tiene que estar donde se acaba de encontrar a Juan.
  */
  /*
    Y LOS PAPELES DE UN TERCERO, en la misma pantalla y por el mismo motivo que las constancias: la
    peticion llega con un NOMBRE delante —"acaba de llegar el certificado de alturas de Juan"— y
    nunca con la jornada a la que fue. Ver `PapelesDePersona`.
  */
  const [papelesDe, setPapelesDe] = useState<UserRow | null>(null);
  const [editing, setEditing] = useState<UserRow | null>(null);
  /** Persona cuyas excepciones de permiso se estan revisando. */
  const [permissionsFor, setPermissionsFor] = useState<UserRow | null>(null);
  const [form, setForm] = useState<CreateUserBody>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Credencial generada (se muestra UNA vez)
  const [credential, setCredential] = useState<{ name: string; document: string; password: string } | null>(null);

  // Importacion
  const [importOpen, setImportOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  /** El archivo ya simulado, esperando el «Aplicar». `null` = no hay nada pendiente de confirmar. */
  const [pendiente, setPendiente] = useState<File | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await listUsers({ q: q || undefined, areaId: areaFilter || undefined, page, pageSize: PAGE_SIZE });
      setData(result);
    } catch (error) {
      showToast({ kind: 'danger', title: 'No se pudo cargar el listado de personas', description: motivoDelError(error) });
    }
  }, [q, areaFilter, page, showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void listCatalog('areas').then((r) => setAreas(r.filter((a) => a.active)));
    void listCatalog('job-titles').then((r) => setJobTitles(r.filter((a) => a.active)));
    void listCatalog('regionals').then((r) => setRegionals(r.filter((a) => a.active)));
    void listCatalog('processes').then((r) => setProcesses(r.filter((a) => a.active)));
    void listCatalog('services').then((r) => setServices(r.filter((a) => a.active)));
    void listRoles()
      .then((rows) => setRolePermissions(Object.fromEntries(rows.map((row) => [row.code, row.permissionCodes]))))
      .catch(() => undefined);
  }, []);

  /**
   * ¿El rol elegido sirve para gestionar algo? Se mira lo que CONCEDE, nunca como se llama.
   * Para quien solo tiene su propia formacion, "Gestiona" no significa nada y no se muestra.
   */
  const MANAGING = ['catalog:manage_draft', 'offerings:manage', 'plans:manage', 'assignments:manage'];
  const roleManages = (rolePermissions[form.roleCode ?? ''] ?? []).some((code: string) => MANAGING.includes(code));

  /**
   * QUE VIENE MARCADO por defecto. Las tres opciones se ofrecen SIEMPRE —cualquier rol puede
   * legitimamente tener cualquier alcance, y un cliente con un solo analista para toda la empresa
   * es tan valido como uno con seis— pero lo que viene marcado sin tocar nada si cambia:
   *
   *   - un rol que administra la plataforma (`users:manage`) nace sin restriccion,
   *   - cualquier otro rol que gestione nace acotado a su area.
   *
   * Otra vez por permiso y no por nombre: "Administrador" en un cliente puede llamarse "Lider de
   * formacion" en el siguiente.
   */
  const defaultScopeFor = (roleCode: string | undefined): 'all' | 'scoped' =>
    (rolePermissions[roleCode ?? ''] ?? []).includes('users:manage') ? 'all' : 'scoped';

  /**
   * Pasar a "solo lo que le marques" SUGIERE su area, marcandola en la lista.
   *
   * Es el caso de nueve de cada diez y ahorra dos clics, pero se ve marcada y se puede quitar: una
   * sugerencia visible no es lo mismo que una decision tomada por detras —que es lo que hacia la
   * version anterior, escribiendo el area de la persona sin que apareciera en ningun sitio—.
   *
   * Vive en una funcion porque hay dos caminos hasta aqui —elegir el rol y marcar la opcion— y en
   * la primera version solo uno de los dos sugeria nada.
   */
  const acotar = () => {
    if (scopeAreaIds.length === 0 && scopeProcessIds.length === 0 && form.areaId) {
      setScopeAreaIds([form.areaId]);
    }
    setScopeKind('scoped');
  };

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setScopeKind('all');
    setScopeProcessIds([]);
    setScopeAreaIds([]);
    setFormError(null);
    setDrawerOpen(true);
  };

  const openEdit = (user: UserRow) => {
    setEditing(user);
    setForm({
      documentNumber: user.documentNumber,
      fullName: user.fullName,
      phone: user.phone,
      email: user.email,
      emailKind: user.emailKind,
      jobTitleId: user.jobTitle.id,
      areaId: user.area.id,
      regionalId: user.regional?.id ?? null,
      serviceId: user.service?.id ?? null,
      roleCode: user.role.code as CreateUserBody['roleCode'],
      hiredAt: user.hiredAt ? user.hiredAt.slice(0, 10) : null,
      birthDate: user.birthDate ? user.birthDate.slice(0, 10) : null,
      employmentType: user.employmentType,
    });
    setFormError(null);
    setDrawerOpen(true);

    // El alcance vive en su propia tabla, asi que se pide aparte para poder mostrarlo tal como esta.
    void getUser(user.id)
      .then((detail) => {
        const areaIds = detail.analystScopes
          .map((row) => row.area?.id)
          .filter((id): id is string => Boolean(id));
        const processIds = detail.analystScopes
          .map((row) => row.process?.id)
          .filter((id): id is string => Boolean(id));
        // Se muestra lo que hay, sin interpretarlo: tener filas es lo que restringe, y da igual
        // si son de area, de proceso o de las dos cosas.
        setScopeAreaIds(areaIds);
        setScopeProcessIds(processIds);
        setScopeKind(areaIds.length > 0 || processIds.length > 0 ? 'scoped' : 'all');
      })
      .catch(() => {
        setScopeKind('all');
        setScopeProcessIds([]);
        setScopeAreaIds([]);
      });
  };

  const save = async () => {
    setSaving(true);
    setFormError(null);
    try {
      let userId: string;
      if (editing) {
        const { documentNumber: _doc, ...rest } = form;
        await updateUser(editing.id, rest);
        userId = editing.id;
        showToast({ kind: 'success', title: 'Persona actualizada' });
      } else {
        const result = await createUser(form);
        userId = result.user.id;
        if (result.generatedPassword) {
          setCredential({ name: form.fullName, document: form.documentNumber, password: result.generatedPassword });
        }
        showToast({ kind: 'success', title: 'Persona creada' });
      }
      // El alcance va DESPUES de crear a la persona porque necesita su id, y solo si el rol lo usa:
      // mandarlo para un aprendiz escribiria filas que ninguna consulta va a mirar.
      if (roleManages) {
        await setAnalystScopes(userId, {
          areaIds: scopeKind === 'scoped' ? scopeAreaIds : [],
          processIds: scopeKind === 'scoped' ? scopeProcessIds : [],
        });
      }
      setDrawerOpen(false);
      if (editing) {
        await load();
      } else {
        // VER LO QUE ACABAS DE HACER. El listado es alfabetico y paginado de 20: con 800
        // personas, la recien creada cae en la pagina 3 y el alta parece no haber pasado. Se
        // filtra por su documento, que es unico, asi que la pantalla queda mostrando exactamente
        // a quien se acaba de crear. (Mismo sintoma que el orden de las convocatorias: "no
        // aparece" con la causa a dos capas de distancia.)
        setQ(form.documentNumber);
        setPage(1);
      }
    } catch (error) {
      setFormError(apiErrorText(error));
    } finally {
      setSaving(false);
    }
  };

  /*
    RESTABLECER PIDE CONFIRMACION (Decision #95).

    No es un boton mas de la fila: invalida la contrasena que la persona esta usando AHORA y la
    sustituye por una aleatoria que solo se ve una vez. Pulsarlo por error deja a alguien fuera
    hasta que le entreguen la nueva — y eso, en un turno de bodega, es medio dia sin poder hacer
    su formacion.
  */
  const [aRestablecer, setARestablecer] = useState<UserRow | null>(null);

  const resetPassword = async (user: UserRow) => {
    setARestablecer(null);
    try {
      const { generatedPassword } = await resetUserPassword(user.id);
      setCredential({ name: user.fullName, document: user.documentNumber, password: generatedPassword });
    } catch (error) {
      showToast({ kind: 'danger', title: apiErrorText(error) });
    }
  };

  const toggleActive = async (user: UserRow) => {
    try {
      await updateUser(user.id, { active: !user.active });
      showToast({ kind: 'success', title: user.active ? `Cuenta de ${user.fullName} desactivada` : `Cuenta de ${user.fullName} activada` });
      await load();
    } catch (error) {
      showToast({ kind: 'danger', title: apiErrorText(error) });
    }
  };

  /*
    SUBIR NO APLICA: PRIMERO SE VE QUE PASARIA (`PENDIENTES` 5.4, 2026-09-21).

    Desde que una recarga ACTUALIZA a quien ya esta, el archivo equivocado puede pisar correcciones
    hechas a mano. Lo cazo el cliente preguntando justo por ese cruce, y no hay regla que lo resuelva
    —los dos datos los escribio una persona de la empresa—, asi que la defensa es enseñar la lista
    antes: «a 12 personas les cambia el area, a esta le reemplaza el correo». Se aplica en un segundo
    clic, con lo que va a pasar delante.
  */
  const onImportFile = async (file: File) => {
    setImporting(true);
    setImportResult(null);
    setPendiente(null);
    try {
      const previa = await importUsers(file, true);
      setImportResult(previa);
      // Solo se guarda el archivo si hay algo que aplicar: con todo en rojo no hay segundo paso.
      if (previa.ok > 0) setPendiente(file);
      showToast({
        kind: previa.failed === 0 ? 'info' : 'warning',
        title: `Vista previa: ${previa.creadas} se crearían, ${previa.actualizadas} cambiarían, ${previa.failed} con error`,
        description: previa.ok > 0 ? 'Revisa la lista y pulsa «Aplicar» para guardarlo.' : undefined,
      });
    } catch (error) {
      showToast({ kind: 'danger', title: error instanceof Error ? error.message : 'Error al leer el archivo' });
    } finally {
      setImporting(false);
    }
  };

  /** El segundo clic: el mismo archivo, ahora sí escribiendo. */
  const aplicarImport = async () => {
    if (!pendiente) return;
    setImporting(true);
    try {
      const result = await importUsers(pendiente, false);
      setImportResult(result);
      setPendiente(null);
      showToast({
        kind: result.failed === 0 ? 'success' : 'warning',
        title: `Listo: ${result.creadas} creadas, ${result.actualizadas} actualizadas, ${result.failed} con error`,
      });
      await load();
    } catch (error) {
      showToast({ kind: 'danger', title: error instanceof Error ? error.message : 'Error al importar' });
    } finally {
      setImporting(false);
    }
  };

  const copyImportPasswords = async () => {
    if (!importResult) return;
    const lines = importResult.rows
      .filter((r) => r.status === 'OK' && r.generatedPassword)
      .map((r) => `${r.documento}\t${r.generatedPassword}`);
    await navigator.clipboard.writeText(`documento\tcontrasena\n${lines.join('\n')}`);
    showToast({ kind: 'success', title: 'Contrasenas copiadas al portapapeles', description: 'Entregalas de forma segura. No se pueden volver a consultar.' });
  };

  const formValid = useMemo(
    () =>
      form.fullName.trim().length >= 3 &&
      /*
        EL CORREO YA NO ES OBLIGATORIO (2026-09-21): hay gente que no tiene, y exigirlo empujaba a
        inventar direcciones. En blanco se guarda como «sin correo» y esa persona entra con su
        cedula. Lo que si se sigue exigiendo es que, SI se escribe algo, tenga forma de correo — un
        campo a medio escribir es un error de captura, no una decision.
      */
      ((form.email ?? '').trim() === '' || (form.email ?? '').includes('@')) &&
      form.jobTitleId !== '' &&
      form.areaId !== '' &&
      (editing !== null || form.documentNumber.trim().length >= 5) &&
      // "Acotado" sin nada marcado escribiria CERO filas, y sin filas se ve todo: seria dar
      // acceso completo justo cuando se acaba de pedir lo contrario. No se puede guardar asi.
      !(roleManages && scopeKind === 'scoped' && scopeAreaIds.length === 0 && scopeProcessIds.length === 0),
    [form, editing, roleManages, scopeKind, scopeAreaIds, scopeProcessIds],
  );

  const from = data ? (data.page - 1) * data.pageSize + 1 : 0;
  const to = data ? Math.min(data.page * data.pageSize, data.total) : 0;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-[28px] font-semibold text-ink-900">Usuarios</h1>
          <p className="mt-1 text-sm text-ink-500">Colaboradores del tenant: cuentas, cargos, areas y acceso.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => { setImportResult(null); setImportOpen(true); }}>
            <Upload size={16} />
            Importar
          </Button>
          <Button onClick={openCreate}>
            <Plus size={16} />
            Nueva persona
          </Button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <div className="relative">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-300" />
          <Input
            value={q}
            onChange={(e) => { setQ(e.target.value); setPage(1); }}
            placeholder="Buscar por nombre, documento o correo"
            className="w-72 pl-9"
          />
        </div>
        <Select value={areaFilter} onChange={(e) => { setAreaFilter(e.target.value); setPage(1); }} className="w-56">
          <option value="">Todas las areas</option>
          {/* Con su rama: desde que hay sub-áreas, «Nómina» a secas no dice de dónde cuelga. */}
          {areas.map((a) => (
            <option key={a.id} value={a.id}>{nombreConRama(a, areas)}</option>
          ))}
        </Select>
      </div>

      {!data ? (
        <Skeleton className="h-96 w-full" />
      ) : data.total === 0 ? (
        <div className="card">
          <EmptyState
            icon={UserRound}
            title="Sin personas todavía"
            description="Crea la primera persona o carga el archivo masivo con la plantilla."
            action={
              <Button onClick={openCreate}>
                <Plus size={16} />
                Nueva persona
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
                  <Th>Nombre</Th>
                  <Th>Documento</Th>
                  <Th>Cargo</Th>
                  <Th>Area</Th>
                  <Th>Rol</Th>
                  <Th>Estado</Th>
                  <Th className="w-36 text-right">Acciones</Th>
                </Tr>
              </THead>
              <TBody>
                {data.items.map((user) => (
                  <Tr key={user.id}>
                    <Td>
                      <div className="font-medium text-ink-900">{user.fullName}</div>
                      {/*
                        QUIEN NO TIENE CORREO SE VE (2026-09-21). Dejar el hueco vacio se lee como
                        «no cargo la pantalla»; y quien administra necesita poder mirar la lista y
                        saber a quien NO le van a llegar los avisos por correo. No va en ambar: no
                        es un error, es un hecho de esa persona.
                      */}
                      <div className="text-xs text-ink-500">{user.email ?? 'Sin correo · entra con su cédula'}</div>
                    </Td>
                    <Td className="font-mono text-xs">{user.documentNumber}</Td>
                    <Td className="text-ink-700">{user.jobTitle.name}</Td>
                    <Td className="text-ink-700">{user.area.name}</Td>
                    <Td className="text-ink-500">{user.role.name}</Td>
                    <Td>
                      <StatusPill kind={user.active ? 'ok' : 'neutral'} label={user.active ? 'ACTIVA' : 'INACTIVA'} />
                    </Td>
                    <Td>
                      <AccionesDeFila
                        user={user}
                        onPerfil={() => router.push(`/usuarios/${user.id}`)}
                        onEditar={() => openEdit(user)}
                        onPapeles={() => setPapelesDe(user)}
                        onPermisos={() => setPermissionsFor(user)}
                        onContrasena={() => setARestablecer(user)}
                        onActivar={() => void toggleActive(user)}
                      />
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          </div>
          <TablePagination
            from={from}
            to={to}
            total={data.total}
            canPrevious={page > 1}
            canNext={to < data.total}
            onPrevious={() => setPage((p) => Math.max(1, p - 1))}
            onNext={() => setPage((p) => p + 1)}
          />
        </div>
      )}

      <PapelesDePersona
        userId={papelesDe?.id ?? null}
        nombre={papelesDe?.fullName ?? ''}
        open={papelesDe !== null}
        onOpenChange={(abierto) => {
          if (!abierto) setPapelesDe(null);
        }}
      />

      {/* Drawer crear/editar */}
      <Drawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        title={editing ? 'Editar persona' : 'Nueva persona'}
        description={editing ? `Documento: ${editing.documentNumber}` : 'La contraseña inicial se genera automaticamente (cedula + caracteres).'}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDrawerOpen(false)}>Cancelar</Button>
            <Button onClick={save} loading={saving} disabled={!formValid}>
              {editing ? 'Guardar cambios' : 'Crear persona'}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {!editing ? (
            <Field htmlFor="u-doc" label="Cedula / documento" required hint="Sera su usuario de ingreso.">
              <Input id="u-doc" value={form.documentNumber} onChange={(e) => setForm({ ...form, documentNumber: e.target.value.trim() })} maxLength={20} />
            </Field>
          ) : null}
          <Field htmlFor="u-name" label="Nombre completo" required>
            <Input id="u-name" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} maxLength={160} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field
              htmlFor="u-email"
              label="Correo"
              hint="Personal o corporativo. Si no tiene, déjalo vacío: entrará con su cédula."
            >
              <Input
                id="u-email"
                type="email"
                value={form.email ?? ''}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                maxLength={120}
              />
            </Field>
            <Field htmlFor="u-emailkind" label="Tipo de correo">
              <Select id="u-emailkind" value={form.emailKind} onChange={(e) => setForm({ ...form, emailKind: e.target.value as 'PERSONAL' | 'CORPORATE' })}>
                <option value="PERSONAL">Personal</option>
                <option value="CORPORATE">Corporativo</option>
              </Select>
            </Field>
          </div>
          <Field htmlFor="u-phone" label="Teléfono">
            <Input id="u-phone" value={form.phone ?? ''} onChange={(e) => setForm({ ...form, phone: e.target.value || null })} maxLength={20} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field htmlFor="u-job" label="Cargo" required>
              <Select id="u-job" value={form.jobTitleId} onChange={(e) => setForm({ ...form, jobTitleId: e.target.value })}>
                <option value="">Seleccionar...</option>
                {jobTitles.map((j) => (
                  <option key={j.id} value={j.id}>{j.name}</option>
                ))}
              </Select>
            </Field>
            <Field
              htmlFor="u-area"
              label="Área donde trabaja"
              required
              hint="Si tiene sub-área, se elige la sub-área: de ahí sale quién lo evalúa."
            >
              <Select
                id="u-area"
                value={form.areaId}
                onChange={(e) => {
                  const anterior = form.areaId;
                  const nueva = e.target.value;
                  setForm({ ...form, areaId: nueva });
                  /*
                    SI CAMBIA DE AREA, EL ALCANCE LA SIGUE. A quien administraba su area y la
                    trasladan, lo normal es que administre la nueva; dejarle la anterior marcada
                    es dejarle alcance sobre un area de la que ya no es, y nadie lo revisa.
                    Solo se sustituye lo que era SU area: lo que se marco a mano no se toca.
                  */
                  setScopeAreaIds((previas) =>
                    anterior && nueva && previas.includes(anterior)
                      ? [...previas.filter((id) => id !== anterior), nueva]
                      : previas,
                  );
                }}
              >
                <option value="">Seleccionar...</option>
                {/*
                  AQUÍ VA LA SUB-ÁREA, no el área grande (2026-09-17).

                  El área de la persona es lo que decide **quién la evalúa**: el evaluador es el
                  responsable de ESA área (`planificarEvaluaciones`). Dejarla en «Gestión Humana» la
                  hace evaluar por el jefe de Gestión Humana; ponerla en «Nómina», por la jefatura de
                  Nómina — que es lo que el cliente pidió. Por eso la etiqueta lleva la rama.
                */}
                {areas.map((a) => (
                  <option key={a.id} value={a.id}>{nombreConRama(a, areas)}</option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field htmlFor="u-service" label="Servicio" hint="Opcional.">
              <Select id="u-service" value={form.serviceId ?? ''} onChange={(e) => setForm({ ...form, serviceId: e.target.value || null })}>
                <option value="">Ninguno</option>
                {services.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </Select>
            </Field>
            <Field htmlFor="u-regional" label="Regional">
              <Select id="u-regional" value={form.regionalId ?? ''} onChange={(e) => setForm({ ...form, regionalId: e.target.value || null })}>
                <option value="">Sin regional</option>
                {regionals.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </Select>
            </Field>
            <Field htmlFor="u-role" label="Rol en la plataforma">
              <Select
                id="u-role"
                value={form.roleCode}
                onChange={(e) => {
                  const roleCode = e.target.value as CreateUserBody['roleCode'];
                  setForm({ ...form, roleCode });
                  // Al cambiar de rol se propone el alcance habitual de ese rol, sin imponerlo:
                  // sigue pudiendose elegir cualquiera de los tres.
                  if (!editing) {
                    if (defaultScopeFor(roleCode) === 'scoped') acotar();
                    else setScopeKind('all');
                  }
                }}
              >
                <option value="USUARIO">Usuario</option>
                <option value="ANALISTA">Analista</option>
                <option value="ADMIN">Administrador</option>
              </Select>
            </Field>
          </div>

            {/*
              GESTIONA — el alcance, decidido donde se decide todo lo demas de la persona.
              Estaba escondido en el cajon de permisos y habia que ir a buscarlo despues de crearla.

              Tres opciones y no dos, porque "vacio = su area" rompia al administrador: hoy la regla
              del servidor es "sin filas = ve todo", y es lo que lo mantiene sin restriccion.

              Solo aparece si el ROL ELEGIDO concede algun permiso de gestion, y se mira el permiso,
              nunca el nombre del rol (Decision #19): manana un cliente llama al suyo "Coordinador
              HSE" y un `rol === 'ANALISTA'` deja de funcionar sin que nadie se entere.
            */}
            {roleManages ? (
              <Field
                htmlFor="u-scope"
                label="Gestiona"
                hint="Que parte del catálogo, las convocatorias y el plan administra."
              >
                <div className="space-y-2">
                  <ScopeOption
                    id="u-scope"
                    checked={scopeKind === 'all'}
                    onSelect={() => setScopeKind('all')}
                    title="Toda la empresa"
                    description="Sin restriccion. Es lo normal para un administrador."
                  />
                  <ScopeOption
                    checked={scopeKind === 'scoped'}
                    onSelect={acotar}
                    title="Solo estas areas y procesos"
                    description="Lo que administra. No tiene por que ser donde trabaja."
                  />

                  {scopeKind === 'scoped' ? (
                    <div className="space-y-3 rounded-lg border border-line bg-paper/60 p-3">
                      {/*
                        DOS LISTAS Y NO UNA ELECCION ENTRE DOS: el modelo permite las dos a la vez
                        —quien lleva toda el area de SGI y ademas el proceso SARLAFT de otra— y el
                        cajon de Permisos ya lo permitia. Que aqui no se pudiera era lo que dejaba
                        alcances "a medida" imposibles de editar desde la ficha.
                      */}
                      <div>
                        <p className="mb-1.5 text-xs font-medium text-ink-700">Areas completas</p>
                        <MultiSelect
                          id="u-scope-areas"
                          placeholder="Ninguna area marcada"
                          /*
                            SU area sale rotulada "(su area)". Sin eso, esta lista y el campo
                            "Area" de arriba parecen el mismo dato y no lo son: arriba es DONDE
                            TRABAJA —y de ahi salen las formaciones que le exigen a ella—; aqui es
                            QUE ADMINISTRA. Marcar SGI no arrastra a Logistica: se toma solo lo
                            marcado, ni mas ni menos.
                          */
                          options={areas.map((row) => ({
                            id: row.id,
                            label: row.id === form.areaId ? `${row.name} (su area)` : row.name,
                          }))}
                          value={scopeAreaIds}
                          onChange={setScopeAreaIds}
                        />
                        <p className="mt-1 text-xs text-ink-500">
                          Incluye los procesos que se creen mañana en esas areas.
                        </p>
                      </div>

                      <div>
                        <p className="mb-1.5 text-xs font-medium text-ink-700">Procesos sueltos</p>
                        <MultiSelect
                          id="u-scope-processes"
                          placeholder="Ningún proceso marcado"
                          options={processes.map((row) => ({ id: row.id, label: row.name }))}
                          value={scopeProcessIds}
                          onChange={setScopeProcessIds}
                        />
                        <p className="mt-1 text-xs text-ink-500">Solo aplica gestion en estos procesos.</p>
                      </div>

                      {/*
                        SIN NADA MARCADO NO SE ACOTA NADA: la regla del servidor es "sin filas = ve
                        todo", asi que guardar "acotado" y vacio daria acceso a TODA la empresa,
                        justo lo contrario de lo que se acaba de pedir. Impide guardar, asi que se
                        dice como los demas errores del formulario y no con un bloque de color
                        propio: un aviso ambar mas es ruido que se aprende a ignorar.

                        Y si se quita SU area, se dice la consecuencia concreta —dejara de ver lo
                        suyo— sin impedir nada: es legitimo (quien lleva SARLAFT desde Gestion
                        Humana no administra su area) pero casi nunca es lo que se queria.
                      */}
                      {scopeAreaIds.length === 0 && scopeProcessIds.length === 0 ? (
                        <p role="alert" className="text-xs text-danger">
                          Marca al menos un area o un proceso. Sin nada marcado no se acota nada: veria toda la empresa.
                        </p>
                      ) : form.areaId && !scopeAreaIds.includes(form.areaId) ? (
                        <p className="text-xs text-ink-500">
                          No administrara nada de {areas.find((a) => a.id === form.areaId)?.name ?? 'su area'}, que es
                          donde trabaja. Correcto si gestiona lo de otra area.
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </Field>
            ) : null}

          <div className="grid grid-cols-2 gap-3">
            <Field htmlFor="u-hired" label="Fecha de ingreso" hint="Dispara la inducción previa al inicio.">
              <Input id="u-hired" type="date" value={form.hiredAt ?? ''} onChange={(e) => setForm({ ...form, hiredAt: e.target.value || null })} />
            </Field>
            <Field htmlFor="u-birth" label="Fecha de nacimiento" hint="Opcional.">
              <Input
                id="u-birth"
                type="date"
                value={form.birthDate ?? ''}
                onChange={(e) => setForm({ ...form, birthDate: e.target.value || null })}
              />
            </Field>
            <Field htmlFor="u-emp" label="Vinculacion">
              <Select id="u-emp" value={form.employmentType} onChange={(e) => setForm({ ...form, employmentType: e.target.value })}>
                <option value="DIRECTO">Directo</option>
                <option value="CONTRATISTA">Contratista</option>
                <option value="TEMPORAL">Temporal</option>
                <option value="EN_MISION">En mision</option>
              </Select>
            </Field>
          </div>
          {formError ? (
            <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{formError}</p>
          ) : null}
        </div>
      </Drawer>

      {/* Credencial generada — se muestra UNA vez */}
      <Drawer
        open={aRestablecer !== null}
        onOpenChange={(open) => {
          if (!open) setARestablecer(null);
        }}
        title={aRestablecer ? `Restablecer la contrasena de ${aRestablecer.fullName}` : ''}
        description="Se genera una contraseña nueva al azar y la actual deja de servir."
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setARestablecer(null)}>
              Cancelar
            </Button>
            <Button onClick={() => aRestablecer && void resetPassword(aRestablecer)}>
              Generar contrasena nueva
            </Button>
          </div>
        }
      >
        <div className="space-y-3 text-sm text-ink-700">
          <p>
            <span className="font-medium text-ink-900">La contraseña actual dejara de funcionar</span> y se cerraran
            todas sus sesiones. La nueva se enseña <span className="font-medium text-ink-900">una sola vez</span>:
            copiala antes de cerrar, porque despues no se puede volver a ver.
          </p>
          <p className="rounded-lg bg-paper px-3 py-2 text-ink-500">
            Al entrar con ella, el sistema le obligara a poner una suya. Nadie mas la conoce en ningun momento — ni
            siquiera quien la genera.
          </p>
        </div>
      </Drawer>

      <Drawer
        open={credential !== null}
        onOpenChange={(open) => { if (!open) setCredential(null); }}
        title="Contraseña generada"
        description="Se muestra una sola vez. Entregala de forma segura; en el primer ingreso el sistema exige cambiarla."
        footer={
          <div className="flex justify-end">
            <Button onClick={() => setCredential(null)}>Entendido</Button>
          </div>
        }
      >
        {credential ? (
          <div className="space-y-4">
            <div className="card p-4">
              <p className="text-sm text-ink-500">{credential.name}</p>
              <p className="mt-2 text-xs uppercase tracking-wide text-ink-300">Usuario</p>
              <p className="font-mono text-lg">{credential.document}</p>
              <p className="mt-3 text-xs uppercase tracking-wide text-ink-300">Contraseña temporal</p>
              <p className="font-mono text-lg">{credential.password}</p>
            </div>
            <Button
              variant="outline"
              onClick={async () => {
                await navigator.clipboard.writeText(`Usuario: ${credential.document}\nContrasena: ${credential.password}`);
                showToast({ kind: 'success', title: 'Credencial copiada' });
              }}
            >
              <Copy size={16} />
              Copiar credencial
            </Button>
          </div>
        ) : null}
      </Drawer>

      {/* Importacion masiva */}
      <Drawer
        open={importOpen}
        onOpenChange={setImportOpen}
        title="Importar personas"
        description="Descarga la plantilla, llenala y subela. Las filas correctas se crean aunque otras fallen."
        footer={
          <div className="flex justify-end">
            <Button variant="ghost" onClick={() => setImportOpen(false)}>Cerrar</Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Button variant="outline" onClick={() => void downloadImportTemplate()}>
            <Download size={16} />
            Descargar plantilla (Excel)
          </Button>

          <Field htmlFor="import-file" label="Archivo" hint="El Excel de la plantilla (.xlsx). También se acepta .csv si lo prefieres.">
            <input
              id="import-file"
              type="file"
              accept=".csv,.xlsx"
              disabled={importing}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void onImportFile(file);
                e.target.value = '';
              }}
              className="focus-ring block w-full cursor-pointer rounded-md border border-line bg-surface px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-paper file:px-3 file:py-1 file:text-sm"
            />
          </Field>

          {/*
            Lo que hay que saber ANTES de subir, no despues de que falle. Cada linea de aqui es una
            llamada a soporte que no se hace.
          */}
          <div className="rounded-lg border border-line bg-paper p-4 text-sm text-ink-700">
            <p className="font-medium text-ink-900">Como llenarla</p>
            <ul className="mt-2 space-y-1.5 text-ink-500">
              <li>
                <strong className="text-ink-700">Obligatorias:</strong> documento, nombre_completo, correo, cargo y
                area. El resto se puede dejar vacio.
              </li>
              <li>
                En cargo, area, regional y servicio vale el <strong className="text-ink-700">nombre</strong> o el
                codigo, como prefieras: "Logistica" y "LOGISTICA" funcionan igual.
              </li>
              <li>Las fechas van como AAAA-MM-DD, por ejemplo 2026-09-01.</li>
              <li>No cambies los encabezados de la primera fila. Máximo 2000 filas.</li>
              <li>
                Si algo falla, se te dira <strong className="text-ink-700">la fila y la columna</strong> exactas; lo
                demas entra igual.
              </li>
            </ul>
            <p className="mt-2 text-xs text-ink-500">La plantilla trae estas mismas instrucciones en su segunda hoja.</p>
          </div>

          {importing ? <Skeleton className="h-24 w-full" /> : null}

          {importResult ? (
            <div className="space-y-3">
              {/*
                EL DESGLOSE, NO UN SOLO NUMERO (2026-09-21).

                Decia «N CREADAS» para todo lo que salio bien, y desde que una recarga ACTUALIZA en
                vez de rechazar eso seria mentira: el archivo mensual de una empresa son casi todo
                filas que ya estaban. Quien lo sube necesita ver de un vistazo cuanta gente entro de
                verdad y a cuanta se le cambio algo — lo segundo es lo que mueve obligaciones.

                «Sin cambios» va en gris y solo si las hay: es la mayoria, y no es una noticia.
              */}
              <div className="flex flex-wrap gap-2">
                <StatusPill kind="ok" label={`${importResult.creadas} ${importResult.simulacion ? 'SE CREARÍAN' : 'CREADAS'}`} />
                {importResult.actualizadas > 0 ? (
                  <StatusPill
                    kind="info"
                    label={`${importResult.actualizadas} ${importResult.simulacion ? 'CAMBIARÍAN' : 'ACTUALIZADAS'}`}
                  />
                ) : null}
                {importResult.sinCambios > 0 ? (
                  <StatusPill kind="neutral" label={`${importResult.sinCambios} SIN CAMBIOS`} />
                ) : null}
                <StatusPill kind={importResult.failed > 0 ? 'danger' : 'neutral'} label={`${importResult.failed} CON ERROR`} />
              </div>

              {/*
                EL SEGUNDO CLIC (`PENDIENTES` 5.4). Hasta aquí no se ha escrito nada: la lista de
                abajo dice lo que PASARÍA. El botón no se llama «Confirmar» sino «Aplicar» y dice
                cuántas filas mueve, porque lo que hay que leer antes de pulsarlo es el número.
              */}
              {importResult.simulacion && pendiente ? (
                <div className="rounded-lg border border-info/40 bg-info-soft p-3">
                  <p className="text-sm text-ink-700">
                    <strong>Todavía no se ha guardado nada.</strong> Revisa la lista —sobre todo lo que
                    dice «Cambiaría»— y aplica cuando esté bien.
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button size="sm" onClick={aplicarImport} loading={importing}>
                      Aplicar ({importResult.creadas + importResult.actualizadas} filas)
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => { setPendiente(null); setImportResult(null); }}
                      disabled={importing}
                    >
                      Descartar
                    </Button>
                  </div>
                </div>
              ) : null}

              {/* Solo hay contrasenas que copiar de las filas NUEVAS, y solo una vez aplicado. */}
              {!importResult.simulacion && importResult.creadas > 0 ? (
                <Button variant="outline" size="sm" onClick={copyImportPasswords}>
                  <Copy size={14} />
                  Copiar contrasenas generadas
                </Button>
              ) : null}
              <div className="max-h-64 overflow-y-auto rounded-md border border-line">
                <Table>
                  <THead>
                    {/*
                      CON EL NOMBRE, NO SOLO LA CEDULA (2026-09-21).

                      Lo reporto el cliente con 1.089 filas en rojo: la tabla enseñaba el numero de
                      fila y el documento, asi que para saber DE QUIEN era cada error habia que
                      abrir el archivo y buscar la cedula una por una.

                      El nombre va debajo del documento y no en columna propia: este cajon es
                      estrecho y la tercera columna —el motivo— es la que hay que poder leer
                      entera, que es a lo que se vino.
                    */}
                    <Tr>
                      <Th>Fila</Th>
                      <Th>Persona</Th>
                      <Th>Resultado</Th>
                    </Tr>
                  </THead>
                  <TBody>
                    {importResult.rows.map((row) => (
                      <Tr key={row.rowNumber}>
                        <Td className="text-ink-500">{row.rowNumber}</Td>
                        <Td>
                          <span className="font-mono text-xs">{row.documento}</span>
                          {row.nombre ? <span className="block text-xs text-ink-700">{row.nombre}</span> : null}
                        </Td>
                        <Td>
                          {row.status === 'OK' ? (
                            /*
                              «OK» ya no basta: hay tres cosas buenas que pueden pasarle a una fila y
                              significan trabajo distinto. «Actualizada» va en azul y no en verde
                              porque es lo que hay que MIRAR —ahi es donde alguien cambio de area— y
                              la nota de al lado dice exactamente que campos se tocaron.
                            */
                            <span
                              className={
                                row.accion === 'SIN_CAMBIOS'
                                  ? 'text-sm text-ink-500'
                                  : row.accion === 'ACTUALIZADA'
                                    ? 'text-sm text-info'
                                    : 'text-sm text-ok'
                              }
                            >
                              {row.accion === 'ACTUALIZADA'
                                ? importResult.simulacion
                                  ? 'Cambiaría'
                                  : 'Actualizada'
                                : row.accion === 'SIN_CAMBIOS'
                                  ? 'Ya estaba, sin cambios'
                                  : importResult.simulacion
                                    ? 'Se crearía'
                                    : 'Creada'}
                              {row.generatedPassword ? ` — clave: ${row.generatedPassword}` : ''}
                              {row.note ? <span className="block text-xs text-ink-500">{row.note}</span> : null}
                            </span>
                          ) : (
                            <span className="text-sm text-danger">{row.error}</span>
                          )}
                        </Td>
                      </Tr>
                    ))}
                  </TBody>
                </Table>
              </div>
              <p className="text-xs text-ink-500">
                Las contrasenas generadas se muestran UNA sola vez. Copialas antes de cerrar este panel.
              </p>
            </div>
          ) : null}
        </div>
      </Drawer>

      <UserPermissionsDrawer
        user={permissionsFor}
        open={permissionsFor !== null}
        onOpenChange={(open) => {
          if (!open) setPermissionsFor(null);
        }}
      />
    </div>
  );
}

/**
 * Una opcion de alcance. Es un radio de verdad —no un boton que parece uno— para que el teclado y
 * el lector de pantalla lo entiendan, y porque las tres opciones son excluyentes: quien gestiona su
 * area no gestiona ademas "toda la empresa".
 */
function ScopeOption({
  id,
  checked,
  onSelect,
  title,
  description,
  disabled,
  disabledHint,
}: {
  id?: string;
  checked: boolean;
  onSelect: () => void;
  title: string;
  description: string;
  disabled?: boolean;
  disabledHint?: string;
}) {
  return (
    <label
      htmlFor={id}
      title={disabled ? disabledHint : undefined}
      className={cn(
        'flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 transition-colors duration-150',
        checked ? 'border-primary bg-primary-soft' : 'border-line hover:border-ink-300',
        disabled && 'cursor-not-allowed opacity-50',
      )}
    >
      <input
        id={id}
        type="radio"
        name="u-scope"
        className="focus-ring mt-0.5"
        checked={checked}
        disabled={disabled}
        onChange={onSelect}
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-ink-900">{title}</span>
        <span className="mt-0.5 block text-xs text-ink-500">{description}</span>
      </span>
    </label>
  );
}

/**
 * LAS ACCIONES DE UNA PERSONA: cuatro a la vista y el resto flotando en circulos (2026-09-09).
 *
 * ─── EL CAMINO, QUE ES LA EXPLICACION ───
 *
 * Van cuatro formas, y las tres primeras las tumbo el cliente con la razon puesta:
 *
 * 1. **Siete iconos en fila.** Con veinte filas son ciento cuarenta objetos pulsables y ninguno se
 *    lee: cuando todo pesa igual hay que pasar el raton por encima de cada uno para saber cual es.
 * 2. **Cinco desplegandose EN la fila.** *«Hace lo mismo que antes»* — y era cierto: seguian siendo
 *    cinco iconos mudos, solo que a un clic, y ademas la fila se ensanchaba al abrirlos.
 * 3. **Un menu con palabras.** Resolvia la mudez, pero metia una tarjeta con borde encima de la
 *    tabla: otra superficie que tapa y que hay que cerrar, justo lo que sobraba.
 * 4. **Esto.** Cuatro acciones siempre a la vista —editar, estado, perfil y los tres puntos— y las
 *    otras cuatro **flotando en circulos, sin tarjeta y sin fondo**, saliendo del propio boton.
 *
 * ─── POR QUE ESTAS CUATRO A LA VISTA ───
 *
 * **Editar** y **estado** son las dos cosas de todos los dias sobre una persona: entra gente y sale
 * gente, y esconder «dar de baja» obligaba a dos gestos para lo mas frecuente. **Perfil** es lo que
 * mas se abre y lo unico que no cambia nada. Los **tres puntos** guardan lo excepcional: emitir una
 * constancia, registrar el papel de un tercero, tocar permisos, generar una contrasena.
 *
 * ─── LOS CIRCULOS: POR QUE SIN CAJA ───
 *
 * Un panel con borde y fondo es una superficie nueva encima de la tabla. Los circulos **son los
 * botones y ya**: aparecen sobre lo que habia, se pulsa uno y se van. Cada uno lleva su globo de
 * texto al pasar el raton y su nombre completo para el lector de pantalla, asi que la mudez del
 * segundo intento no vuelve — la palabra esta, solo que a demanda.
 *
 * Salen **escalonados 45 ms** y creciendo desde el 55 % de su tamano: en cadena y creciendo se lee
 * como «esto se desplego desde ahi»; a la vez, seria un parpadeo. Y con `prefers-reduced-motion` se
 * apagan solas por la regla global de `globals.css`: quien pidio menos movimiento ve el resultado,
 * no el viaje.
 */
function AccionesDeFila({
  user,
  onPerfil,
  onEditar,
  onPapeles,
  onPermisos,
  onContrasena,
  onActivar,
}: {
  user: UserRow;
  onPerfil: () => void;
  onEditar: () => void;
  onPapeles: () => void;
  onPermisos: () => void;
  onContrasena: () => void;
  onActivar: () => void;
}) {
  /*
    CONSTANCIAS SE FUE AL PERFIL (2026-09-17). El cliente: *"si ya está en perfil estaría más de una
    vez"*. Y era cierto: el expediente ya las lista, y desde hoy además se abren y se descargan
    desde ahí, que es para lo que se buscan.

    **El papel de un tercero se queda en los dos sitios**, y a propósito: no es una lista repetida,
    es una ACCIÓN —convalidar el papel de una ARL o del SENA contra una obligación viva—. Se llega a
    ella desde la fila, cuando se está repasando gente, y desde el expediente, cuando se está
    mirando a una persona. Quitarla de la fila no habría ahorrado una repetición: habría alargado el
    camino de lo que más se hace.
  */
  const flotantes = [
    { icono: BadgeCheck, texto: 'Papel de un tercero', accion: onPapeles },
    { icono: ShieldCheck, texto: 'Permisos y excepciones', accion: onPermisos },
    { icono: KeyRound, texto: 'Generar contraseña nueva', accion: onContrasena },
  ];

  return (
    <div className="flex items-center justify-end gap-0.5">
      <button
        type="button"
        onClick={onEditar}
        aria-label={`Editar ${user.fullName}`}
        title="Editar los datos de la persona"
        className="focus-ring flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-500 transition-colors duration-150 hover:bg-primary-soft hover:text-ink-900"
      >
        <Pencil size={14} />
      </button>

      {/*
        EL ESTADO, FUERA DEL MENU (pedido del cliente). El icono dice hacia donde va, no donde
        esta: con la persona activa se ve el de darla de baja. Y es el unico sitio de la fila donde
        el color al pasar no es el de la empresa, porque desactivar y activar no son lo mismo.
      */}
      <button
        type="button"
        onClick={onActivar}
        aria-label={`${user.active ? 'Desactivar a' : 'Activar a'} ${user.fullName}`}
        title={
          user.active
            ? 'Desactivar: deja de entrar y sale de las obligaciones'
            : 'Activar: vuelve a entrar y a contar'
        }
        className={cn(
          'focus-ring flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors duration-150',
          user.active
            ? 'text-ink-500 hover:bg-danger-soft hover:text-danger'
            : 'text-ink-300 hover:bg-ok-soft hover:text-ok',
        )}
      >
        {user.active ? <UserMinus size={14} /> : <UserCheck size={14} />}
      </button>

      <button
        type="button"
        onClick={onPerfil}
        aria-label={`Perfil de ${user.fullName}`}
        title="Perfil: todo lo de esta persona en una pagina"
        className="focus-ring flex h-8 shrink-0 items-center gap-1.5 rounded-full px-2 text-ink-500 transition-colors duration-150 hover:bg-primary-soft hover:text-ink-900"
      >
        <UserRound size={15} />
        <span className="hidden text-xs font-medium lg:inline">Perfil</span>
      </button>

      <Popover
        etiqueta={`Más acciones para ${user.fullName}`}
        ancho="w-auto"
        // Al panel se le quita la caja entera: aqui no hay tarjeta, solo los circulos flotando.
        className="border-0 bg-transparent p-0 shadow-none"
        botonClassName="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-300 transition-colors duration-150 hover:bg-primary-soft hover:text-ink-700"
        boton={(abierta) => (
          <MoreVertical
            size={15}
            className={cn(
              'transition-transform duration-300 ease-pulse',
              abierta && 'rotate-90 text-ink-900',
            )}
          />
        )}
      >
        {(cerrar) => (
          <div className="flex items-center gap-2 pt-1">
            {flotantes.map((accion, indice) => (
              <button
                key={accion.texto}
                type="button"
                title={accion.texto}
                aria-label={`${accion.texto}: ${user.fullName}`}
                onClick={() => {
                  accion.accion();
                  cerrar();
                }}
                style={{ animationDelay: `${indice * 45}ms` }}
                className="focus-ring animate-pop-in flex h-11 w-11 items-center justify-center rounded-full bg-surface text-ink-500 shadow-card-hover transition-colors duration-150 hover:bg-primary-soft hover:text-ink-900"
              >
                <accion.icono size={17} strokeWidth={1.75} aria-hidden />
              </button>
            ))}
          </div>
        )}
      </Popover>
    </div>
  );
}

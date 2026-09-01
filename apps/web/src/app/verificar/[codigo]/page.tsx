'use client';

import { BadgeCheck, CircleAlert, CircleSlash, ShieldQuestion } from 'lucide-react';
import { useEffect, useState } from 'react';
import { verificarConstancia, type VerificacionPublica } from '@/lib/certificates-api';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * VERIFICAR UNA CONSTANCIA, sin sesion (Decision #110).
 *
 * ─── QUIEN ABRE ESTO ───
 *
 * Casi nunca alguien de la empresa. Es el cliente que exige el curso de alturas antes de dejar
 * entrar a un conductor a su planta, la ARL, o recursos humanos de otra empresa mirando una hoja
 * de vida. Gente de FUERA, con un papel en la mano, escaneando el QR con el telefono.
 *
 * Por eso no pide cuenta: una constancia que no se puede comprobar no vale como evidencia, y
 * pedirle un registro a alguien de otra empresa convierte la verificacion en un tramite que nadie
 * hace. Lo que la protege no es el login sino el CODIGO —20 caracteres aleatorios, no
 * correlativos—: no se puede enumerar.
 *
 * ─── LA RESPUESTA DICE MENOS DE LO QUE SABEMOS ───
 *
 * Nombre, formacion, horas y fechas: lo justo para confirmar que el papel que se tiene delante es
 * autentico. La cedula sale ENMASCARADA —110***6093— porque sin ella no se puede confirmar que la
 * constancia es de la persona que uno tiene enfrente, pero publicarla entera no hace falta: quien
 * tiene el papel ya la ve. El cargo, el area y la nota no salen.
 *
 * ─── LOS TRES ESTADOS SE VEN DISTINTOS DESDE LEJOS ───
 *
 * Quien mira esto lo mira dos segundos en la puerta de una planta. Verde, ambar y rojo con su
 * icono y su palabra: el resultado tiene que leerse sin leer.
 */
export default function VerificarPage({ params }: { params: { codigo: string } }) {
  const [estado, setEstado] = useState<'cargando' | 'no-existe' | 'ok'>('cargando');
  const [datos, setDatos] = useState<VerificacionPublica | null>(null);

  useEffect(() => {
    let cancelado = false;
    void verificarConstancia(decodeURIComponent(params.codigo)).then((resultado) => {
      if (cancelado) return;
      setDatos(resultado);
      setEstado(resultado ? 'ok' : 'no-existe');
    });
    return () => {
      cancelado = true;
    };
  }, [params.codigo]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-paper px-5 py-10">
      <div className="w-full max-w-[440px]">
        <p className="text-center text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-500">
          Verificacion de constancia
        </p>

        {estado === 'cargando' ? (
          <Skeleton className="mt-5 h-64 w-full rounded-2xl" />
        ) : estado === 'no-existe' ? (
          /*
            NO SE DICE "codigo invalido" a secas: quien llega aqui suele haber tecleado el codigo
            de un papel, y lo primero util es que se puede haber equivocado al copiarlo. Tampoco se
            dice "esa constancia no existe" con seguridad — no distinguimos entre un codigo mal
            copiado y uno inventado, y afirmar de mas sobre un documento ajeno es lo ultimo que
            debe hacer una pantalla de verificacion.
          */
          <div className="card mt-5 p-6 text-center">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-paper text-ink-500">
              <ShieldQuestion className="h-7 w-7" strokeWidth={1.75} aria-hidden="true" />
            </span>
            <h1 className="mt-4 font-display text-xl font-bold text-ink-900">No encontramos esta constancia</h1>
            <p className="mt-2 text-sm leading-relaxed text-ink-500">
              Revisa que el codigo este completo y bien copiado. Si lo escaneaste del papel y sigue sin aparecer,
              pideselo a la empresa que lo emitio.
            </p>
          </div>
        ) : datos ? (
          <Resultado datos={datos} />
        ) : null}

        <p className="mt-6 text-center text-xs text-ink-300">NEO PULSE</p>
      </div>
    </main>
  );
}

function Resultado({ datos }: { datos: VerificacionPublica }) {
  const fecha = (iso: string) =>
    new Date(iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });

  const aspecto =
    datos.estado === 'VIGENTE'
      ? { Icono: BadgeCheck, clase: 'bg-ok-soft text-ok', titulo: 'Constancia autentica' }
      : datos.estado === 'VENCIDA'
        ? { Icono: CircleAlert, clase: 'bg-warn-soft text-warn', titulo: 'Autentica, pero vencida' }
        : { Icono: CircleSlash, clase: 'bg-danger-soft text-danger', titulo: 'Constancia anulada' };

  return (
    <div className="card animate-card-in mt-5 overflow-hidden">
      <div className="flex flex-col items-center px-6 pb-5 pt-6 text-center">
        <span className={`flex h-14 w-14 items-center justify-center rounded-full ${aspecto.clase}`}>
          <aspecto.Icono className="h-7 w-7" strokeWidth={1.75} aria-hidden="true" />
        </span>
        <h1 className="mt-4 font-display text-xl font-bold text-ink-900">{aspecto.titulo}</h1>
        {/*
          VENCIDA NO ES FALSA, y es la distincion que mas importa aqui: quien la mira esta
          decidiendo si deja entrar a alguien a una planta. "Vencida" significa que la formacion se
          hizo de verdad y hay que repetirla; "anulada" significa que la empresa la retiro.
        */}
        {datos.estado === 'VENCIDA' ? (
          <p className="mt-1.5 text-sm leading-relaxed text-ink-500">
            La formacion se hizo, pero su vigencia termino el {fecha(datos.validUntil ?? '')}.
          </p>
        ) : datos.estado === 'REVOCADA' ? (
          <p className="mt-1.5 text-sm leading-relaxed text-ink-500">
            {datos.revokedReason ?? 'La empresa que la emitio la anulo.'}
          </p>
        ) : null}
      </div>

      <dl className="divide-y divide-line border-t border-line">
        <Dato etiqueta="Persona" valor={datos.persona.fullName} secundario={datos.persona.documentNumber} />
        <Dato
          etiqueta="Formacion"
          valor={datos.formacion.name}
          secundario={datos.formacion.hours ? `${datos.formacion.hours} horas` : null}
        />
        <Dato etiqueta="La curso el" valor={fecha(datos.resultado.completedAt)} />
        <Dato etiqueta="Emitida por" valor={datos.empresa.displayName} secundario={datos.serialNumber} />
      </dl>
    </div>
  );
}

function Dato({ etiqueta, valor, secundario }: { etiqueta: string; valor: string; secundario?: string | null }) {
  return (
    <div className="flex items-start justify-between gap-4 px-6 py-3.5">
      <dt className="shrink-0 text-sm text-ink-500">{etiqueta}</dt>
      <dd className="min-w-0 text-right">
        <span className="block text-sm font-medium text-ink-900">{valor}</span>
        {secundario ? <span className="block text-xs text-ink-500">{secundario}</span> : null}
      </dd>
    </div>
  );
}

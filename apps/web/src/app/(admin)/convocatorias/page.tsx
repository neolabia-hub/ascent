import { CalendarDays } from 'lucide-react';
import { ComingSoon } from '@/components/layout/coming-soon';

export default function ConvocatoriasPage() {
  return (
    <ComingSoon
      icon={CalendarDays}
      title="Convocatorias"
      subtitle="Ejecuciones de una actividad: fecha, instructor, regional, proyectados y asistencia."
      sprint="Aqui se programaran las convocatorias y se tomara la asistencia. Llega en el Sprint 3."
    />
  );
}

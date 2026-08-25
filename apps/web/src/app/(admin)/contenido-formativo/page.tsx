import { BookOpen } from 'lucide-react';
import { ComingSoon } from '@/components/layout/coming-soon';

export default function ContenidoFormativoPage() {
  return (
    <ComingSoon
      icon={BookOpen}
      title="Contenido formativo"
      subtitle="Catalogo de actividades formativas, versiones y lecciones."
      sprint="Aqui se crearan las actividades formativas con sus versiones, lecciones en tarjetas y evaluaciones. Llega en el Sprint 2."
    />
  );
}

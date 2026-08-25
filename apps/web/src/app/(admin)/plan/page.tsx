import { ClipboardList } from 'lucide-react';
import { ComingSoon } from '@/components/layout/coming-soon';

export default function PlanPage() {
  return (
    <ComingSoon
      icon={ClipboardList}
      title="Plan de capacitacion"
      subtitle="Plan anual con metas, aprobacion e indicadores propios."
      sprint="Aqui se armara el plan anual y sus renglones, con metricas independientes de todo lo demas. Llega en el Sprint 3."
    />
  );
}

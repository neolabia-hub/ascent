import { ChartColumn } from 'lucide-react';
import { ComingSoon } from '@/components/layout/coming-soon';

export default function ReportesPage() {
  return (
    <ComingSoon
      icon={ChartColumn}
      title="Reportes"
      subtitle="Cumplimiento por proceso, cobertura, vencimientos y matriz de competencia."
      sprint="Aqui estaran los indicadores y las exportaciones para auditoria. Llega en el Sprint 6."
    />
  );
}

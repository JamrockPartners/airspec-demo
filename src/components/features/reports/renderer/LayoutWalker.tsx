import type { AirspecComponent } from '../../../../types/airspec';
import { componentRegistry } from './componentRegistry';
import { useReportContext, evaluateVisibleWhen } from './ReportContext';

interface LayoutWalkerProps {
  node: AirspecComponent;
}

export default function LayoutWalker({ node }: LayoutWalkerProps) {
  const { parameters } = useReportContext();

  const visibleWhen = node.visibleWhen as { parameter: string; operator: string; value?: unknown } | undefined;
  if (!evaluateVisibleWhen(visibleWhen, parameters)) {
    return null;
  }

  const Component = componentRegistry[node.type];

  if (!Component) {
    return (
      <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
        Unknown component type: "{node.type}"
      </div>
    );
  }

  return <Component component={node} />;
}

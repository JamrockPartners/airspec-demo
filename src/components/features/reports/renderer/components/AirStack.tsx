import type { AirComponentProps } from '../componentRegistry';
import LayoutWalker from '../LayoutWalker';
import type { AirspecComponent, AirspecContainerComponent } from '../../../../../types/airspec';

const GAP_PX: Record<string, string> = { none: '0', small: '8px', medium: '16px', large: '24px' };

export default function AirStack({ component }: AirComponentProps) {
  const c = component as unknown as AirspecContainerComponent;
  const gap = c.gap ?? 'medium';
  const children = c.children ?? [];

  return (
    <div className="flex flex-col" style={{ gap: GAP_PX[gap] ?? GAP_PX.medium }}>
      {children.map((child: AirspecComponent, idx: number) => (
        <LayoutWalker key={child.id ?? idx} node={child} />
      ))}
    </div>
  );
}

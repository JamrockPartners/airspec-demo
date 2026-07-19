import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import type { AirComponentProps } from '../componentRegistry';
import LayoutWalker from '../LayoutWalker';
import type { AirspecComponent, AirspecContainerComponent } from '../../../../../types/airspec';

const GAP_PX: Record<string, string> = { none: '0', small: '8px', medium: '16px', large: '24px' };

export default function AirSection({ component }: AirComponentProps) {
  const c = component as unknown as AirspecContainerComponent;
  const gap = c.gap ?? 'medium';
  const children = c.children ?? [];
  const [collapsed, setCollapsed] = useState(false);

  return (
    <section className="bg-white rounded-xl border border-slate-200 shadow-sm">
      {c.title && (
        <button
          onClick={() => c.collapsible && setCollapsed((v) => !v)}
          className="flex items-center justify-between w-full px-5 py-3 border-b border-slate-100"
        >
          <h3 className="text-sm font-semibold text-slate-800">{c.title}</h3>
          {c.collapsible && (
            <ChevronRight size={16} className={`text-slate-400 transition-transform ${collapsed ? '' : 'rotate-90'}`} />
          )}
        </button>
      )}
      {!collapsed && (
        <div className="p-5" style={{ gap: GAP_PX[gap] ?? GAP_PX.medium }}>
          <div className="flex flex-col" style={{ gap: GAP_PX[gap] ?? GAP_PX.medium }}>
            {children.map((child: AirspecComponent, idx: number) => (
              <LayoutWalker key={child.id ?? idx} node={child} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

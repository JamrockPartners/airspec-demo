import { useRef, useState, useEffect } from 'react';
import { layoutGrid } from '@airspec/airmark-engine';
import type { GridItem } from '@airspec/airmark-engine';
import type { AirComponentProps } from '../componentRegistry';
import { GridContextProvider } from '../GridContext';
import LayoutWalker from '../LayoutWalker';
import type { AirspecComponent, AirspecContainerComponent } from '../../../../../types/airspec';

const GAP_PX: Record<string, number> = { none: 0, small: 8, medium: 16, large: 24 };

export default function AirGrid({ component }: AirComponentProps) {
  const c = component as unknown as AirspecContainerComponent;
  const gap = c.gap ?? 'medium';
  const gapValue = GAP_PX[gap] ?? GAP_PX.medium;
  const children = c.children ?? [];

  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w && w > 0) setContainerWidth(Math.round(w));
    });
    ro.observe(el);
    setContainerWidth(Math.round(el.clientWidth || 0));
    return () => ro.disconnect();
  }, []);

  const items: GridItem[] = children.map((child: AirspecComponent, idx: number) => ({
    id: child.id ?? `grid-child-${idx}`,
    span: child.grid?.span ?? 12,
    spanTablet: child.grid?.spanTablet,
    spanMobile: child.grid?.spanMobile,
    minHeight: child.grid?.minHeight,
    maxHeight: child.grid?.maxHeight,
  }));

  const { boxes, totalHeight } = containerWidth > 0
    ? layoutGrid(items, { containerWidth, gap: gapValue })
    : { boxes: [], totalHeight: 0 };

  const seamless = gap === 'none';
  const totalCols = items.length;

  if (containerWidth === 0) {
    return (
      <div ref={containerRef} style={{ display: 'grid', gridTemplateColumns: 'repeat(12, minmax(0, 1fr))', gap: `${gapValue}px` }}>
        {children.map((child: AirspecComponent, idx: number) => {
          const span = child.grid?.span ?? 12;
          return (
            <GridContextProvider key={child.id ?? idx} value={{ seamless, colIndex: idx, totalCols }}>
              <div style={{ gridColumn: `span ${span} / span ${span}` }}>
                <LayoutWalker node={child} />
              </div>
            </GridContextProvider>
          );
        })}
      </div>
    );
  }

  return (
    <div ref={containerRef} style={{ position: 'relative', height: `${totalHeight}px` }}>
      {boxes.map((box, idx) => {
        const child = children[idx];
        if (!child) return null;
        const align = child.grid?.align;
        return (
          <GridContextProvider key={child.id ?? idx} value={{ seamless, colIndex: idx, totalCols }}>
            <div
              style={{
                position: 'absolute',
                left: `${box.x}px`,
                top: `${box.y}px`,
                width: `${box.width}px`,
                height: `${box.height}px`,
                alignSelf: align,
              }}
            >
              <LayoutWalker node={child} />
            </div>
          </GridContextProvider>
        );
      })}
    </div>
  );
}

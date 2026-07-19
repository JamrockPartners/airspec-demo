import type { AirComponentProps } from '../componentRegistry';
import type { AirspecHeadingComponent } from '../../../../../types/airspec';

export default function AirHeading({ component }: AirComponentProps) {
  const c = component as unknown as AirspecHeadingComponent;
  const text = c.text;
  const level = c.level ?? 1;

  const styles: Record<number, string> = {
    1: 'text-2xl font-bold text-slate-900',
    2: 'text-xl font-semibold text-slate-800',
    3: 'text-lg font-medium text-slate-700',
    4: 'text-base font-medium text-slate-700',
  };

  const className = styles[level] ?? styles[1];

  if (level === 1) return <h1 className={className}>{text}</h1>;
  if (level === 2) return <h2 className={className}>{text}</h2>;
  if (level === 3) return <h3 className={className}>{text}</h3>;
  return <h4 className={className}>{text}</h4>;
}

import type { AirComponentProps } from '../componentRegistry';
import type { AirspecTextComponent } from '../../../../../types/airspec';

export default function AirText({ component }: AirComponentProps) {
  const c = component as unknown as AirspecTextComponent;
  return (
    <p className="text-sm text-slate-600 leading-relaxed">{c.text}</p>
  );
}

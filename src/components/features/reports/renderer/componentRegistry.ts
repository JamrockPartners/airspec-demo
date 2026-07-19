import type { AirspecComponent } from '../../../../types/airspec';
import AirStack from './components/AirStack';
import AirGrid from './components/AirGrid';
import AirSection from './components/AirSection';
import AirFilterBar from './components/AirFilterBar';
import AirHeading from './components/AirHeading';
import AirText from './components/AirText';
import AirDivider from './components/AirDivider';
import AirMetric from './components/AirMetric';
import AirChart from './components/AirChart';
import AirTable from './components/AirTable';
import AirEmptyState from './components/AirEmptyState';

export interface AirComponentProps {
  component: AirspecComponent;
}

export const componentRegistry: Record<
  string,
  React.ComponentType<AirComponentProps>
> = {
  stack: AirStack,
  grid: AirGrid,
  section: AirSection,
  filterBar: AirFilterBar,
  heading: AirHeading,
  text: AirText,
  divider: AirDivider,
  metric: AirMetric,
  chart: AirChart,
  table: AirTable,
  emptyState: AirEmptyState,
};

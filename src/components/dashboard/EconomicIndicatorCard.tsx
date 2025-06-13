import { Landmark, Percent } from 'lucide-react';
import DashboardCard from './DashboardCard';

// Placeholder data for demonstration
const economicData = {
  indicatorName: 'Eurozone Interest Rate',
  value: '1.50%',
  previous: '1.25%',
  impact: 'Neutral to Positive', // Could be Positive, Negative, Neutral
  source: 'TradingEconomics API'
};

export default function EconomicIndicatorCard() {
  return (
    <DashboardCard title="Economic Indicators" icon={Landmark}>
      <div className="space-y-3">
        <h3 className="text-md font-medium text-foreground">{economicData.indicatorName}</h3>
        <div className="flex items-baseline gap-2">
          <Percent className="h-8 w-8 text-primary" />
          <p className="text-3xl font-bold text-primary">{economicData.value}</p>
        </div>
        <div className="text-sm text-muted-foreground">
          <p>Previous: {economicData.previous}</p>
          <p>Potential Impact: <span className="font-medium text-foreground">{economicData.impact}</span></p>
        </div>
        <p className="text-xs text-muted-foreground mt-1 text-center">Data from {economicData.source}</p>
      </div>
    </DashboardCard>
  );
}

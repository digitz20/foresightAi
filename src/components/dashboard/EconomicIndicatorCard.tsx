
'use client';

import { Landmark, Percent } from 'lucide-react';
import DashboardCard from './DashboardCard';
import { useEffect, useState } from 'react';

type EconomicData = {
  indicatorName: string;
  value: string;
  previous: string;
  impact: string;
  source: string;
};

const defaultData: EconomicData = {
  indicatorName: 'Eurozone Interest Rate',
  value: '1.50%',
  previous: '1.25%',
  impact: 'Neutral to Positive',
  source: 'Placeholder API'
};

type EconomicIndicatorCardProps = {
  initialData?: EconomicData;
};

export default function EconomicIndicatorCard({ initialData }: EconomicIndicatorCardProps) {
  const [economicData, setEconomicData] = useState<EconomicData>(initialData || defaultData);

  useEffect(() => {
    if (initialData) {
      setEconomicData(initialData);
    } else {
      setEconomicData(defaultData); // Fallback
    }
  }, [initialData]);

  return (
    <DashboardCard title="Economic Indicators" icon={Landmark}>
      <div className="space-y-3">
        <h3 className="text-md font-medium text-foreground">{economicData.indicatorName || 'N/A'}</h3>
        <div className="flex items-baseline gap-2">
          <Percent className="h-8 w-8 text-primary" />
          <p className="text-3xl font-bold text-primary">{economicData.value || 'N/A'}</p>
        </div>
        <div className="text-sm text-muted-foreground">
          <p>Previous: {economicData.previous || 'N/A'}</p>
          <p>Potential Impact: <span className="font-medium text-foreground">{economicData.impact || 'N/A'}</span></p>
        </div>
        <p className="text-xs text-muted-foreground mt-1 text-center">Data from {economicData.source || 'N/A'}</p>
      </div>
    </DashboardCard>
  );
}

    

'use client';

import { Landmark, AlertTriangle, InfoIcon, Activity } from 'lucide-react'; 
import DashboardCard from './DashboardCard';
import { useEffect, useState } from 'react';
// Import EconomicData type from the action to ensure consistency
import type { EconomicData as FetchedEconomicData } from '@/app/actions/fetch-economic-data';

// Use FetchedEconomicData as the type for initialData and economicData state
const defaultData: FetchedEconomicData = {
  indicatorName: 'Economic Data',
  value: 'N/A',
  sourceProvider: 'Unknown',
};

type EconomicIndicatorCardProps = {
  initialData?: FetchedEconomicData;
};

export default function EconomicIndicatorCard({ initialData }: EconomicIndicatorCardProps) {
  const [economicData, setEconomicData] = useState<FetchedEconomicData>(initialData || defaultData);

  useEffect(() => {
    if (initialData) {
      setEconomicData(initialData);
    } else {
      setEconomicData(defaultData);
    }
  }, [initialData]);

  const formatLastUpdated = (dateString?: string) => {
    if (!dateString) return 'N/A';
    if (/^\d+$/.test(dateString) && !isNaN(Number(dateString))) {
      try {
        return new Date(Number(dateString) * 1000).toLocaleString();
      } catch (e) { /* fallback */ }
    }
    try {
      const date = new Date(dateString);
      if (!isNaN(date.getTime())) {
        return date.toLocaleString();
      }
    } catch (e) { /* fallback */ }
    return dateString; 
  };

  const dataSourceText = economicData.sourceProvider && economicData.sourceProvider !== 'Unknown' 
    ? `Source: ${economicData.sourceProvider}` 
    : 'Source unknown';

  if (economicData.error && economicData.value === 'N/A') {
    return (
      <DashboardCard title={economicData.indicatorName || "Economic Indicators"} icon={Landmark}>
        <div className="flex flex-col items-center justify-center text-destructive p-4 gap-2">
          <AlertTriangle className="h-8 w-8" />
          <p className="font-semibold text-center">Economic Data Error</p>
          <p className="text-sm text-center">{economicData.error.length > 150 ? economicData.error.substring(0,150) + '...' : economicData.error}</p>
          {economicData.sourceProvider && <p className="text-xs text-muted-foreground mt-1">{dataSourceText}</p>}
        </div>
      </DashboardCard>
    );
  }
  
  if (economicData.value === 'Refer to Market Overview') { 
     return (
      <DashboardCard title={economicData.indicatorName || "Economic Data"} icon={Landmark}>
        <div className="flex flex-col items-center justify-center text-muted-foreground p-4 gap-2">
          <InfoIcon className="h-8 w-8" />
          <p className="text-sm text-center">{economicData.value}</p>
          {economicData.error && <p className="text-xs text-destructive mt-1 text-center">{economicData.error}</p>}
          {economicData.sourceProvider && <p className="text-xs mt-1">{dataSourceText}</p>}
        </div>
      </DashboardCard>
    );
  }

  return (
    <DashboardCard title={economicData.indicatorName || "Economic Data"} icon={Landmark}>
      <div className="space-y-3">
        <div className="flex items-baseline gap-2">
          <Activity className="h-8 w-8 text-primary opacity-70" /> 
          <p className="text-3xl font-bold text-primary">
            {economicData.value || 'N/A'}
            {economicData.comparisonCurrency && economicData.value !== 'N/A' && (
              <span className="text-lg ml-1 text-muted-foreground">{economicData.comparisonCurrency}</span>
            )}
          </p>
        </div>
         {economicData.error && (
            <p className="text-xs text-destructive mt-1"><AlertTriangle className="inline h-3 w-3 mr-1" />{economicData.error}</p>
        )}
        <div className="text-xs text-muted-foreground space-y-1">
          {economicData.lastUpdated && (
            <p>Last Updated: {formatLastUpdated(economicData.lastUpdated)}</p>
          )}
          <p>{dataSourceText}</p>
        </div>
      </div>
    </DashboardCard>
  );
}

// Re-export the type from the action file if it's defined there and needed by page.tsx
// However, page.tsx already imports it as FetchedEconomicIndicatorData from the card itself.
// To make it cleaner, page.tsx should import EconomicData directly from the action file.
// For now, this card internally uses FetchedEconomicData type.
export type { FetchedEconomicData as EconomicIndicatorData };


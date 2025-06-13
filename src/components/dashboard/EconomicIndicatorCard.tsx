
'use client';

import { Landmark, AlertTriangle, InfoIcon, Activity } from 'lucide-react'; // Added Activity for generic icon
import DashboardCard from './DashboardCard';
import { useEffect, useState } from 'react';

export type EconomicIndicatorData = {
  indicatorName?: string;
  value?: string;
  comparisonCurrency?: string;
  lastUpdated?: string; // Can be Unix timestamp string or formatted date
  source?: string;
  error?: string;
};

const defaultData: EconomicIndicatorData = {
  indicatorName: 'Economic Data',
  value: 'N/A',
  source: 'N/A',
};

type EconomicIndicatorCardProps = {
  initialData?: EconomicIndicatorData;
};

export default function EconomicIndicatorCard({ initialData }: EconomicIndicatorCardProps) {
  const [economicData, setEconomicData] = useState<EconomicIndicatorData>(initialData || defaultData);

  useEffect(() => {
    if (initialData) {
      setEconomicData(initialData);
    } else {
      setEconomicData(defaultData);
    }
  }, [initialData]);

  const formatLastUpdated = (dateString?: string) => {
    if (!dateString) return 'N/A';
    // Check if it's a Unix timestamp (numeric string)
    if (/^\d+$/.test(dateString) && !isNaN(Number(dateString))) {
      try {
        return new Date(Number(dateString) * 1000).toLocaleString();
      } catch (e) { /* fallback */ }
    }
    // Try parsing as a date string
    try {
      const date = new Date(dateString);
      if (!isNaN(date.getTime())) {
        return date.toLocaleString();
      }
    } catch (e) { /* fallback */ }
    return dateString; // if parsing fails, show original
  };

  if (economicData.error && economicData.value === 'N/A') {
    return (
      <DashboardCard title={economicData.indicatorName || "Economic Indicators"} icon={Landmark}>
        <div className="flex flex-col items-center justify-center text-destructive p-4 gap-2">
          <AlertTriangle className="h-8 w-8" />
          <p className="font-semibold text-center">Economic Data Error</p>
          <p className="text-sm text-center">{economicData.error.length > 150 ? economicData.error.substring(0,150) + '...' : economicData.error}</p>
          {economicData.source && <p className="text-xs text-muted-foreground mt-1">Source: {economicData.source}</p>}
        </div>
      </DashboardCard>
    );
  }
  
  if (economicData.value === 'Refer to Market Overview') { // This case might be from old API, can be removed if not relevant
     return (
      <DashboardCard title={economicData.indicatorName || "Economic Data"} icon={Landmark}>
        <div className="flex flex-col items-center justify-center text-muted-foreground p-4 gap-2">
          <InfoIcon className="h-8 w-8" />
          <p className="text-sm text-center">{economicData.value}</p>
          {economicData.error && <p className="text-xs text-destructive mt-1 text-center">{economicData.error}</p>}
          {economicData.source && <p className="text-xs mt-1">Source: {economicData.source}</p>}
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
          <p>Source: {economicData.source || 'N/A'}</p>
        </div>
      </div>
    </DashboardCard>
  );
}


'use client';

import { Gauge, BarChartHorizontalBig, Activity, AlertTriangle } from 'lucide-react';
import DashboardCard from './DashboardCard';
import { Progress } from "@/components/ui/progress";
import { Badge } from '@/components/ui/badge';
import { useEffect, useState } from 'react';

// Export types for use in page.tsx
export type RsiData = { value?: number; status: string };
export type MacdData = { value?: number; signal?: number; histogram?: number; status: string };
export type TechnicalIndicatorsData = {
  rsi: RsiData;
  macd: MacdData;
  error?: string; // To display API errors for the entire technical indicators block
  sourceProvider?: 'Polygon.io' | 'Finnhub.io' | 'TwelveData' | 'Unknown'; // Added sourceProvider
};

const defaultData: TechnicalIndicatorsData = {
  rsi: { value: undefined, status: 'N/A' },
  macd: { value: undefined, signal: undefined, histogram: undefined, status: 'N/A' },
  sourceProvider: 'Unknown',
};

type TechnicalIndicatorsCardProps = {
  initialData?: TechnicalIndicatorsData;
};

export default function TechnicalIndicatorsCard({ initialData }: TechnicalIndicatorsCardProps) {
  const [indicators, setIndicators] = useState<TechnicalIndicatorsData>(initialData || defaultData);

  useEffect(() => {
    if (initialData) {
      setIndicators(initialData);
    } else {
      setIndicators(defaultData);
    }
  }, [initialData]);

  const getRsiStatusColor = (value?: number) => {
    if (value === undefined) return 'text-muted-foreground';
    if (value < 30) return 'text-accent'; 
    if (value > 70) return 'text-destructive'; 
    return 'text-muted-foreground'; 
  };

  const getMacdStatusColor = (status?: string) => {
    if (!status || status === 'N/A') return 'text-muted-foreground';
    if (status.toLowerCase().includes('uptrend') || status.toLowerCase().includes('bullish')) return 'text-accent';
    if (status.toLowerCase().includes('downtrend') || status.toLowerCase().includes('bearish')) return 'text-destructive';
    return 'text-muted-foreground';
  }

  const dataSourceText = indicators.sourceProvider && indicators.sourceProvider !== 'Unknown' 
    ? `Data from ${indicators.sourceProvider}` 
    : 'Data source unknown';

  if (indicators.error && indicators.rsi.value === undefined && indicators.macd.value === undefined) {
    return (
      <DashboardCard title="Technical Indicators" icon={Activity}>
        <div className="flex flex-col items-center justify-center text-destructive p-4 gap-2">
          <AlertTriangle className="h-8 w-8" />
          <p className="font-semibold text-center">Indicators Unavailable</p>
          <p className="text-sm text-center">{indicators.error.length > 100 ? indicators.error.substring(0,100) + '...' : indicators.error}</p>
          <p className="text-xs text-muted-foreground mt-1">{dataSourceText}</p>
        </div>
      </DashboardCard>
    );
  }

  return (
    <DashboardCard title="Technical Indicators" icon={Activity}>
      <div className="space-y-6">
        <div>
          <div className="flex justify-between items-center mb-1">
            <h4 className="text-md font-medium text-foreground flex items-center gap-2">
              <Gauge className="h-5 w-5 text-primary/80" />
              RSI (Relative Strength Index)
            </h4>
            <Badge variant="outline" className={getRsiStatusColor(indicators.rsi.value)}>
              {indicators.rsi.status}
            </Badge>
          </div>
          {indicators.rsi.value !== undefined ? (
            <>
              <Progress value={indicators.rsi.value} className="h-3 [&>div]:bg-primary" />
              <div className="flex justify-between text-xs text-muted-foreground mt-1">
                <span>0</span>
                <span className={getRsiStatusColor(indicators.rsi.value)}>{indicators.rsi.value.toFixed(2)}</span>
                <span>100</span>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-2">RSI data unavailable.</p>
          )}
           <p className="text-xs text-muted-foreground mt-1 text-center">{dataSourceText}</p>
        </div>

        <div>
          <div className="flex justify-between items-center mb-2">
            <h4 className="text-md font-medium text-foreground flex items-center gap-2">
              <BarChartHorizontalBig className="h-5 w-5 text-primary/80" />
              MACD
            </h4>
            <Badge variant="outline" className={getMacdStatusColor(indicators.macd.status)}>
              {indicators.macd.status}
            </Badge>
          </div>
          {indicators.macd.value !== undefined && indicators.macd.signal !== undefined && indicators.macd.histogram !== undefined ? (
            <div className="grid grid-cols-3 gap-2 text-sm">
              <div className="bg-muted/30 p-2 rounded-md text-center">
                <p className="text-xs text-muted-foreground">Value</p>
                <p className="font-semibold text-foreground">{(indicators.macd.value || 0).toFixed(4)}</p>
              </div>
              <div className="bg-muted/30 p-2 rounded-md text-center">
                <p className="text-xs text-muted-foreground">Signal</p>
                <p className="font-semibold text-foreground">{(indicators.macd.signal || 0).toFixed(4)}</p>
              </div>
              <div className="bg-muted/30 p-2 rounded-md text-center">
                <p className="text-xs text-muted-foreground">Histogram</p>
                <p className="font-semibold text-foreground">{(indicators.macd.histogram || 0).toFixed(4)}</p>
              </div>
            </div>
          ) : (
             <p className="text-sm text-muted-foreground text-center py-2">MACD data unavailable.</p>
          )}
          <p className="text-xs text-muted-foreground mt-1 text-center">{dataSourceText}</p>
        </div>
        {indicators.error && (indicators.rsi.value !== undefined || indicators.macd.value !== undefined) && (
             <p className="text-xs text-destructive mt-1 text-center"><AlertTriangle className="inline h-3 w-3 mr-1" />Error: {indicators.error}</p>
        )}
      </div>
    </DashboardCard>
  );
}

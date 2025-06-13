
'use client';

import { DollarSign, AlertTriangle, AreaChart, Zap, PowerOff, Store, ClockIcon } from 'lucide-react';
import DashboardCard from './DashboardCard';
import { useEffect, useState } from 'react';
import type { MarketData, HistoricalDataPoint } from '@/app/actions/fetch-market-data';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { useTheme } from 'next-themes'; 
import { format, fromUnixTime, differenceInMinutes } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const defaultData: MarketData = {
  assetName: 'EUR/USD',
  price: undefined,
  timeframe: '15min',
  sourceProvider: 'Unknown',
  historical: [],
  marketStatus: 'unknown',
};

type MarketOverviewCardProps = {
  initialData?: MarketData;
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-background/80 backdrop-blur-sm p-2 border border-border shadow-lg rounded-md">
        <p className="label text-sm text-foreground">{`${label}`}</p>
        <p className="intro text-sm text-primary">{`Price: ${payload[0].value.toFixed(4)}`}</p>
      </div>
    );
  }
  return null;
};


export default function MarketOverviewCard({ initialData }: MarketOverviewCardProps) {
  const [currentMarketData, setCurrentMarketData] = useState<MarketData>(initialData || defaultData);
  const [clientMounted, setClientMounted] = useState(false);
  const { resolvedTheme } = useTheme(); 

  useEffect(() => {
    setClientMounted(true); 
    if (initialData) {
      setCurrentMarketData(initialData);
    } else {
      setCurrentMarketData(prev => ({
        ...defaultData,
        assetName: prev?.assetName || defaultData.assetName,
        timeframe: prev?.timeframe || defaultData.timeframe,
        sourceProvider: prev?.sourceProvider || 'Unknown',
        historical: prev?.historical || [],
        marketStatus: prev?.marketStatus || 'unknown',
        lastTradeTimestamp: prev?.lastTradeTimestamp,
      }));
    }
  }, [initialData]);

  const formatPrice = (value: number | undefined, pair: string | undefined) => {
    if (value === undefined || value === null || isNaN(value) || !pair) return 'N/A';
    const isJpyPair = pair.includes("JPY");
    const isCrypto = pair.includes("BTC") || pair.includes("ETH"); // Simple check
    const isXauXagCl = pair.includes("XAU") || pair.includes("XAG") || pair.toLowerCase().includes("oil");

    if (isJpyPair || isXauXagCl || isCrypto) {
      return value.toFixed(2);
    }
    return value.toFixed(4);
  }

  const dataSourceText = currentMarketData.sourceProvider && currentMarketData.sourceProvider !== 'Unknown'
    ? `Data from ${currentMarketData.sourceProvider}`
    : 'Data source unknown';

  const chartStrokeColor = resolvedTheme === 'dark' ? 'hsl(var(--primary))' : 'hsl(var(--primary))';
  const gridStrokeColor = resolvedTheme === 'dark' ? 'hsl(var(--border) / 0.5)' : 'hsl(var(--border) / 0.7)';
  const tickFillColor = resolvedTheme === 'dark' ? 'hsl(var(--muted-foreground))' : 'hsl(var(--muted-foreground))';

  const renderMarketStatus = () => {
    if (!currentMarketData.marketStatus || currentMarketData.marketStatus === 'unknown') {
      if (currentMarketData.lastTradeTimestamp) {
        const lastTradeDate = fromUnixTime(currentMarketData.lastTradeTimestamp / 1000);
        const minutesAgo = differenceInMinutes(new Date(), lastTradeDate);
        let stalenessMessage = `Last data: ${format(lastTradeDate, 'MMM dd, HH:mm')}`;
        if (minutesAgo > 60 * 24) { // More than a day old
            stalenessMessage += ` (over a day ago)`;
        } else if (minutesAgo > 30 && currentMarketData.sourceProvider !== 'Polygon.io') { // Polygon provides explicit status
            stalenessMessage += ` (may be stale)`;
        }
        return (
          <Badge variant="outline" className="text-xs mt-1">
            <ClockIcon className="h-3 w-3 mr-1" />
            {stalenessMessage}
          </Badge>
        );
      }
      return null;
    }

    let StatusIcon = Store;
    let statusText = currentMarketData.marketStatus.charAt(0).toUpperCase() + currentMarketData.marketStatus.slice(1);
    let badgeColor = "bg-muted/50 text-muted-foreground border-muted";

    switch (currentMarketData.marketStatus) {
      case 'open':
        StatusIcon = Zap;
        badgeColor = "bg-green-500/20 text-green-400 border-green-500/50";
        break;
      case 'closed':
        StatusIcon = PowerOff;
        badgeColor = "bg-red-500/20 text-red-400 border-red-500/50";
        break;
      case 'pre-market':
      case 'post-market':
      case 'extended-hours':
        StatusIcon = ClockIcon;
        badgeColor = "bg-yellow-500/20 text-yellow-400 border-yellow-500/50";
        break;
    }

    return (
      <Badge variant="outline" className={cn("text-xs mt-1", badgeColor)}>
        <StatusIcon className="h-3 w-3 mr-1.5" />
        Market: {statusText}
      </Badge>
    );
  };
  
  const renderChart = () => {
    if (!clientMounted) { 
        return <div className="aspect-[16/9] bg-muted/30 rounded-md flex items-center justify-center"><p className="text-xs text-muted-foreground">Loading chart...</p></div>;
    }
    if (!currentMarketData.historical || currentMarketData.historical.length === 0) {
      return (
        <div className="aspect-[16/9] bg-muted/30 rounded-md flex items-center justify-center">
          <div className="text-center">
            <AreaChart size={32} className="mx-auto text-muted-foreground opacity-50 mb-2" />
            <p className="text-xs text-muted-foreground">Historical price data not available.</p>
            {currentMarketData.sourceProvider && <p className="text-xxs text-muted-foreground/80 mt-1">Attempted: {currentMarketData.sourceProvider}</p>}
          </div>
        </div>
      );
    }
    return (
      <ResponsiveContainer width="100%" height={200} className="aspect-[16/9]">
        <LineChart data={currentMarketData.historical} margin={{ top: 5, right: 20, left: -25, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={gridStrokeColor} />
          <XAxis 
            dataKey="date" 
            fontSize={10} 
            tick={{ fill: tickFillColor }} 
            axisLine={{ stroke: gridStrokeColor }} 
            tickLine={{ stroke: gridStrokeColor }}
          />
          <YAxis 
            fontSize={10} 
            tickFormatter={(value) => value.toFixed(currentMarketData.assetName?.includes("JPY") ? 2 : 4)} 
            tick={{ fill: tickFillColor }} 
            axisLine={{ stroke: gridStrokeColor }} 
            tickLine={{ stroke: gridStrokeColor }}
            domain={['dataMin', 'dataMax']}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ stroke: chartStrokeColor, strokeWidth: 1, strokeDasharray: "3 3" }}/>
          <Line type="monotone" dataKey="price" stroke={chartStrokeColor} strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    );
  };

  return (
    <DashboardCard title="Market Overview" icon={DollarSign}>
      <div className="space-y-4">
        <div>
          <div className="flex justify-between items-start">
            <h3 className="text-lg font-medium text-foreground">{currentMarketData.assetName || 'N/A'}</h3>
            {renderMarketStatus()}
          </div>
          {currentMarketData.error && currentMarketData.price === undefined ? (
            <div className="flex items-center gap-2 text-destructive mt-1">
              <AlertTriangle size={20} />
              <p className="text-sm">Price unavailable: <span className="text-xs">{currentMarketData.error.length > 50 ? currentMarketData.error.substring(0,50) + '...' : currentMarketData.error }</span></p>
            </div>
          ) : (
            <>
              <p className="text-3xl font-bold text-primary">
                {formatPrice(currentMarketData.price, currentMarketData.assetName)}
              </p>
            </>
          )}
           {currentMarketData.price !== undefined && <p className="text-xs text-muted-foreground mt-1">{dataSourceText}</p>}
        </div>
        <div className="mt-4">
          <h4 className="text-sm font-medium text-muted-foreground mb-2">Price Trend (Last ~60 points)</h4>
          {renderChart()}
        </div>
         {currentMarketData.error && currentMarketData.price !== undefined && ( // Show error if data is partial
            <p className="text-xs text-destructive mt-1"><AlertTriangle className="inline h-3 w-3 mr-1" />Partial error: {currentMarketData.error}</p>
        )}
      </div>
    </DashboardCard>
  );
}

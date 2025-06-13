
'use client';

import { DollarSign, AlertTriangle, AreaChart } from 'lucide-react';
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
import { useTheme } from 'next-themes'; // To get theme for chart colors

const defaultData: MarketData = {
  assetName: 'EUR/USD',
  price: undefined,
  timeframe: '15min',
  sourceProvider: 'Unknown',
  historical: [],
};

type MarketOverviewCardProps = {
  initialData?: MarketData;
};

// Custom Tooltip for Recharts
const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-background/80 backdrop-blur-sm p-2 border border-border shadow-lg rounded-md">
        <p className="label text-sm text-foreground">{`${label}`}</p>
        <p className="intro text-sm text-primary">{`Price: ${payload[0].value.toFixed(4)}`}</p> {/* Adjust toFixed as needed */}
      </div>
    );
  }
  return null;
};


export default function MarketOverviewCard({ initialData }: MarketOverviewCardProps) {
  const [currentMarketData, setCurrentMarketData] = useState<MarketData>(initialData || defaultData);
  const [clientMounted, setClientMounted] = useState(false);
  const { resolvedTheme } = useTheme(); // Use resolvedTheme for reliable dark/light mode

  useEffect(() => {
    setClientMounted(true); // Ensure client-side rendering for theme
    if (initialData) {
      setCurrentMarketData(initialData);
    } else {
      setCurrentMarketData(prev => ({
        ...defaultData,
        assetName: prev?.assetName || defaultData.assetName,
        timeframe: prev?.timeframe || defaultData.timeframe,
        sourceProvider: prev?.sourceProvider || 'Unknown',
        historical: prev?.historical || [],
      }));
    }
  }, [initialData]);

  const formatPrice = (value: number | undefined, pair: string | undefined) => {
    if (value === undefined || value === null || isNaN(value) || !pair) return 'N/A';
    const isJpyPair = pair.includes("JPY");
    const isCrypto = pair.includes("BTC") || pair.includes("ETH");
    const isXauXagCl = pair.includes("XAU") || pair.includes("XAG") || pair.toLowerCase().includes("oil");

    if (isJpyPair || isXauXagCl || isCrypto) {
      return value.toFixed(2);
    }
    return value.toFixed(4);
  }

  const dataSourceText = currentMarketData.sourceProvider && currentMarketData.sourceProvider !== 'Unknown'
    ? `Data from ${currentMarketData.sourceProvider}`
    : 'Data source unknown';

  const chartStrokeColor = resolvedTheme === 'dark' ? 'hsl(var(--primary))' : 'hsl(var(--primary))'; // Example: use primary color
  const gridStrokeColor = resolvedTheme === 'dark' ? 'hsl(var(--border) / 0.5)' : 'hsl(var(--border) / 0.7)';
  const tickFillColor = resolvedTheme === 'dark' ? 'hsl(var(--muted-foreground))' : 'hsl(var(--muted-foreground))';


  const renderChart = () => {
    if (!clientMounted) { // Prevents SSR/hydration mismatch for theme-dependent chart
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
        <LineChart data={currentMarketData.historical} margin={{ top: 5, right: 20, left: -25, bottom: 5 }}> {/* Adjusted left margin */}
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
          <h3 className="text-lg font-medium text-foreground">{currentMarketData.assetName || 'N/A'}</h3>
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
          <h4 className="text-sm font-medium text-muted-foreground mb-2">Price Trend (Last ~60 Days)</h4>
          {renderChart()}
        </div>
         {currentMarketData.error && currentMarketData.price !== undefined && (
            <p className="text-xs text-destructive mt-1"><AlertTriangle className="inline h-3 w-3 mr-1" />Partial error: {currentMarketData.error}</p>
        )}
      </div>
    </DashboardCard>
  );
}

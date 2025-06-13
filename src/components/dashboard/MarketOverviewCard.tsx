
'use client';

import { DollarSign, AlertTriangle } from 'lucide-react';
import DashboardCard from './DashboardCard';
import Image from 'next/image';
import { useEffect, useState } from 'react';

type MarketOverviewData = {
  pair: string;
  value?: number; // Value can be undefined if API fails
  change: string;
  isPositive: boolean;
  timeframe: string; 
  error?: string; // To display API errors
};

const defaultData: MarketOverviewData = {
  pair: 'EUR/USD',
  value: undefined,
  change: 'N/A',
  isPositive: false,
  timeframe: '15min',
};

type MarketOverviewCardProps = {
  initialData?: MarketOverviewData;
};

export default function MarketOverviewCard({ initialData }: MarketOverviewCardProps) {
  const [currentPrice, setCurrentPrice] = useState<MarketOverviewData>(initialData || defaultData);

  useEffect(() => {
    if (initialData) {
      setCurrentPrice(initialData);
    } else {
      setCurrentPrice(prev => ({ ...defaultData, pair: prev?.pair || defaultData.pair, timeframe: prev?.timeframe || defaultData.timeframe }));
    }
  }, [initialData]);

  const formatPrice = (value: number | undefined, pair: string) => {
    if (value === undefined || value === null || isNaN(value)) return 'N/A';
    const isJpyPair = pair.includes("JPY");
    const isCrypto = pair.includes("BTC") || pair.includes("ETH"); // Assuming common crypto
    const isXauXagCl = pair.includes("XAU") || pair.includes("XAG") || pair.includes("CL");

    if (isJpyPair || isXauXagCl || isCrypto) { // JPY pairs, Gold, Silver, Oil, Bitcoin usually have 2 decimal places for price
      return value.toFixed(2);
    }
    return value.toFixed(4); // Most other FX pairs
  }

  return (
    <DashboardCard title="Market Overview" icon={DollarSign}>
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-medium text-foreground">{currentPrice.pair}</h3>
          {currentPrice.error && currentPrice.value === undefined ? (
            <div className="flex items-center gap-2 text-destructive mt-1">
              <AlertTriangle size={20} />
              <p className="text-sm">Price unavailable: <span className="text-xs">{currentPrice.error.length > 50 ? currentPrice.error.substring(0,50) + '...' : currentPrice.error }</span></p>
            </div>
          ) : (
            <>
              <p className="text-3xl font-bold text-primary">
                {formatPrice(currentPrice.value, currentPrice.pair)}
              </p>
              <p className={`text-sm ${currentPrice.isPositive ? 'text-accent' : 'text-destructive'}`}>
                {currentPrice.change}
              </p>
            </>
          )}
        </div>
        <div className="mt-4">
          <h4 className="text-sm font-medium text-muted-foreground mb-2">Price Trend ({currentPrice.timeframe || 'N/A'})</h4>
          <div className="aspect-[16/9] bg-muted/50 rounded-md overflow-hidden flex items-center justify-center">
            <Image 
              src="https://placehold.co/600x300.png" 
              alt="Price chart placeholder" 
              width={600} 
              height={300}
              className="object-cover w-full h-full"
              data-ai-hint="stock chart"
            />
          </div>
          <p className="text-xs text-center text-muted-foreground mt-1">Placeholder chart. Real data from Twelve Data.</p>
        </div>
      </div>
    </DashboardCard>
  );
}


'use client';

import { DollarSign } from 'lucide-react';
import DashboardCard from './DashboardCard';
import Image from 'next/image';
import { useEffect, useState } from 'react';

type MarketOverviewData = {
  pair: string;
  value: number;
  change: string;
  isPositive: boolean;
  timeframe: string; 
};

const defaultData: MarketOverviewData = {
  pair: 'EUR/USD',
  value: 1.0853,
  change: '+0.0012 (0.11%)',
  isPositive: true,
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
      // Fallback if initialData is not provided or becomes undefined
      setCurrentPrice(prev => ({ ...defaultData, pair: prev?.pair || defaultData.pair, timeframe: prev?.timeframe || defaultData.timeframe }));
    }
  }, [initialData]);

  return (
    <DashboardCard title="Market Overview" icon={DollarSign}>
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-medium text-foreground">{currentPrice.pair}</h3>
          <p className="text-3xl font-bold text-primary">
            {currentPrice.pair && currentPrice.value !== undefined ? 
             currentPrice.value.toFixed(currentPrice.pair.includes("JPY") || currentPrice.pair.includes("XAU") || currentPrice.pair.includes("XAG") || currentPrice.pair.includes("OIL") ? 2 : (currentPrice.pair.includes("BTC") ? 2 : 4)) : 
             'N/A'}
          </p>
          <p className={`text-sm ${currentPrice.isPositive ? 'text-accent' : 'text-destructive'}`}>
            {currentPrice.change}
          </p>
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
          <p className="text-xs text-center text-muted-foreground mt-1">Placeholder chart</p>
        </div>
      </div>
    </DashboardCard>
  );
}

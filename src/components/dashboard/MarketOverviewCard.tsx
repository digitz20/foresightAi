
'use client';

import { DollarSign, AlertTriangle } from 'lucide-react';
import DashboardCard from './DashboardCard';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import type { MarketData } from '@/app/actions/fetch-market-data'; // Import MarketData type

// Use MarketData directly as the type for initialData and currentPrice
// MarketData already includes assetName (pair), value (price), and error, sourceProvider.
// 'change' and 'isPositive' are not directly provided by the backend, would need calculation or removal.
// For simplicity, I'll remove 'change' and 'isPositive' for now as they are not in MarketData.

const defaultData: MarketData = {
  assetName: 'EUR/USD', // This will be overridden by initialData
  price: undefined,
  timeframe: '15min', // This will be overridden by initialData
  sourceProvider: 'Unknown',
};

type MarketOverviewCardProps = {
  initialData?: MarketData; // Use MarketData type
};

export default function MarketOverviewCard({ initialData }: MarketOverviewCardProps) {
  const [currentMarketData, setCurrentMarketData] = useState<MarketData>(initialData || defaultData);

  useEffect(() => {
    if (initialData) {
      setCurrentMarketData(initialData);
    } else {
      setCurrentMarketData(prev => ({ 
        ...defaultData, 
        assetName: prev?.assetName || defaultData.assetName, 
        timeframe: prev?.timeframe || defaultData.timeframe,
        sourceProvider: prev?.sourceProvider || 'Unknown',
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
              {/* Removed change and isPositive as they are not in MarketData */}
            </>
          )}
           {currentMarketData.price !== undefined && <p className="text-xs text-muted-foreground mt-1">{dataSourceText}</p>}
        </div>
        <div className="mt-4">
          <h4 className="text-sm font-medium text-muted-foreground mb-2">Price Trend ({currentMarketData.timeframe || 'N/A'})</h4>
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
          <p className="text-xs text-center text-muted-foreground mt-1">Placeholder chart.</p>
        </div>
         {currentMarketData.error && currentMarketData.price !== undefined && (
            <p className="text-xs text-destructive mt-1"><AlertTriangle className="inline h-3 w-3 mr-1" />Partial error: {currentMarketData.error}</p>
        )}
      </div>
    </DashboardCard>
  );
}

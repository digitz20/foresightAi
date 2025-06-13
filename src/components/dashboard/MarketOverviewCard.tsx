import { DollarSign, LineChart } from 'lucide-react';
import DashboardCard from './DashboardCard';
import Image from 'next/image';

// Placeholder data for demonstration
const currentPrice = {
  pair: 'EUR/USD',
  value: 1.0853,
  change: '+0.0012 (0.11%)',
  isPositive: true,
};

export default function MarketOverviewCard() {
  return (
    <DashboardCard title="Market Overview" icon={DollarSign}>
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-medium text-foreground">{currentPrice.pair}</h3>
          <p className="text-3xl font-bold text-primary">{currentPrice.value.toFixed(4)}</p>
          <p className={`text-sm ${currentPrice.isPositive ? 'text-accent' : 'text-destructive'}`}>
            {currentPrice.change}
          </p>
        </div>
        <div className="mt-4">
          <h4 className="text-sm font-medium text-muted-foreground mb-2">Price Trend (15min)</h4>
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
          <p className="text-xs text-center text-muted-foreground mt-1">Placeholder chart from Alpha Vantage data</p>
        </div>
      </div>
    </DashboardCard>
  );
}

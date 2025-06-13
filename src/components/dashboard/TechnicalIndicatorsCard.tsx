import { Gauge, BarChartHorizontalBig, Activity } from 'lucide-react';
import DashboardCard from './DashboardCard';
import { Progress } from "@/components/ui/progress";
import { Badge } from '@/components/ui/badge';

// Placeholder data for demonstration
const indicators = {
  rsi: {
    value: 45,
    status: 'Neutral', // Could be Oversold, Neutral, Overbought
  },
  macd: {
    value: 0.0015,
    signal: 0.0010,
    histogram: 0.0005,
    status: 'Uptrend', // Could be Uptrend, Downtrend, Reversal
  },
};

export default function TechnicalIndicatorsCard() {
  const getRsiStatusColor = (value: number) => {
    if (value < 30) return 'text-accent'; // Oversold
    if (value > 70) return 'text-destructive'; // Overbought
    return 'text-muted-foreground'; // Neutral
  };

  const getMacdStatusColor = (status: string) => {
    if (status === 'Uptrend') return 'text-accent';
    if (status === 'Downtrend') return 'text-destructive';
    return 'text-muted-foreground';
  }

  return (
    <DashboardCard title="Technical Indicators" icon={Activity}>
      <div className="space-y-6">
        {/* RSI */}
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
          <Progress value={indicators.rsi.value} className="h-3 [&>div]:bg-primary" />
          <div className="flex justify-between text-xs text-muted-foreground mt-1">
            <span>0</span>
            <span className={getRsiStatusColor(indicators.rsi.value)}>{indicators.rsi.value}</span>
            <span>100</span>
          </div>
           <p className="text-xs text-muted-foreground mt-1 text-center">Data from TAAPI.io</p>
        </div>

        {/* MACD */}
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
          <div className="grid grid-cols-3 gap-2 text-sm">
            <div className="bg-muted/30 p-2 rounded-md text-center">
              <p className="text-xs text-muted-foreground">Value</p>
              <p className="font-semibold text-foreground">{indicators.macd.value.toFixed(4)}</p>
            </div>
            <div className="bg-muted/30 p-2 rounded-md text-center">
              <p className="text-xs text-muted-foreground">Signal</p>
              <p className="font-semibold text-foreground">{indicators.macd.signal.toFixed(4)}</p>
            </div>
            <div className="bg-muted/30 p-2 rounded-md text-center">
              <p className="text-xs text-muted-foreground">Histogram</p>
              <p className="font-semibold text-foreground">{indicators.macd.histogram.toFixed(4)}</p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-1 text-center">Data from TAAPI.io</p>
        </div>
      </div>
    </DashboardCard>
  );
}

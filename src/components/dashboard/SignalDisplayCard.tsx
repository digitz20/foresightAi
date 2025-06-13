import type { GenerateTradeRecommendationOutput } from '@/ai/flows/generate-trade-recommendation';
import { TrendingUp, TrendingDown, MinusCircle, AlertTriangle, ShieldAlert } from 'lucide-react';
import DashboardCard from './DashboardCard';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

type SignalDisplayCardProps = {
  data?: GenerateTradeRecommendationOutput;
  isLoading: boolean;
};

export default function SignalDisplayCard({ data, isLoading }: SignalDisplayCardProps) {
  const renderSignal = () => {
    if (isLoading) {
      return <p className="text-muted-foreground text-center py-8">Generating signal...</p>;
    }
    if (!data) {
      return (
        <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
          <AlertTriangle className="h-12 w-12 mb-2" />
          <p>Could not retrieve signal data.</p>
        </div>
      );
    }

    if (data.error) {
      return (
        <div className="flex flex-col items-center justify-center py-8 text-destructive">
          <ShieldAlert className="h-12 w-12 mb-2" />
          <p className="font-semibold">Signal Generation Error</p>
          <p className="text-sm text-center px-4">{data.error}</p>
          {data.recommendation === 'HOLD' && data.reason && !data.reason.startsWith('AI analysis failed:') && (
             <p className="mt-2 text-xs text-muted-foreground px-4">Defaulted to: {data.reason}</p>
          )}
        </div>
      );
    }

    const { recommendation, reason } = data;
    let IconComponent;
    let colorClass;
    let badgeVariant: "default" | "destructive" | "secondary" | "outline" = "secondary";

    switch (recommendation) {
      case 'BUY':
        IconComponent = TrendingUp;
        colorClass = 'text-accent'; // Cyan for BUY
        badgeVariant = 'default'; 
        break;
      case 'SELL':
        IconComponent = TrendingDown;
        colorClass = 'text-destructive'; // Red for SELL
        badgeVariant = 'destructive';
        break;
      case 'HOLD':
      default:
        IconComponent = MinusCircle;
        colorClass = 'text-muted-foreground'; // Gray for HOLD
        badgeVariant = 'secondary';
        break;
    }

    return (
      <div className="text-center py-4">
        <IconComponent className={cn("h-20 w-20 mx-auto mb-4", colorClass)} />
        <Badge variant={badgeVariant} className={cn("text-3xl font-bold px-6 py-3 rounded-lg", 
          recommendation === 'BUY' ? `bg-accent/20 border-accent text-accent-foreground ${colorClass}` : 
          recommendation === 'SELL' ? `bg-destructive/20 border-destructive text-destructive-foreground ${colorClass}` : 
          `bg-muted/20 border-muted text-muted-foreground ${colorClass}`)}>
          {recommendation}
        </Badge>
        <p className="mt-4 text-sm text-muted-foreground px-4">{reason}</p>
      </div>
    );
  };
  
  const titleClass = "text-3xl justify-center text-primary";

  return (
    <DashboardCard title="AI Trading Signal" className="bg-card/80 backdrop-blur-sm" contentClassName="p-0" titleClassName={titleClass}>
      {renderSignal()}
    </DashboardCard>
  );
}

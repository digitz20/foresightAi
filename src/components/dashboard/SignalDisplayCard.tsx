import type { GenerateTradeRecommendationOutput } from '@/ai/flows/generate-trade-recommendation';
import { TrendingUp, TrendingDown, MinusCircle, AlertTriangle } from 'lucide-react';
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
          <p>Could not retrieve signal.</p>
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
        badgeVariant = 'default'; // primary color badge for BUY, using accent for text
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
        <Badge variant={badgeVariant} className={cn("text-3xl font-bold px-6 py-3 rounded-lg", colorClass, 
          recommendation === 'BUY' ? 'bg-accent/20 border-accent text-accent-foreground' : 
          recommendation === 'SELL' ? 'bg-destructive/20 border-destructive text-destructive-foreground' : 
          'bg-muted/20 border-muted text-muted-foreground')}>
          {recommendation}
        </Badge>
        <p className="mt-4 text-sm text-muted-foreground px-4">{reason}</p>
      </div>
    );
  };
  
  // Custom class to make this card more prominent
  const titleClass = "text-3xl justify-center text-primary";


  return (
    <DashboardCard title="AI Trading Signal" className="bg-card/80 backdrop-blur-sm" contentClassName="p-0" titleClassName={titleClass}>
      {renderSignal()}
    </DashboardCard>
  );
}

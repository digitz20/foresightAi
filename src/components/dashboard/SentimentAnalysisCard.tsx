import type { SummarizeNewsSentimentOutput } from '@/ai/flows/summarize-news-sentiment';
import { Newspaper, AlertTriangle, ShieldAlert } from 'lucide-react';
import DashboardCard from './DashboardCard';
import { Badge } from '@/components/ui/badge';

type SentimentAnalysisCardProps = {
  data?: SummarizeNewsSentimentOutput;
  isLoading: boolean;
  currencyPair: string;
};

export default function SentimentAnalysisCard({ data, isLoading, currencyPair }: SentimentAnalysisCardProps) {
  const renderSentiment = () => {
    if (isLoading) {
      return <p className="text-muted-foreground text-center">Analyzing sentiment...</p>;
    }
    if (!data) {
      return (
         <div className="flex flex-col items-center justify-center text-muted-foreground">
          <AlertTriangle className="h-8 w-8 mb-2" />
          <p>Could not retrieve sentiment data.</p>
        </div>
      );
    }

    if (data.error) {
      return (
        <div className="flex flex-col items-center justify-center text-destructive">
          <ShieldAlert className="h-8 w-8 mb-2" />
          <p className="font-semibold">Sentiment Analysis Error</p>
          <p className="text-sm text-center px-2">{data.error}</p>
           {data.summary && data.summary.startsWith('Sentiment analysis failed:') && (
             <p className="mt-1 text-xs text-muted-foreground px-2">Summary unavailable.</p>
          )}
        </div>
      );
    }


    const { overallSentiment, summary } = data;
    let badgeVariant: "default" | "destructive" | "secondary" | "outline" = "secondary";
    if (overallSentiment.toLowerCase().includes('positive')) badgeVariant = 'default';
    else if (overallSentiment.toLowerCase().includes('negative')) badgeVariant = 'destructive';
    else if (overallSentiment.toLowerCase().includes('unknown')) badgeVariant = 'outline';


    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-md font-medium text-foreground">Overall Sentiment ({currencyPair}):</p>
          <Badge 
            variant={badgeVariant} 
            className={
              overallSentiment.toLowerCase().includes('positive') ? 'bg-accent/20 border-accent text-accent-foreground' : 
              overallSentiment.toLowerCase().includes('negative') ? 'bg-destructive/20 border-destructive text-destructive-foreground' : 
              overallSentiment.toLowerCase().includes('unknown') ? 'border-dashed' :
              'bg-muted/20 border-muted text-muted-foreground'
            }
          >
            {overallSentiment}
          </Badge>
        </div>
        <div>
          <h4 className="text-sm font-medium text-muted-foreground mb-1">Summary:</h4>
          <p className="text-sm text-foreground bg-muted/30 p-3 rounded-md">{summary}</p>
        </div>
        <p className="text-xs text-muted-foreground mt-1 text-center">Analysis based on NewsAPI.org headlines</p>
      </div>
    );
  };

  return (
    <DashboardCard title="News Sentiment Analysis" icon={Newspaper}>
      {renderSentiment()}
    </DashboardCard>
  );
}

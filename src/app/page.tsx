import Header from '@/components/layout/Header';
import SignalDisplayCard from '@/components/dashboard/SignalDisplayCard';
import MarketOverviewCard from '@/components/dashboard/MarketOverviewCard';
import TechnicalIndicatorsCard from '@/components/dashboard/TechnicalIndicatorsCard';
import SentimentAnalysisCard from '@/components/dashboard/SentimentAnalysisCard';
import EconomicIndicatorCard from '@/components/dashboard/EconomicIndicatorCard';

import { generateTradeRecommendation, GenerateTradeRecommendationInput, GenerateTradeRecommendationOutput } from '@/ai/flows/generate-trade-recommendation';
import { summarizeNewsSentiment, SummarizeNewsSentimentInput, SummarizeNewsSentimentOutput } from '@/ai/flows/summarize-news-sentiment';
import { Suspense } from 'react';
import { Skeleton } from '@/components/ui/skeleton';

async function fetchAiData(): Promise<{
  tradeRecommendation: GenerateTradeRecommendationOutput | null;
  newsSentiment: SummarizeNewsSentimentOutput | null;
}> {
  try {
    const tradeRecommendationInput: GenerateTradeRecommendationInput = {
      rsi: 45, // Placeholder
      macd: 0.0015, // Placeholder
      sentimentScore: 0.3, // Placeholder from news sentiment
      interestRate: 1.5, // Placeholder
      price: 1.0850, // Placeholder
    };
    
    // In a real app, sentimentScore would come from summarizeNewsSentiment result
    // For now, it's a placeholder. The calls are independent for this example.

    const newsSentimentInput: SummarizeNewsSentimentInput = {
      currencyPair: "EUR/USD",
      newsHeadlines: [
        "Euro gains momentum as ECB hints at hawkish stance.",
        "Dollar weakens amid mixed economic data.",
        "Positive outlook for Eurozone manufacturing sector."
      ]
    };

    // Perform AI calls concurrently
    const [tradeRecommendation, newsSentiment] = await Promise.all([
      generateTradeRecommendation(tradeRecommendationInput),
      summarizeNewsSentiment(newsSentimentInput)
    ]);
    
    return { tradeRecommendation, newsSentiment };

  } catch (error) {
    console.error("Error fetching AI data:", error);
    return { tradeRecommendation: null, newsSentiment: null };
  }
}


export default async function HomePage() {
  const { tradeRecommendation, newsSentiment } = await fetchAiData();
  const currencyPair = "EUR/USD"; // Used in Sentiment Card

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <Header />
      <main className="flex-grow container mx-auto p-4 md:p-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Signal Display - Spans 2 columns on large screens or takes full width */}
          <div className="lg:col-span-2">
            <Suspense fallback={<Skeleton className="h-[300px] w-full" />}>
              <SignalDisplayCard data={tradeRecommendation} isLoading={!tradeRecommendation} />
            </Suspense>
          </div>

          {/* Market Overview */}
          <div className="lg:row-span-1">
            <Suspense fallback={<Skeleton className="h-[250px] w-full" />}>
              <MarketOverviewCard />
            </Suspense>
          </div>
          
          {/* Technical Indicators */}
          <div className="lg:col-span-1">
            <Suspense fallback={<Skeleton className="h-[350px] w-full" />}>
             <TechnicalIndicatorsCard />
            </Suspense>
          </div>

          {/* Sentiment Analysis */}
          <div className="lg:col-span-1">
           <Suspense fallback={<Skeleton className="h-[250px] w-full" />}>
              <SentimentAnalysisCard data={newsSentiment} isLoading={!newsSentiment} currencyPair={currencyPair} />
            </Suspense>
          </div>
          
          {/* Economic Indicators */}
          <div className="lg:col-span-1">
            <Suspense fallback={<Skeleton className="h-[250px] w-full" />}>
              <EconomicIndicatorCard />
            </Suspense>
          </div>
        </div>
      </main>
      <footer className="text-center p-4 text-sm text-muted-foreground border-t border-border/50">
        © {new Date().getFullYear()} ForeSight AI. All rights reserved.
      </footer>
    </div>
  );
}

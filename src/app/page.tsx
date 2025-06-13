
'use client';

import { useState, useEffect, useCallback } from 'react';
import Header from '@/components/layout/Header';
import SignalDisplayCard from '@/components/dashboard/SignalDisplayCard';
import MarketOverviewCard from '@/components/dashboard/MarketOverviewCard';
import TechnicalIndicatorsCard from '@/components/dashboard/TechnicalIndicatorsCard';
import SentimentAnalysisCard from '@/components/dashboard/SentimentAnalysisCard';
import EconomicIndicatorCard from '@/components/dashboard/EconomicIndicatorCard';
import { Button } from '@/components/ui/button';
import { RefreshCw, Loader2 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

import { generateTradeRecommendation, GenerateTradeRecommendationInput, GenerateTradeRecommendationOutput } from '@/ai/flows/generate-trade-recommendation';
import { summarizeNewsSentiment, SummarizeNewsSentimentInput, SummarizeNewsSentimentOutput } from '@/ai/flows/summarize-news-sentiment';

const ASSETS = [
  { id: "EUR/USD", name: "EUR/USD", type: "currency" },
  { id: "GBP/JPY", name: "GBP/JPY", type: "currency" },
  { id: "XAU/USD", name: "Gold (XAU/USD)", type: "commodity" },
  { id: "BTC/USD", name: "Bitcoin (BTC/USD)", type: "crypto" },
];

async function fetchAiDataForAsset(currencyPair: string): Promise<{
  tradeRecommendation: GenerateTradeRecommendationOutput | null;
  newsSentiment: SummarizeNewsSentimentOutput | null;
  marketOverviewData?: any; 
  technicalIndicatorsData?: any; 
  economicIndicatorData?: any;
}> {
  try {
    let rsi = 45, macd = 0.0015, price = 1.0850, interestRate = 0.5;
    let newsHeadlines: string[] = [
        "Market awaits key economic data release.",
        "Global tensions cause market uncertainty.",
        "Tech stocks see slight rebound."
      ];
    let marketPrice = 1.0853, marketChange = "+0.0012 (0.11%)", marketIsPositive = true;
    let techRsiValue = 45, techMacdValue = 0.0015, techMacdSignal = 0.0010, techMacdHistogram = 0.0005;
    let econIndicatorName = 'Eurozone Interest Rate', econValue = '0.50%', econPrevious = '0.25%', econImpact = 'Neutral';

    if (currencyPair === "EUR/USD") {
      rsi = 45; macd = 0.0015; price = 1.0850; interestRate = 0.5;
      newsHeadlines = [
        "Euro gains momentum as ECB hints at hawkish stance.",
        "Dollar weakens amid mixed economic data.",
        "Positive outlook for Eurozone manufacturing sector."
      ];
      marketPrice = 1.0853; marketChange = "+0.0012 (0.11%)"; marketIsPositive = true;
      techRsiValue = 45; techMacdValue = 0.0015; techMacdSignal = 0.0010; techMacdHistogram = 0.0005;
      econIndicatorName = 'Eurozone Interest Rate'; econValue = '0.50%'; econPrevious = '0.25%'; econImpact = 'Neutral';
    } else if (currencyPair === "GBP/JPY") {
      rsi = 55; macd = -0.0020; price = 190.50; interestRate = 0.1;
      newsHeadlines = [
        "BoE Governor's speech impacts Sterling.",
        "Yen strength observed due to risk-off sentiment.",
        "UK inflation data slightly higher than expected."
      ];
      marketPrice = 190.52; marketChange = "-0.1500 (0.08%)"; marketIsPositive = false;
      techRsiValue = 55; techMacdValue = -0.0020; techMacdSignal = -0.0015; techMacdHistogram = -0.0005;
      econIndicatorName = 'UK Interest Rate'; econValue = '0.10%'; econPrevious = '0.10%'; econImpact = 'Stable';
    } else if (currencyPair === "XAU/USD") { 
      rsi = 65; macd = 0.0030; price = 2350.00; interestRate = 5.25; 
      newsHeadlines = [
        "Gold prices surge on geopolitical instability.",
        "Fed's interest rate outlook influences precious metals.",
        "Strong demand for gold from central banks reported."
      ];
      marketPrice = 2350.75; marketChange = "+15.50 (0.66%)"; marketIsPositive = true;
      techRsiValue = 65; techMacdValue = 0.0030; techMacdSignal = 0.0025; techMacdHistogram = 0.0005;
      econIndicatorName = 'US Fed Funds Rate'; econValue = '5.25%'; econPrevious = '5.25%'; econImpact = 'Positive for USD, mixed for Gold';
    } else if (currencyPair === "BTC/USD") { 
        rsi = 50; macd = 150.00; price = 65000.00; interestRate = 5.25; 
        newsHeadlines = [
            "Bitcoin ETFs see renewed inflows.",
            "Regulatory uncertainty continues to weigh on crypto markets.",
            "Major exchange announces new features for institutional investors."
        ];
        marketPrice = 65000.00; marketChange = "+1200.00 (1.85%)"; marketIsPositive = true;
        techRsiValue = 50; techMacdValue = 150; techMacdSignal = 100; techMacdHistogram = 50;
        econIndicatorName = 'Crypto Market Cap'; econValue = '$2.5T'; econPrevious = '$2.4T'; econImpact = 'Growth';
    }

    const tradeRecommendationInput: GenerateTradeRecommendationInput = {
      rsi, macd, sentimentScore: 0.3, interestRate, price,
    };
    const newsSentimentInput: SummarizeNewsSentimentInput = { currencyPair, newsHeadlines };
    const marketOverviewData = { pair: currencyPair, value: marketPrice, change: marketChange, isPositive: marketIsPositive };
    const technicalIndicatorsData = {
        rsi: { value: techRsiValue, status: techRsiValue < 30 ? 'Oversold' : techRsiValue > 70 ? 'Overbought' : 'Neutral' },
        macd: { value: techMacdValue, signal: techMacdSignal, histogram: techMacdHistogram, status: techMacdHistogram > 0 ? 'Uptrend' : 'Downtrend' },
    };
    const economicIndicatorData = { indicatorName: econIndicatorName, value: econValue, previous: econPrevious, impact: econImpact, source: 'Placeholder API' };

    const [tradeRecommendation, newsSentiment] = await Promise.all([
      generateTradeRecommendation(tradeRecommendationInput),
      summarizeNewsSentiment(newsSentimentInput)
    ]);
    
    return { tradeRecommendation, newsSentiment, marketOverviewData, technicalIndicatorsData, economicIndicatorData };
  } catch (error) {
    console.error(`Error fetching AI data for ${currencyPair}:`, error);
    return { 
        tradeRecommendation: null, newsSentiment: null,
        marketOverviewData: { pair: currencyPair, value: 0, change: "N/A", isPositive: false },
        technicalIndicatorsData: { rsi: { value: 0, status: 'N/A' }, macd: { value: 0, signal: 0, histogram: 0, status: 'N/A' } },
        economicIndicatorData: { indicatorName: 'N/A', value: 'N/A', previous: 'N/A', impact: 'N/A', source: 'Error' }
    };
  }
}

export default function HomePage() {
  const [selectedAsset, setSelectedAsset] = useState(ASSETS[0]);
  const [aiData, setAiData] = useState<{
    tradeRecommendation: GenerateTradeRecommendationOutput | null;
    newsSentiment: SummarizeNewsSentimentOutput | null;
    marketOverviewData?: any;
    technicalIndicatorsData?: any;
    economicIndicatorData?: any;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadData = useCallback(async (assetId: string) => {
    setIsLoading(true);
    const data = await fetchAiDataForAsset(assetId);
    setAiData(data);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    loadData(selectedAsset.id);
  }, [selectedAsset, loadData]);

  const handleAssetChange = (asset: typeof ASSETS[0]) => {
    if (asset.id !== selectedAsset.id) {
      setSelectedAsset(asset);
    }
  };
  
  const handleRefresh = async () => {
      setIsRefreshing(true);
      const data = await fetchAiDataForAsset(selectedAsset.id);
      setAiData(data);
      setIsRefreshing(false);
  };

  const renderCardSkeleton = (heightClass = "h-[250px]") => <Skeleton className={`${heightClass} w-full`} />;

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <Header />
      <main className="flex-grow container mx-auto p-4 md:p-8">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div className="flex gap-2 flex-wrap">
            {ASSETS.map(asset => (
              <Button
                key={asset.id}
                variant={selectedAsset.id === asset.id ? "default" : "outline"}
                onClick={() => handleAssetChange(asset)}
                size="sm"
              >
                {asset.name}
              </Button>
            ))}
          </div>
          <Button onClick={handleRefresh} disabled={isRefreshing || isLoading} size="sm">
            {isRefreshing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Refresh Signal
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            {isLoading ? renderCardSkeleton("h-[300px]") : (
              <SignalDisplayCard data={aiData?.tradeRecommendation} isLoading={!aiData?.tradeRecommendation} />
            )}
          </div>

          <div className="lg:row-span-1">
             {isLoading ? renderCardSkeleton("h-[250px]") : (
              <MarketOverviewCard 
                initialData={aiData?.marketOverviewData} 
                key={selectedAsset.id + "-market"}
              />
            )}
          </div>
          
          <div className="lg:col-span-1">
            {isLoading ? renderCardSkeleton("h-[350px]") : (
             <TechnicalIndicatorsCard 
                initialData={aiData?.technicalIndicatorsData} 
                key={selectedAsset.id + '-tech'}
              />
            )}
          </div>

          <div className="lg:col-span-1">
           {isLoading ? renderCardSkeleton("h-[250px]") : (
              <SentimentAnalysisCard 
                data={aiData?.newsSentiment} 
                isLoading={!aiData?.newsSentiment} 
                currencyPair={selectedAsset.id} 
              />
            )}
          </div>
          
          <div className="lg:col-span-1">
            {isLoading ? renderCardSkeleton("h-[250px]") : (
              <EconomicIndicatorCard 
                initialData={aiData?.economicIndicatorData}
                key={selectedAsset.id + '-econ'}
              />
            )}
          </div>
        </div>
      </main>
      <footer className="text-center p-4 text-sm text-muted-foreground border-t border-border/50">
        © {new Date().getFullYear()} ForeSight AI. All rights reserved.
      </footer>
    </div>
  );
}

    

'use client';

import { useState, useEffect, useCallback } from 'react';
import Header from '@/components/layout/Header';
import SignalDisplayCard from '@/components/dashboard/SignalDisplayCard';
import MarketOverviewCard from '@/components/dashboard/MarketOverviewCard';
import TechnicalIndicatorsCard from '@/components/dashboard/TechnicalIndicatorsCard';
import SentimentAnalysisCard from '@/components/dashboard/SentimentAnalysisCard';
import EconomicIndicatorCard from '@/components/dashboard/EconomicIndicatorCard';
import { Button } from '@/components/ui/button';
import { RefreshCw, Loader2, Clock, AlertTriangle, Info } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

import { generateTradeRecommendation, GenerateTradeRecommendationInput, GenerateTradeRecommendationOutput } from '@/ai/flows/generate-trade-recommendation';
import { summarizeNewsSentiment, SummarizeNewsSentimentInput, SummarizeNewsSentimentOutput } from '@/ai/flows/summarize-news-sentiment';
import { fetchMarketData, MarketData } from '@/app/actions/fetch-market-data';

const ASSETS = [
  { id: "EUR/USD", name: "EUR/USD", type: "currency" },
  { id: "GBP/JPY", name: "GBP/JPY", type: "currency" },
  { id: "AUD/USD", name: "AUD/USD", type: "currency" },
  { id: "USD/CAD", name: "USD/CAD", type: "currency" },
  { id: "XAU/USD", name: "Gold (Spot)", type: "commodity" },
  { id: "XAG/USD", name: "Silver (Spot)", type: "commodity" },
  { id: "CL", name: "Crude Oil (WTI Futures)", type: "commodity" },
  { id: "BTC/USD", name: "Bitcoin (BTC/USD)", type: "crypto" },
];

const TIMEFRAMES = [
  { id: "15min", name: "15min" },
  { id: "1H", name: "1H" },
  { id: "4H", name: "4H" },
  { id: "1D", name: "1D" },
];

async function fetchCombinedDataForAsset(
  assetId: string,
  assetName: string,
  assetType: string,
  timeframeId: string
): Promise<{
  tradeRecommendation: GenerateTradeRecommendationOutput | null;
  newsSentiment: SummarizeNewsSentimentOutput | null;
  marketOverviewData?: any;
  technicalIndicatorsData?: any;
  economicIndicatorData?: any;
  marketDataError?: string;
}> {
  let marketDataError: string | undefined;
  try {
    const marketApiData: MarketData = await fetchMarketData(assetId, assetName, timeframeId);

    if (marketApiData.error && (!marketApiData.price && !marketApiData.rsi && !marketApiData.macd)) {
      marketDataError = marketApiData.error;
      console.error(`Critical market data error for ${assetName} (${timeframeId}): ${marketDataError}`);
      return {
        tradeRecommendation: { recommendation: 'HOLD', reason: `Market data unavailable: ${marketDataError}`, error: marketDataError },
        newsSentiment: { overallSentiment: 'Unknown', summary: `Sentiment analysis cannot proceed due to market data error: ${marketDataError}`, error: marketDataError },
        marketOverviewData: { pair: assetName, value: 0, change: "N/A", isPositive: false, timeframe: timeframeId, error: marketDataError },
        technicalIndicatorsData: { rsi: { value: 0, status: 'N/A' }, macd: { value: 0, signal: 0, histogram: 0, status: 'N/A' }, error: marketDataError },
        economicIndicatorData: { indicatorName: 'N/A', value: 'N/A', previous: 'N/A', impact: 'N/A', source: 'Error', error: marketDataError },
        marketDataError,
      };
    }
    if (marketApiData.error) {
        console.warn(`Partial market data or non-critical error for ${assetName} (${timeframeId}): ${marketApiData.error}`);
        marketDataError = marketApiData.error;
    }

    const currentPrice = marketApiData.price ?? (assetType === 'crypto' ? 60000 : assetType === 'commodity' ? (assetId.includes("XAU") ? 2300 : (assetId.includes("XAG") ? 25 : (assetId.includes("CL") ? 75 : 100) )) : 1.1);
    const rsiValue = marketApiData.rsi ?? 50;
    const macdValue = marketApiData.macd?.value ?? 0;
    const macdSignal = marketApiData.macd?.signal ?? 0;
    const macdHistogram = marketApiData.macd?.histogram ?? 0;
    const interestRate = 0.5 + Math.random() * 2;
    let newsHeadlines: string[] = [
        `Market analysts watch ${assetName} closely on ${timeframeId} charts.`,
        `Volatility expected for ${assetType}s amid global economic shifts.`,
        `${assetName} price movements influenced by recent ${timeframeId} trends.`
      ];
    if (assetId === "EUR/USD") newsHeadlines.push("ECB policy decisions in focus.");
    if (assetId === "BTC/USD") newsHeadlines.push("Crypto market sentiment shifts rapidly.");

    const tradeRecommendationInput: GenerateTradeRecommendationInput = {
      rsi: parseFloat(rsiValue.toFixed(2)),
      macd: parseFloat(macdValue.toFixed(4)),
      sentimentScore: parseFloat(((Math.random() * 2) - 1).toFixed(2)),
      interestRate: parseFloat(interestRate.toFixed(2)),
      price: parseFloat(currentPrice.toFixed(assetId.includes("JPY") || assetId.includes("XAU") || assetId.includes("XAG") || assetId.includes("CL") ? 2 : (assetId.includes("BTC") ? 2 : 4))),
    };

    const newsSentimentInput: SummarizeNewsSentimentInput = { currencyPair: assetName, newsHeadlines };

    const marketOverviewData = {
      pair: assetName,
      value: marketApiData.price,
      change: marketApiData.price ? `${(marketApiData.price * 0.001 * (Math.random() > 0.5 ? 1 : -1)).toFixed(4)} (${(0.1 * (Math.random() > 0.5 ? 1 : -1)).toFixed(2)}%)` : "N/A",
      isPositive: Math.random() > 0.5,
      timeframe: timeframeId,
      error: marketApiData.price === undefined ? (marketDataError || "Price data unavailable") : undefined
    };

    const technicalIndicatorsData = {
        rsi: { value: rsiValue, status: rsiValue < 30 ? 'Oversold' : rsiValue > 70 ? 'Overbought' : 'Neutral' },
        macd: { value: macdValue, signal: macdSignal, histogram: macdHistogram, status: macdHistogram > 0 ? 'Uptrend' : 'Downtrend' },
        error: (marketApiData.rsi === undefined || marketApiData.macd === undefined) ? (marketDataError || "Some technical indicators unavailable") : undefined
    };

    const economicIndicatorData = {
        indicatorName: 'Global Economic Outlook',
        value: 'Stable',
        previous: 'Cautious',
        impact: 'Neutral',
        source: assetId.startsWith('Simulated') ? 'Simulated API' : 'Placeholder Data'
    };

    const [tradeRecommendation, newsSentiment] = await Promise.all([
      generateTradeRecommendation(tradeRecommendationInput),
      summarizeNewsSentiment(newsSentimentInput)
    ]);

    return {
        tradeRecommendation,
        newsSentiment,
        marketOverviewData,
        technicalIndicatorsData,
        economicIndicatorData,
        marketDataError: marketApiData.error
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Error in fetchCombinedDataForAsset for ${assetName} (${timeframeId}):`, errorMessage);
    marketDataError = errorMessage;
    return {
        tradeRecommendation: { recommendation: 'HOLD', reason: `Analysis error: ${marketDataError}`, error: marketDataError },
        newsSentiment: { overallSentiment: 'Unknown', summary: `Analysis error: ${marketDataError}`, error: marketDataError },
        marketOverviewData: { pair: assetName, value: 0, change: "N/A", isPositive: false, timeframe: timeframeId, error: marketDataError },
        technicalIndicatorsData: { rsi: { value: 0, status: 'N/A' }, macd: { value: 0, signal: 0, histogram: 0, status: 'N/A' }, error: marketDataError },
        economicIndicatorData: { indicatorName: 'N/A', value: 'N/A', previous: 'N/A', impact: 'N/A', source: 'Error', error: marketDataError },
        marketDataError
    };
  }
}

export default function HomePage() {
  const [selectedAsset, setSelectedAsset] = useState(ASSETS[0]);
  const [selectedTimeframe, setSelectedTimeframe] = useState(TIMEFRAMES[0]);

  const [aiData, setAiData] = useState<{
    tradeRecommendation: GenerateTradeRecommendationOutput | null;
    newsSentiment: SummarizeNewsSentimentOutput | null;
    marketOverviewData?: any;
    technicalIndicatorsData?: any;
    economicIndicatorData?: any;
    marketDataError?: string;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  const loadData = useCallback(async (asset: typeof ASSETS[0], timeframe: typeof TIMEFRAMES[0]) => {
    setIsLoading(true);
    setLastError(null);
    setAiData(null); 
    const data = await fetchCombinedDataForAsset(asset.id, asset.name, asset.type, timeframe.id);
    setAiData(data);
    if (data.marketDataError) {
        setLastError(data.marketDataError);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    loadData(selectedAsset, selectedTimeframe);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAsset, selectedTimeframe]); // Removed loadData from deps as it's stable


  const handleAssetChange = (asset: typeof ASSETS[0]) => {
    if (asset.id !== selectedAsset.id) {
      setSelectedAsset(asset);
    }
  };

  const handleTimeframeChange = (timeframe: typeof TIMEFRAMES[0]) => {
    if (timeframe.id !== selectedTimeframe.id) {
      setSelectedTimeframe(timeframe);
    }
  };

  const handleRefresh = async () => {
      setIsRefreshing(true);
      setLastError(null);
      const data = await fetchCombinedDataForAsset(selectedAsset.id, selectedAsset.name, selectedAsset.type, selectedTimeframe.id);
      setAiData(data);
      if (data.marketDataError) {
        setLastError(data.marketDataError);
      }
      setIsRefreshing(false);
  };

  const renderCardSkeleton = (heightClass = "h-[250px]") => <Skeleton className={`${heightClass} w-full`} />;

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <Header />
      <main className="flex-grow container mx-auto p-4 md:p-8">
        <div className="flex flex-col gap-4 mb-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h2 className="text-lg font-semibold text-foreground">Select Asset:</h2>
            <div className="flex gap-2 flex-wrap">
              {ASSETS.map(asset => (
                <Button
                  key={asset.id}
                  variant={selectedAsset.id === asset.id ? "default" : "outline"}
                  onClick={() => handleAssetChange(asset)}
                  size="sm"
                  disabled={isLoading || isRefreshing}
                >
                  {asset.name}
                </Button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h2 className="text-lg font-semibold text-foreground flex items-center gap-2"><Clock size={20}/>Select Timeframe:</h2>
            <div className="flex gap-2 flex-wrap">
              {TIMEFRAMES.map(tf => (
                <Button
                  key={tf.id}
                  variant={selectedTimeframe.id === tf.id ? "default" : "outline"}
                  onClick={() => handleTimeframeChange(tf)}
                  size="sm"
                  disabled={isLoading || isRefreshing}
                >
                  {tf.name}
                </Button>
              ))}
            </div>
          </div>
          <Button onClick={handleRefresh} disabled={isRefreshing || isLoading} className="self-end" size="sm">
            {isRefreshing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Refresh Data for {selectedAsset.name} ({selectedTimeframe.name})
          </Button>
        </div>

        {lastError && (
          <div className="mb-4 p-4 border border-destructive/50 bg-destructive/10 text-destructive rounded-md flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 mt-0.5 shrink-0" />
            <div>
                <p className="font-semibold">Notice:</p>
                <p className="text-sm">{lastError}</p>
                <p className="text-xs mt-1">Some data might be unavailable or outdated. AI analysis may be affected.</p>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">{renderCardSkeleton("h-[300px]")}</div>
            <div className="lg:row-span-1">{renderCardSkeleton("h-[250px]")}</div>
            <div className="lg:col-span-1">{renderCardSkeleton("h-[350px]")}</div>
            <div className="lg:col-span-1">{renderCardSkeleton("h-[250px]")}</div>
            <div className="lg:col-span-1">{renderCardSkeleton("h-[250px]")}</div>
          </div>
        ) : aiData ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <SignalDisplayCard data={aiData?.tradeRecommendation} isLoading={!aiData?.tradeRecommendation && !aiData?.marketDataError} />
            </div>
            <div className="lg:row-span-1">
              <MarketOverviewCard
                initialData={aiData?.marketOverviewData}
                key={`${selectedAsset.id}-${selectedTimeframe.id}-market`}
              />
            </div>
            <div className="lg:col-span-1">
              <TechnicalIndicatorsCard
                initialData={aiData?.technicalIndicatorsData}
                key={`${selectedAsset.id}-${selectedTimeframe.id}-tech`}
              />
            </div>
            <div className="lg:col-span-1">
              <SentimentAnalysisCard
                data={aiData?.newsSentiment}
                isLoading={!aiData?.newsSentiment && !aiData?.marketDataError}
                currencyPair={selectedAsset.name}
              />
            </div>
            <div className="lg:col-span-1">
              <EconomicIndicatorCard
                initialData={aiData?.economicIndicatorData}
                 key={`${selectedAsset.id}-${selectedTimeframe.id}-econ`}
              />
            </div>
          </div>
        ) : (
             <div className="text-center py-10">
                <Info size={48} className="mx-auto text-muted-foreground mb-4" />
                <p className="text-xl text-muted-foreground">
                    Select an asset and timeframe to begin or try refreshing.
                </p>
            </div>
        )}
      </main>
      <footer className="text-center p-4 text-sm text-muted-foreground border-t border-border/50">
        Market data provided by <a href="https://twelvedata.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-primary">Twelve Data</a>.
        © {new Date().getFullYear()} ForeSight AI. All rights reserved.
      </footer>
    </div>
  );
}

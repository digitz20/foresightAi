
'use client';

import { useState, useEffect, useCallback } from 'react';
import Header from '@/components/layout/Header';
import SignalDisplayCard from '@/components/dashboard/SignalDisplayCard';
import MarketOverviewCard from '@/components/dashboard/MarketOverviewCard';
import TechnicalIndicatorsCard, { 
    type TechnicalIndicatorsData as ProcessedTechnicalIndicatorsData,
    type RsiData as ProcessedRsiData,
    type MacdData as ProcessedMacdData
} from '@/components/dashboard/TechnicalIndicatorsCard';
import SentimentAnalysisCard from '@/components/dashboard/SentimentAnalysisCard';
import EconomicIndicatorCard, { type EconomicIndicatorData } from '@/components/dashboard/EconomicIndicatorCard';
import { Button } from '@/components/ui/button';
import { RefreshCw, Loader2, Clock, AlertTriangle, Info } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

import { generateTradeRecommendation, GenerateTradeRecommendationInput, GenerateTradeRecommendationOutput } from '@/ai/flows/generate-trade-recommendation';
import { summarizeNewsSentiment, SummarizeNewsSentimentInput, SummarizeNewsSentimentOutput } from '@/ai/flows/summarize-news-sentiment';
import { fetchMarketData, MarketData } from '@/app/actions/fetch-market-data';
import { fetchEconomicData, EconomicData as FetchedEconomicData } from '@/app/actions/fetch-economic-data';

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

// Helper function to determine RSI status
const getRsiStatus = (rsiValue?: number): string => {
  if (rsiValue === undefined || rsiValue === null || isNaN(rsiValue)) return 'N/A';
  if (rsiValue < 30) return 'Oversold';
  if (rsiValue > 70) return 'Overbought';
  return 'Neutral';
};

// Helper function to determine MACD status
const getMacdStatus = (macdData?: { value?: number; signal?: number; histogram?: number }): string => {
  if (!macdData || macdData.value === undefined || macdData.value === null || isNaN(macdData.value) ||
      macdData.signal === undefined || macdData.signal === null || isNaN(macdData.signal)) {
    return 'N/A';
  }
  // Simplified logic: Positive histogram or MACD line above signal often suggests bullish.
  // Using histogram is often more direct for simple status.
  if (macdData.histogram !== undefined && macdData.histogram > 0.00001) return 'Uptrend'; // Adjusted threshold
  if (macdData.histogram !== undefined && macdData.histogram < -0.00001) return 'Downtrend'; // Adjusted threshold
  if (macdData.value > macdData.signal) return 'Uptrend';
  if (macdData.value < macdData.signal) return 'Downtrend';
  return 'Neutral';
};


// Combine all data fetching and processing
async function fetchCombinedDataForAsset(
  assetId: string,
  assetName: string,
  assetType: string,
  timeframeId: string,
): Promise<{
  tradeRecommendation: GenerateTradeRecommendationOutput | null;
  newsSentiment: SummarizeNewsSentimentOutput | null;
  marketOverviewData?: MarketData; // MarketData directly from fetchMarketData for MarketOverviewCard
  technicalIndicatorsData?: ProcessedTechnicalIndicatorsData; // Transformed data for TechnicalIndicatorsCard
  economicIndicatorData?: EconomicIndicatorData;
  combinedError?: string;
}> {
  let combinedError: string | undefined;

  try {
    // These API keys are now read from .env by the server actions
    const marketApiDataPromise = fetchMarketData(assetId, assetName, timeframeId, null); // Pass null as key is server-side
    const economicApiDataPromise = fetchEconomicData(assetId, assetName, null); // Pass null as key is server-side

    const [marketApiData, economicApiData] = await Promise.all([marketApiDataPromise, economicApiDataPromise]);

    let dataErrors: string[] = [];

    if (marketApiData.error) {
      // Don't log critical errors here if no data was fetched, as fetchMarketData handles its own console logs for specific issues.
      // This error will be part of combinedError and displayed in UI.
      if (!marketApiData.price && !marketApiData.rsi && !marketApiData.macd) {
        dataErrors.push(`Market Data: ${marketApiData.error}`);
      } else {
        dataErrors.push(`Market Data (Partial): ${marketApiData.error}`);
      }
    }

    if (economicApiData.error) {
      console.warn(`Economic data error for ${assetName}: ${economicApiData.error}`);
      dataErrors.push(`Economic Data: ${economicApiData.error}`);
    }
    
    if (dataErrors.length > 0) {
        combinedError = dataErrors.join('; ');
    }

    // Transform MarketData to ProcessedTechnicalIndicatorsData
    const processedTechIndicators: ProcessedTechnicalIndicatorsData = {
      rsi: {
        value: marketApiData.rsi,
        status: getRsiStatus(marketApiData.rsi),
      },
      macd: {
        value: marketApiData.macd?.value,
        signal: marketApiData.macd?.signal,
        histogram: marketApiData.macd?.histogram,
        status: getMacdStatus(marketApiData.macd),
      },
      error: marketApiData.error, // Pass along any error related to market data fetching for tech indicators
    };
    
    // If market data is unavailable (no price, rsi, macd) and an error exists for it, return early.
    // The technicalIndicatorsData will still be populated with statuses like 'N/A' and the error.
    if (marketApiData.error && !marketApiData.price && !marketApiData.rsi && !marketApiData.macd) {
         return {
            tradeRecommendation: { recommendation: 'HOLD', reason: `Market data unavailable: ${marketApiData.error}`, error: marketApiData.error },
            newsSentiment: { overallSentiment: 'Unknown', summary: `Sentiment analysis cannot proceed due to market data error: ${marketApiData.error}`, error: marketApiData.error },
            marketOverviewData: { ...marketApiData, error: marketApiData.error }, 
            technicalIndicatorsData: processedTechIndicators, // Use transformed data
            economicIndicatorData: { 
                indicatorName: economicApiData.indicatorName || 'N/A', 
                value: economicApiData.value || 'N/A', 
                source: economicApiData.source || 'N/A',
                comparisonCurrency: (economicApiData as any).comparisonCurrency,
                lastUpdated: (economicApiData as any).lastUpdated,
                error: economicApiData.error || combinedError 
            },
            combinedError,
        };
    }

    const currentPrice = marketApiData.price ?? (assetType === 'crypto' ? 60000 : assetType === 'commodity' ? (assetId.includes("XAU") ? 2300 : (assetId.includes("XAG") ? 25 : (assetId.includes("CL") ? 75 : 100) )) : 1.1);
    const rsiValue = marketApiData.rsi ?? 50;
    const macdValue = marketApiData.macd?.value ?? 0;
    
    // Interest rate for AI flow - this is a placeholder. EconomicAPIData provides exchange rates.
    const simulatedInterestRateFromEconomicApi = economicApiData.value && !isNaN(parseFloat(economicApiData.value)) 
        ? parseFloat(economicApiData.value) * 0.1 : 0.5 + Math.random() * 2; // Simple placeholder if API fails or not FX
    const interestRateForAI = parseFloat(simulatedInterestRateFromEconomicApi.toFixed(2));


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
      interestRate: interestRateForAI, 
      price: parseFloat(currentPrice.toFixed(assetId.includes("JPY") || assetId.includes("XAU") || assetId.includes("XAG") || assetId.includes("CL") ? 2 : (assetId.includes("BTC") ? 2 : 4))),
    };

    const newsSentimentInput: SummarizeNewsSentimentInput = { currencyPair: assetName, newsHeadlines };

    const [tradeRecommendation, newsSentiment] = await Promise.all([
      generateTradeRecommendation(tradeRecommendationInput),
      summarizeNewsSentiment(newsSentimentInput)
    ]);

    const finalEconomicData: EconomicIndicatorData = {
        indicatorName: economicApiData.indicatorName,
        value: economicApiData.value,
        comparisonCurrency: (economicApiData as any).comparisonCurrency,
        lastUpdated: (economicApiData as any).lastUpdated,
        source: economicApiData.source,
        error: economicApiData.error 
    };
    
    return {
        tradeRecommendation,
        newsSentiment,
        marketOverviewData: marketApiData, // Raw market data for overview
        technicalIndicatorsData: processedTechIndicators, // Transformed data for tech indicators card
        economicIndicatorData: finalEconomicData,
        combinedError: marketApiData.error || economicApiData.error || tradeRecommendation?.error || newsSentiment?.error || combinedError 
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Error in fetchCombinedDataForAsset for ${assetName} (${timeframeId}):`, errorMessage);
    combinedError = errorMessage;
    const defaultTechIndicators: ProcessedTechnicalIndicatorsData = {
        rsi: { value: undefined, status: 'N/A' },
        macd: { value: undefined, signal: undefined, histogram: undefined, status: 'N/A' },
        error: combinedError,
    };
    return {
        tradeRecommendation: { recommendation: 'HOLD', reason: `Analysis error: ${combinedError}`, error: combinedError },
        newsSentiment: { overallSentiment: 'Unknown', summary: `Analysis error: ${combinedError}`, error: combinedError },
        marketOverviewData: { assetName, timeframe: timeframeId, error: combinedError },
        technicalIndicatorsData: defaultTechIndicators,
        economicIndicatorData: { indicatorName: 'N/A', value: 'N/A', source: 'Error', error: combinedError },
        combinedError
    };
  }
}

export default function HomePage() {
  const [selectedAsset, setSelectedAsset] = useState(ASSETS[0]);
  const [selectedTimeframe, setSelectedTimeframe] = useState(TIMEFRAMES[0]);
  
  const [aiData, setAiData] = useState<{
    tradeRecommendation: GenerateTradeRecommendationOutput | null;
    newsSentiment: SummarizeNewsSentimentOutput | null;
    marketOverviewData?: MarketData;
    technicalIndicatorsData?: ProcessedTechnicalIndicatorsData; // Updated type
    economicIndicatorData?: EconomicIndicatorData;
    combinedError?: string;
  } | null>(null);

  const [isLoading, setIsLoading] = useState(true); // Start loading true
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);


  useEffect(() => {
    // Initial data load effect
     loadData(selectedAsset, selectedTimeframe);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run only once on mount

  const loadData = useCallback(async (asset: typeof ASSETS[0], timeframe: typeof TIMEFRAMES[0]) => {
    setIsLoading(true);
    setLastError(null);
    setAiData(null); 
    const data = await fetchCombinedDataForAsset(
        asset.id, 
        asset.name, 
        asset.type, 
        timeframe.id,
    );
    setAiData(data);
    if (data.combinedError) {
        setLastError(data.combinedError);
    } else {
        const errorMessages = [
            data.tradeRecommendation?.error,
            data.newsSentiment?.error,
            data.marketOverviewData?.error,
            data.technicalIndicatorsData?.error,
            data.economicIndicatorData?.error,
        ].filter(Boolean).join('; ');
        if (errorMessages) {
            setLastError(errorMessages);
        }
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    // This effect handles changes to selectedAsset or selectedTimeframe
    // The initial load is handled by the empty-dependency useEffect above.
    // This prevents double-loading on mount if selectedAsset/Timeframe are part of deps for initial load.
    if (!isLoading && !isRefreshing) { // Only reload if not currently loading/refreshing from another source
        loadData(selectedAsset, selectedTimeframe);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAsset, selectedTimeframe]); // Dependencies: selectedAsset, selectedTimeframe


  const handleAssetChange = (asset: typeof ASSETS[0]) => {
    if (asset.id !== selectedAsset.id) {
      setSelectedAsset(asset);
      // Data will be reloaded by the useEffect watching selectedAsset
    }
  };

  const handleTimeframeChange = (timeframe: typeof TIMEFRAMES[0]) => {
    if (timeframe.id !== selectedTimeframe.id) {
      setSelectedTimeframe(timeframe);
      // Data will be reloaded by the useEffect watching selectedTimeframe
    }
  };

  const handleRefresh = async () => {
      setIsRefreshing(true);
      setLastError(null); 
      const data = await fetchCombinedDataForAsset(
          selectedAsset.id, 
          selectedAsset.name, 
          selectedAsset.type, 
          selectedTimeframe.id,
        );
      setAiData(data);
      if (data.combinedError) {
        setLastError(data.combinedError);
      } else {
        const errorMessages = [
            data.tradeRecommendation?.error,
            data.newsSentiment?.error,
            data.marketOverviewData?.error,
            data.technicalIndicatorsData?.error,
            data.economicIndicatorData?.error,
        ].filter(Boolean).join('; ');
        if (errorMessages) {
            setLastError(errorMessages);
        }
      }
      setIsRefreshing(false);
  };

  const renderCardSkeleton = (heightClass = "h-[250px]") => <Skeleton className={`${heightClass} w-full`} />;

  const isDataFetchingDisabled = isLoading || isRefreshing;

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <Header />
      <main className="flex-grow container mx-auto p-4 md:p-8">
        <div className="mb-6 p-4 border border-border rounded-lg bg-card shadow-md space-y-4">
            <div className="text-sm text-muted-foreground p-2 bg-muted/30 rounded-md">
                <Info size={16} className="inline mr-2" />
                API keys for Twelve Data and ExchangeRate-API.com are configured on the server. Data will be fetched automatically.
            </div>
        </div>

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
                  disabled={isDataFetchingDisabled}
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
                  disabled={isDataFetchingDisabled}
                >
                  {tf.name}
                </Button>
              ))}
            </div>
          </div>
          <Button onClick={handleRefresh} disabled={isDataFetchingDisabled} className="self-end" size="sm">
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
              <SignalDisplayCard data={aiData?.tradeRecommendation} isLoading={!aiData?.tradeRecommendation && !aiData?.combinedError && !aiData.tradeRecommendation?.error} />
            </div>
            <div className="lg:row-span-1">
              <MarketOverviewCard
                initialData={aiData?.marketOverviewData}
                key={`${selectedAsset.id}-${selectedTimeframe.id}-market`}
              />
            </div>
            <div className="lg:col-span-1">
              <TechnicalIndicatorsCard
                initialData={aiData?.technicalIndicatorsData} // This now passes ProcessedTechnicalIndicatorsData
                key={`${selectedAsset.id}-${selectedTimeframe.id}-tech`}
              />
            </div>
            <div className="lg:col-span-1">
              <SentimentAnalysisCard
                data={aiData?.newsSentiment}
                isLoading={!aiData?.newsSentiment && !aiData?.combinedError && !aiData.newsSentiment?.error}
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
                    Select an asset and timeframe to begin or try refreshing. Ensure API keys are correctly configured on the server.
                </p>
            </div>
        )}
      </main>
      <footer className="text-center p-4 text-sm text-muted-foreground border-t border-border/50">
        Market data from <a href="https://twelvedata.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-primary">Twelve Data</a>.
        Exchange rate data from <a href="https://www.exchangerate-api.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-primary">ExchangeRate-API.com</a>.
        © {new Date().getFullYear()} ForeSight AI. All rights reserved.
      </footer>
    </div>
  );
}



'use client';

import { useState, useEffect, useCallback } from 'react';
import Header from '@/components/layout/Header';
import SignalDisplayCard from '@/components/dashboard/SignalDisplayCard';
import MarketOverviewCard from '@/components/dashboard/MarketOverviewCard';
import TechnicalIndicatorsCard, { 
    type TechnicalIndicatorsData as ProcessedTechnicalIndicatorsData,
} from '@/components/dashboard/TechnicalIndicatorsCard';
import SentimentAnalysisCard from '@/components/dashboard/SentimentAnalysisCard';
import EconomicIndicatorCard, { type EconomicIndicatorData } from '@/components/dashboard/EconomicIndicatorCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RefreshCw, Loader2, Clock, AlertTriangle, Info, KeyRound } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from "@/hooks/use-toast";

import { generateTradeRecommendation, GenerateTradeRecommendationInput, GenerateTradeRecommendationOutput } from '@/ai/flows/generate-trade-recommendation';
import { summarizeNewsSentiment, SummarizeNewsSentimentInput, SummarizeNewsSentimentOutput } from '@/ai/flows/summarize-news-sentiment';
import { fetchMarketData, MarketData } from '@/app/actions/fetch-market-data';
import { fetchEconomicData, EconomicData as FetchedEconomicData } from '@/app/actions/fetch-economic-data'; // This will now use OpenExchangeRates

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

const getRsiStatus = (rsiValue?: number): string => {
  if (rsiValue === undefined || rsiValue === null || isNaN(rsiValue)) return 'N/A';
  if (rsiValue < 30) return 'Oversold';
  if (rsiValue > 70) return 'Overbought';
  return 'Neutral';
};

const getMacdStatus = (macdData?: { value?: number; signal?: number; histogram?: number }): string => {
  if (!macdData || macdData.value === undefined || macdData.value === null || isNaN(macdData.value) ||
      macdData.signal === undefined || macdData.signal === null || isNaN(macdData.signal)) {
    return 'N/A';
  }
  if (macdData.histogram !== undefined && macdData.histogram > 0.00001) return 'Uptrend';
  if (macdData.histogram !== undefined && macdData.histogram < -0.00001) return 'Downtrend';
  if (macdData.value > macdData.signal) return 'Uptrend';
  if (macdData.value < macdData.signal) return 'Downtrend';
  return 'Neutral';
};

async function fetchCombinedDataForAsset(
  assetId: string,
  assetName: string,
  assetType: string,
  timeframeId: string,
  twelveDataApiKey: string | null,
  openExchangeRatesApiKey: string | null,
): Promise<{
  tradeRecommendation: GenerateTradeRecommendationOutput | null;
  newsSentiment: SummarizeNewsSentimentOutput | null;
  marketOverviewData?: MarketData;
  technicalIndicatorsData?: ProcessedTechnicalIndicatorsData;
  economicIndicatorData?: EconomicIndicatorData;
  combinedError?: string;
}> {
  let combinedError: string | undefined;

  try {
    const marketApiDataPromise = fetchMarketData(assetId, assetName, timeframeId, twelveDataApiKey);
    const economicApiDataPromise = fetchEconomicData(assetId, assetName, openExchangeRatesApiKey); // Uses OpenExchangeRates key now

    const [marketApiData, economicApiData] = await Promise.all([marketApiDataPromise, economicApiDataPromise]);

    let dataErrors: string[] = [];

    if (marketApiData.error) {
      if (!marketApiData.price && !marketApiData.rsi && !marketApiData.macd) {
        // This is handled by fetchMarketData's console.warn for specific issues
      }
      dataErrors.push(`Market Data: ${marketApiData.error}`);
    }

    if (economicApiData.error) {
      console.warn(`Economic data error for ${assetName}: ${economicApiData.error}`);
      dataErrors.push(`Economic Data: ${economicApiData.error}`);
    }
    
    if (dataErrors.length > 0) {
        combinedError = dataErrors.join('; ');
    }

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
      error: marketApiData.error,
    };
    
    if (marketApiData.error && !marketApiData.price && !marketApiData.rsi && !marketApiData.macd) {
         return {
            tradeRecommendation: { recommendation: 'HOLD', reason: `Market data unavailable: ${marketApiData.error}`, error: marketApiData.error },
            newsSentiment: { overallSentiment: 'Unknown', summary: `Sentiment analysis cannot proceed due to market data error: ${marketApiData.error}`, error: marketApiData.error },
            marketOverviewData: { ...marketApiData, error: marketApiData.error }, 
            technicalIndicatorsData: processedTechIndicators,
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
    
    // Interest rate for AI flow - this remains a placeholder. 
    // OpenExchangeRates provides exchange rates, not central bank interest rates.
    const simulatedInterestRate = 0.5 + Math.random() * 2;
    const interestRateForAI = parseFloat(simulatedInterestRate.toFixed(2));

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
        marketOverviewData: marketApiData,
        technicalIndicatorsData: processedTechIndicators,
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
    technicalIndicatorsData?: ProcessedTechnicalIndicatorsData;
    economicIndicatorData?: EconomicIndicatorData;
    combinedError?: string;
  } | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const { toast } = useToast();

  const [twelveDataApiKey, setTwelveDataApiKey] = useState<string | null>(null);
  const [openExchangeRatesApiKey, setOpenExchangeRatesApiKey] = useState<string | null>(null);
  const [tempTwelveDataKey, setTempTwelveDataKey] = useState('');
  const [tempOpenExchangeRatesKey, setTempOpenExchangeRatesKey] = useState('');

  useEffect(() => {
    const storedTwelveDataKey = localStorage.getItem('twelveDataApiKey');
    if (storedTwelveDataKey) {
      setTwelveDataApiKey(storedTwelveDataKey);
      setTempTwelveDataKey(storedTwelveDataKey);
    }
    const storedOpenExchangeRatesKey = localStorage.getItem('openExchangeRatesApiKey');
    if (storedOpenExchangeRatesKey) {
      setOpenExchangeRatesApiKey(storedOpenExchangeRatesKey);
      setTempOpenExchangeRatesKey(storedOpenExchangeRatesKey);
    }
    setIsLoading(false); // Initial key load done, allow data fetching to proceed if keys exist
  }, []);

  const handleSetTwelveDataKey = () => {
    if (tempTwelveDataKey.trim()) {
      setTwelveDataApiKey(tempTwelveDataKey.trim());
      localStorage.setItem('twelveDataApiKey', tempTwelveDataKey.trim());
      toast({ title: "Twelve Data API Key Set", description: "Market data fetching enabled." });
      // Trigger data load if other key is also set or not required for initial fetch
      if (openExchangeRatesApiKey || !tempOpenExchangeRatesKey) { // Or some other logic if econ data isn't critical path
        loadData(selectedAsset, selectedTimeframe, tempTwelveDataKey.trim(), openExchangeRatesApiKey);
      }
    } else {
      toast({ title: "API Key Empty", description: "Please enter a valid Twelve Data API key.", variant: "destructive" });
    }
  };

  const handleSetOpenExchangeRatesKey = () => {
    if (tempOpenExchangeRatesKey.trim()) {
      setOpenExchangeRatesApiKey(tempOpenExchangeRatesKey.trim());
      localStorage.setItem('openExchangeRatesApiKey', tempOpenExchangeRatesKey.trim());
      toast({ title: "Open Exchange Rates API Key Set", description: "Economic data fetching enabled." });
      if (twelveDataApiKey) {
         loadData(selectedAsset, selectedTimeframe, twelveDataApiKey, tempOpenExchangeRatesKey.trim());
      }
    } else {
      toast({ title: "API Key Empty", description: "Please enter a valid Open Exchange Rates API key.", variant: "destructive" });
    }
  };


  const loadData = useCallback(async (
      asset: typeof ASSETS[0], 
      timeframe: typeof TIMEFRAMES[0],
      currentTwelveDataKey: string | null,
      currentOpenExchangeRatesKey: string | null
    ) => {
    if (!currentTwelveDataKey || !currentOpenExchangeRatesKey) {
      setLastError("One or more API keys are not set. Please set both API keys to fetch all data.");
      setIsLoading(false);
      setAiData(null); // Clear previous data
      return;
    }
    setIsLoading(true);
    setLastError(null);
    setAiData(null); 
    const data = await fetchCombinedDataForAsset(
        asset.id, 
        asset.name, 
        asset.type, 
        timeframe.id,
        currentTwelveDataKey,
        currentOpenExchangeRatesKey
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Removed API keys from deps as they are passed directly

  useEffect(() => {
    // Initial data load if keys are available from local storage
    if (twelveDataApiKey && openExchangeRatesApiKey && !aiData && !isLoading && !isRefreshing) {
      loadData(selectedAsset, selectedTimeframe, twelveDataApiKey, openExchangeRatesApiKey);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [twelveDataApiKey, openExchangeRatesApiKey, selectedAsset, selectedTimeframe]); // Added API keys and selections as deps


  const handleAssetChange = (asset: typeof ASSETS[0]) => {
    if (asset.id !== selectedAsset.id) {
      setSelectedAsset(asset);
      if (twelveDataApiKey && openExchangeRatesApiKey) {
        loadData(asset, selectedTimeframe, twelveDataApiKey, openExchangeRatesApiKey);
      }
    }
  };

  const handleTimeframeChange = (timeframe: typeof TIMEFRAMES[0]) => {
    if (timeframe.id !== selectedTimeframe.id) {
      setSelectedTimeframe(timeframe);
       if (twelveDataApiKey && openExchangeRatesApiKey) {
        loadData(selectedAsset, timeframe, twelveDataApiKey, openExchangeRatesApiKey);
      }
    }
  };

  const handleRefresh = async () => {
    if (!twelveDataApiKey || !openExchangeRatesApiKey) {
      toast({ title: "API Keys Required", description: "Please set both API keys before refreshing.", variant: "destructive" });
      return;
    }
      setIsRefreshing(true);
      setLastError(null); 
      const data = await fetchCombinedDataForAsset(
          selectedAsset.id, 
          selectedAsset.name, 
          selectedAsset.type, 
          selectedTimeframe.id,
          twelveDataApiKey,
          openExchangeRatesApiKey
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

  const isDataFetchingDisabled = isLoading || isRefreshing || !twelveDataApiKey || !openExchangeRatesApiKey;
  const isKeySetupPhase = !twelveDataApiKey || !openExchangeRatesApiKey;

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <Header />
      <main className="flex-grow container mx-auto p-4 md:p-8">
        <div className="mb-6 p-4 border border-border rounded-lg bg-card shadow-md space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
                <div>
                    <label htmlFor="twelveDataKeyInput" className="block text-sm font-medium text-foreground mb-1">Twelve Data API Key:</label>
                    <div className="flex gap-2">
                        <Input 
                            id="twelveDataKeyInput"
                            type="password" 
                            value={tempTwelveDataKey} 
                            onChange={(e) => setTempTwelveDataKey(e.target.value)}
                            placeholder="Enter Twelve Data API Key"
                            className="flex-grow"
                        />
                        <Button onClick={handleSetTwelveDataKey} size="sm"><KeyRound size={16} /> Set Key</Button>
                    </div>
                </div>
                <div>
                    <label htmlFor="openExchangeRatesKeyInput" className="block text-sm font-medium text-foreground mb-1">Open Exchange Rates API Key:</label>
                    <div className="flex gap-2">
                        <Input 
                            id="openExchangeRatesKeyInput"
                            type="password" 
                            value={tempOpenExchangeRatesKey} 
                            onChange={(e) => setTempOpenExchangeRatesKey(e.target.value)}
                            placeholder="Enter Open Exchange Rates API Key"
                            className="flex-grow"
                        />
                        <Button onClick={handleSetOpenExchangeRatesKey} size="sm"><KeyRound size={16} /> Set Key</Button>
                    </div>
                </div>
            </div>
             <div className="text-xs text-muted-foreground p-2 bg-muted/30 rounded-md mt-2">
                <AlertTriangle size={14} className="inline mr-1 text-destructive" />
                API keys are stored in your browser's local storage for convenience. For production, keys should be server-managed. Data fetching is disabled until keys are set.
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
                  disabled={isDataFetchingDisabled || isKeySetupPhase}
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
                  disabled={isDataFetchingDisabled || isKeySetupPhase}
                >
                  {tf.name}
                </Button>
              ))}
            </div>
          </div>
          <Button onClick={handleRefresh} disabled={isDataFetchingDisabled || isKeySetupPhase} className="self-end" size="sm">
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
        
        {isKeySetupPhase && !isLoading && (
            <div className="text-center py-10">
                <KeyRound size={48} className="mx-auto text-muted-foreground mb-4" />
                <p className="text-xl text-muted-foreground">
                    Please set both API keys above to enable data fetching and AI analysis.
                </p>
            </div>
        )}

        {isLoading && !isKeySetupPhase ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">{renderCardSkeleton("h-[300px]")}</div>
            <div className="lg:row-span-1">{renderCardSkeleton("h-[250px]")}</div>
            <div className="lg:col-span-1">{renderCardSkeleton("h-[350px]")}</div>
            <div className="lg:col-span-1">{renderCardSkeleton("h-[250px]")}</div>
            <div className="lg:col-span-1">{renderCardSkeleton("h-[250px]")}</div>
          </div>
        ) : aiData && !isKeySetupPhase ? (
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
                initialData={aiData?.technicalIndicatorsData}
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
        ) : !isKeySetupPhase && !isLoading ? ( // No data, not loading, and keys are supposedly set
             <div className="text-center py-10">
                <Info size={48} className="mx-auto text-muted-foreground mb-4" />
                <p className="text-xl text-muted-foreground">
                    Select an asset and timeframe, or try refreshing. If issues persist, check API key validity or console for errors.
                </p>
            </div>
        ) : null}
      </main>
      <footer className="text-center p-4 text-sm text-muted-foreground border-t border-border/50">
        Market data from <a href="https://twelvedata.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-primary">Twelve Data</a>.
        Exchange rate data from <a href="https://openexchangerates.org" target="_blank" rel="noopener noreferrer" className="underline hover:text-primary">OpenExchangeRates.org</a>.
        © {new Date().getFullYear()} ForeSight AI. All rights reserved.
      </footer>
    </div>
  );
}

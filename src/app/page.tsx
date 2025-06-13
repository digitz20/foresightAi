
'use client';

import { useState, useEffect, useCallback } from 'react';
import Header from '@/components/layout/Header';
import SignalDisplayCard from '@/components/dashboard/SignalDisplayCard';
import MarketOverviewCard from '@/components/dashboard/MarketOverviewCard';
import TechnicalIndicatorsCard from '@/components/dashboard/TechnicalIndicatorsCard';
import SentimentAnalysisCard from '@/components/dashboard/SentimentAnalysisCard';
import EconomicIndicatorCard, { type EconomicIndicatorData } from '@/components/dashboard/EconomicIndicatorCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RefreshCw, Loader2, Clock, AlertTriangle, Info, KeyRound, TriangleAlert } from 'lucide-react';
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
  { id: "CL", name: "Crude Oil (WTI Futures)", type: "commodity" }, // Note: TwelveData symbol for WTI is often CL
  { id: "BTC/USD", name: "Bitcoin (BTC/USD)", type: "crypto" },
];

const TIMEFRAMES = [
  { id: "15min", name: "15min" },
  { id: "1H", name: "1H" },
  { id: "4H", name: "4H" },
  { id: "1D", name: "1D" },
];

// Combine all data fetching and processing
async function fetchCombinedDataForAsset(
  assetId: string,
  assetName: string,
  assetType: string,
  timeframeId: string,
  twelveDataApiKey: string | null,
  exchangeRateApiKey: string | null
): Promise<{
  tradeRecommendation: GenerateTradeRecommendationOutput | null;
  newsSentiment: SummarizeNewsSentimentOutput | null;
  marketOverviewData?: MarketData; // Using MarketData type directly
  technicalIndicatorsData?: MarketData; // Using MarketData type for consistency
  economicIndicatorData?: EconomicIndicatorData;
  combinedError?: string; // Single error field for overall issues
}> {
  let combinedError: string | undefined;

  if (!twelveDataApiKey) {
    const errorMsg = "Twelve Data API Key is not set. Please set it to fetch market data.";
    console.warn(errorMsg);
    return {
      tradeRecommendation: { recommendation: 'HOLD', reason: errorMsg, error: errorMsg },
      newsSentiment: { overallSentiment: 'Unknown', summary: `Sentiment analysis cannot proceed: ${errorMsg}`, error: errorMsg },
      marketOverviewData: { assetName, timeframe: timeframeId, error: errorMsg },
      technicalIndicatorsData: { assetName, timeframe: timeframeId, error: errorMsg },
      economicIndicatorData: { indicatorName: 'N/A', value: 'N/A', source: 'Error', error: errorMsg },
      combinedError: errorMsg,
    };
  }
   if (!exchangeRateApiKey) {
    const errorMsg = "ExchangeRate-API Key is not set. Please set it for economic data.";
     // This is less critical than TwelveData for core metrics, so maybe just an error on that card
     console.warn(errorMsg);
     // We can proceed with market data if ExchangeRate-API key is missing
  }


  try {
    const marketApiDataPromise = fetchMarketData(assetId, assetName, timeframeId, twelveDataApiKey);
    const economicApiDataPromise = exchangeRateApiKey 
      ? fetchEconomicData(assetId, assetName, exchangeRateApiKey)
      : Promise.resolve<FetchedEconomicData>({ 
          indicatorName: 'Exchange Rate Data', 
          value: 'N/A', 
          source: 'ExchangeRate-API.com', 
          error: 'API key not provided.' 
        });

    const [marketApiData, economicApiData] = await Promise.all([marketApiDataPromise, economicApiDataPromise]);

    let dataErrors: string[] = [];
    if (marketApiData.error && (!marketApiData.price && !marketApiData.rsi && !marketApiData.macd)) {
      console.error(`Critical market data error for ${assetName} (${timeframeId}): ${marketApiData.error}`);
      dataErrors.push(`Market Data: ${marketApiData.error}`);
    } else if (marketApiData.error) {
      console.warn(`Partial market data or non-critical error for ${assetName} (${timeframeId}): ${marketApiData.error}`);
      dataErrors.push(`Market Data (Partial): ${marketApiData.error}`);
    }

    if (economicApiData.error) {
      console.warn(`Economic data error for ${assetName}: ${economicApiData.error}`);
      dataErrors.push(`Economic Data: ${economicApiData.error}`);
    }
    
    if (dataErrors.length > 0) {
        combinedError = dataErrors.join('; ');
    }
    
    // If critical market data error and no data, return early
    if (marketApiData.error && !marketApiData.price && !marketApiData.rsi && !marketApiData.macd) {
         return {
            tradeRecommendation: { recommendation: 'HOLD', reason: `Market data unavailable: ${marketApiData.error}`, error: marketApiData.error },
            newsSentiment: { overallSentiment: 'Unknown', summary: `Sentiment analysis cannot proceed due to market data error: ${marketApiData.error}`, error: marketApiData.error },
            marketOverviewData: { ...marketApiData, error: marketApiData.error }, // Pass through marketApiData
            technicalIndicatorsData: { ...marketApiData, error: marketApiData.error }, // Pass through
            economicIndicatorData: { 
                indicatorName: economicApiData.indicatorName || 'N/A', 
                value: economicApiData.value || 'N/A', 
                source: economicApiData.source || 'N/A',
                comparisonCurrency: (economicApiData as any).comparisonCurrency,
                lastUpdated: (economicApiData as any).lastUpdated,
                error: economicApiData.error || combinedError // Include its own error or the combined one
            },
            combinedError,
        };
    }


    const currentPrice = marketApiData.price ?? (assetType === 'crypto' ? 60000 : assetType === 'commodity' ? (assetId.includes("XAU") ? 2300 : (assetId.includes("XAG") ? 25 : (assetId.includes("CL") ? 75 : 100) )) : 1.1);
    const rsiValue = marketApiData.rsi ?? 50;
    const macdValue = marketApiData.macd?.value ?? 0;
    
    // Interest rate remains a placeholder as ExchangeRate-API provides FX rates, not bank interest rates.
    const simulatedInterestRate = 0.5 + Math.random() * 2; 

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
      sentimentScore: parseFloat(((Math.random() * 2) - 1).toFixed(2)), // Placeholder
      interestRate: parseFloat(simulatedInterestRate.toFixed(2)), // Using simulated
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
        error: economicApiData.error // Pass through error from fetchEconomicData
    };
    
    return {
        tradeRecommendation,
        newsSentiment,
        marketOverviewData: marketApiData, // Pass directly
        technicalIndicatorsData: marketApiData, // Pass directly
        economicIndicatorData: finalEconomicData,
        combinedError: marketApiData.error // Prioritize market data error for combinedError display
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Error in fetchCombinedDataForAsset for ${assetName} (${timeframeId}):`, errorMessage);
    combinedError = errorMessage;
    return {
        tradeRecommendation: { recommendation: 'HOLD', reason: `Analysis error: ${combinedError}`, error: combinedError },
        newsSentiment: { overallSentiment: 'Unknown', summary: `Analysis error: ${combinedError}`, error: combinedError },
        marketOverviewData: { assetName, timeframe: timeframeId, error: combinedError },
        technicalIndicatorsData: { assetName, timeframe: timeframeId, error: combinedError },
        economicIndicatorData: { indicatorName: 'N/A', value: 'N/A', source: 'Error', error: combinedError },
        combinedError
    };
  }
}

export default function HomePage() {
  const [selectedAsset, setSelectedAsset] = useState(ASSETS[0]);
  const [selectedTimeframe, setSelectedTimeframe] = useState(TIMEFRAMES[0]);
  
  const [twelveDataApiKey, setTwelveDataApiKey] = useState<string | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState<string>('');
  const [isTwelveDataKeySet, setIsTwelveDataKeySet] = useState(false);

  // For ExchangeRate-API Key
  const [exchangeRateApiKey, setExchangeRateApiKey] = useState<string | null>(null);
  const [exchangeRateApiKeyInput, setExchangeRateApiKeyInput] = useState<string>('');
  const [isExchangeRateKeySet, setIsExchangeRateKeySet] = useState(false);


  const [aiData, setAiData] = useState<{
    tradeRecommendation: GenerateTradeRecommendationOutput | null;
    newsSentiment: SummarizeNewsSentimentOutput | null;
    marketOverviewData?: MarketData;
    technicalIndicatorsData?: MarketData;
    economicIndicatorData?: EconomicIndicatorData;
    combinedError?: string;
  } | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);


  useEffect(() => {
    const storedTwelveDataKey = localStorage.getItem('twelveDataApiKey');
    if (storedTwelveDataKey) {
      setTwelveDataApiKey(storedTwelveDataKey);
      setApiKeyInput(storedTwelveDataKey);
      setIsTwelveDataKeySet(true);
    }
    const storedExchangeRateKey = localStorage.getItem('exchangeRateApiKey');
    if (storedExchangeRateKey) {
      setExchangeRateApiKey(storedExchangeRateKey);
      setExchangeRateApiKeyInput(storedExchangeRateKey);
      setIsExchangeRateKeySet(true);
    }
    
    // Initial load will be triggered by the dependency array of the main loadData useEffect
    // if keys are already set.
     if (!storedTwelveDataKey) {
      setIsLoading(false); // No key, no initial load for market data
    }
  }, []);

  const loadData = useCallback(async (
      asset: typeof ASSETS[0], 
      timeframe: typeof TIMEFRAMES[0], 
      currentTwelveDataKey: string | null,
      currentExchangeRateKey: string | null
    ) => {
    if (!currentTwelveDataKey) {
      setLastError("Twelve Data API Key is not set. Please enter your API key to fetch market data.");
      setIsLoading(false);
      setAiData(null);
      return;
    }
    // ExchangeRateApiKey is not strictly critical for the app to function, so we don't block loading if it's missing.
    // It will show an error on the EconomicIndicatorCard instead.

    setIsLoading(true);
    setLastError(null);
    setAiData(null); // Clear previous data
    const data = await fetchCombinedDataForAsset(
        asset.id, 
        asset.name, 
        asset.type, 
        timeframe.id, 
        currentTwelveDataKey,
        currentExchangeRateKey
    );
    setAiData(data);
    if (data.combinedError) {
        setLastError(data.combinedError);
    } else if (data.marketOverviewData?.error || data.technicalIndicatorsData?.error || data.economicIndicatorData?.error) {
        // Collect individual errors if no combined error but some partial errors exist
        const errors = [
            data.marketOverviewData?.error,
            data.technicalIndicatorsData?.error,
            data.economicIndicatorData?.error
        ].filter(Boolean).join('; ');
        if(errors) setLastError(errors);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    // Only load if the primary API key (TwelveData) is set.
    // ExchangeRateAPI key is optional for core functionality.
    if (isTwelveDataKeySet && twelveDataApiKey) {
      loadData(selectedAsset, selectedTimeframe, twelveDataApiKey, exchangeRateApiKey);
    } else {
      setAiData(null); // Clear data if key isn't set
      setLastError("Twelve Data API Key is required to fetch market data.");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAsset, selectedTimeframe, isTwelveDataKeySet, twelveDataApiKey, isExchangeRateKeySet, exchangeRateApiKey]); // Added exchangeRateKey dependencies


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
      if (!twelveDataApiKey) {
        setLastError("Cannot refresh: Twelve Data API Key is not set.");
        return;
      }
      setIsRefreshing(true);
      setLastError(null); // Clear previous errors
      const data = await fetchCombinedDataForAsset(
          selectedAsset.id, 
          selectedAsset.name, 
          selectedAsset.type, 
          selectedTimeframe.id, 
          twelveDataApiKey,
          exchangeRateApiKey
        );
      setAiData(data);
      if (data.combinedError) {
        setLastError(data.combinedError);
      }
      setIsRefreshing(false);
  };

  const handleSetTwelveDataApiKey = () => {
    if (apiKeyInput.trim()) {
      localStorage.setItem('twelveDataApiKey', apiKeyInput.trim());
      setTwelveDataApiKey(apiKeyInput.trim());
      setIsTwelveDataKeySet(true);
      setLastError(null); 
      // Data load will be triggered by useEffect
    } else {
      localStorage.removeItem('twelveDataApiKey');
      setTwelveDataApiKey(null);
      setIsTwelveDataKeySet(false);
      setLastError("Twelve Data API Key cannot be empty.");
      setAiData(null); 
    }
  };

  const handleSetExchangeRateApiKey = () => {
    if (exchangeRateApiKeyInput.trim()) {
      localStorage.setItem('exchangeRateApiKey', exchangeRateApiKeyInput.trim());
      setExchangeRateApiKey(exchangeRateApiKeyInput.trim());
      setIsExchangeRateKeySet(true);
      // Optionally clear specific economic data errors if you want an immediate effect
      // setLastError(prev => prev?.replace(/Economic Data:.*?;? ?/g, '') || null); 
      // Data load will be triggered by useEffect
    } else {
      localStorage.removeItem('exchangeRateApiKey');
      setExchangeRateApiKey(null);
      setIsExchangeRateKeySet(false);
      // No need to set a blocking error, EconomicIndicatorCard will show its own error
       if (aiData?.economicIndicatorData) {
         setAiData(prev => prev ? ({...prev, economicIndicatorData: {...prev.economicIndicatorData!, error: "ExchangeRate-API Key removed." }}) : null);
       }
    }
  };


  const renderCardSkeleton = (heightClass = "h-[250px]") => <Skeleton className={`${heightClass} w-full`} />;

  const isDataFetchingDisabled = !isTwelveDataKeySet || isLoading || isRefreshing;

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <Header />
      <main className="flex-grow container mx-auto p-4 md:p-8">
        <div className="mb-6 p-4 border border-border rounded-lg bg-card shadow-md space-y-4">
          <div>
            <Label htmlFor="apiKeyInput" className="block text-sm font-medium text-foreground mb-1">
              Twelve Data API Key (Required for Market Data & AI Signals)
            </Label>
            <div className="flex gap-2 items-center">
              <Input
                id="apiKeyInput"
                type="text"
                placeholder="Enter your Twelve Data API Key"
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                className="flex-grow"
              />
              <Button onClick={handleSetTwelveDataApiKey} size="sm">
                <KeyRound className="mr-2 h-4 w-4" />
                Set Key
              </Button>
            </div>
            {!isTwelveDataKeySet && (
              <p className="text-xs text-muted-foreground mt-1">
                Required for price, RSI, MACD, and AI trade signals. Get yours from <a href="https://twelvedata.com/apikey" target="_blank" rel="noopener noreferrer" className="underline hover:text-primary">twelvedata.com</a>.
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="exchangeRateApiKeyInput" className="block text-sm font-medium text-foreground mb-1">
              ExchangeRate-API.com Key (Optional for Economic Indicators)
            </Label>
            <div className="flex gap-2 items-center">
              <Input
                id="exchangeRateApiKeyInput"
                type="text"
                placeholder="Enter your ExchangeRate-API.com Key"
                value={exchangeRateApiKeyInput}
                onChange={(e) => setExchangeRateApiKeyInput(e.target.value)}
                className="flex-grow"
              />
              <Button onClick={handleSetExchangeRateApiKey} size="sm">
                <KeyRound className="mr-2 h-4 w-4" />
                Set Key
              </Button>
            </div>
             {!isExchangeRateKeySet && (
                <p className="text-xs text-muted-foreground mt-1">
                Optional: for some economic indicators. Get yours from <a href="https://www.exchangerate-api.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-primary">exchangerate-api.com</a>.
                </p>
            )}
          </div>
           <div className="mt-3 p-3 border border-destructive/30 bg-destructive/10 text-destructive/80 rounded-md flex items-start gap-2 text-xs">
            <TriangleAlert className="h-4 w-4 mt-0.5 shrink-0" />
            <span>
              <strong>Security Note:</strong> API keys entered here are stored in your browser's local storage for convenience. For production apps, manage keys securely on a server.
            </span>
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
                 {!(lastError.toLowerCase().includes("api key") || lastError.toLowerCase().includes("twelve data api key")) &&
                  <p className="text-xs mt-1">Some data might be unavailable or outdated. AI analysis may be affected.</p>
                }
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
        ) : aiData && isTwelveDataKeySet ? (
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
        ) : (
             <div className="text-center py-10">
                <Info size={48} className="mx-auto text-muted-foreground mb-4" />
                <p className="text-xl text-muted-foreground">
                    {!isTwelveDataKeySet ? "Please set your Twelve Data API key to load market data." : "Select an asset and timeframe to begin or try refreshing."}
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

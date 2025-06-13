
'use client';

import { useState, useEffect, useCallback } from 'react';
import Header from '@/components/layout/Header';
import SignalDisplayCard from '@/components/dashboard/SignalDisplayCard';
import MarketOverviewCard from '@/components/dashboard/MarketOverviewCard';
import TechnicalIndicatorsCard, { 
    type TechnicalIndicatorsData as ProcessedTechnicalIndicatorsData,
    type RsiData,
    type MacdData,
} from '@/components/dashboard/TechnicalIndicatorsCard';
import SentimentAnalysisCard from '@/components/dashboard/SentimentAnalysisCard';
import EconomicIndicatorCard, { type EconomicIndicatorData as FetchedEconomicIndicatorData } from '@/components/dashboard/EconomicIndicatorCard'; // Renamed to avoid clash
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RefreshCw, Loader2, Clock, AlertTriangle, Info, KeyRound, Eye, EyeOff, PlayCircle, PauseCircle } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from "@/hooks/use-toast";

import { generateTradeRecommendation, GenerateTradeRecommendationInput, GenerateTradeRecommendationOutput } from '@/ai/flows/generate-trade-recommendation';
import { summarizeNewsSentiment, SummarizeNewsSentimentInput, SummarizeNewsSentimentOutput } from '@/ai/flows/summarize-news-sentiment';

// Import the refactored actions
import { fetchMarketData, MarketData } from '@/app/actions/fetch-market-data';
import { fetchEconomicData } from '@/app/actions/fetch-economic-data'; // FetchedEconomicIndicatorData is the type from this action

// Define the Asset structure with provider-specific IDs
interface Asset {
  name: string; // User-friendly name, e.g., "EUR/USD"
  type: 'currency' | 'commodity' | 'crypto';
  marketIds: { // For Price, RSI, MACD
    polygon?: string;     // e.g., C:EURUSD
    finnhub?: string;     // e.g., OANDA:EUR_USD
    twelvedata?: string;  // e.g., EUR/USD
  };
  economicIds: { // For exchange rates / economic indicators
    openexchangerates?: string; // e.g., EUR (base currency for pair) or XAU (for Gold)
    exchangerateapi?: string;   // e.g., EUR (base currency)
  };
}


const ASSETS: Asset[] = [
  { 
    name: "EUR/USD", type: "currency", 
    marketIds: { polygon: "C:EURUSD", finnhub: "OANDA:EUR_USD", twelvedata: "EUR/USD" },
    economicIds: { openexchangerates: "EUR", exchangerateapi: "EUR" }
  },
  { 
    name: "GBP/JPY", type: "currency", 
    marketIds: { polygon: "C:GBPJPY", finnhub: "OANDA:GBP_JPY", twelvedata: "GBP/JPY" },
    economicIds: { openexchangerates: "GBP", exchangerateapi: "GBP" }
  },
   { 
    name: "AUD/USD", type: "currency", 
    marketIds: { polygon: "C:AUDUSD", finnhub: "OANDA:AUD_USD", twelvedata: "AUD/USD" },
    economicIds: { openexchangerates: "AUD", exchangerateapi: "AUD" }
  },
  { 
    name: "USD/CAD", type: "currency", 
    marketIds: { polygon: "C:USDCAD", finnhub: "OANDA:USD_CAD", twelvedata: "USD/CAD" },
    economicIds: { openexchangerates: "USD", exchangerateapi: "USD" } // Base is USD
  },
  {
    name: "USD/JPY", type: "currency",
    marketIds: { polygon: "C:USDJPY", finnhub: "OANDA:USD_JPY", twelvedata: "USD/JPY" },
    economicIds: { openexchangerates: "USD", exchangerateapi: "USD" }
  },
  {
    name: "USD/CHF", type: "currency",
    marketIds: { polygon: "C:USDCHF", finnhub: "OANDA:USD_CHF", twelvedata: "USD/CHF" },
    economicIds: { openexchangerates: "USD", exchangerateapi: "USD" }
  },
  {
    name: "NZD/USD", type: "currency",
    marketIds: { polygon: "C:NZDUSD", finnhub: "OANDA:NZD_USD", twelvedata: "NZD/USD" },
    economicIds: { openexchangerates: "NZD", exchangerateapi: "NZD" }
  },
  {
    name: "EUR/GBP", type: "currency",
    marketIds: { polygon: "C:EURGBP", finnhub: "OANDA:EUR_GBP", twelvedata: "EUR/GBP" },
    economicIds: { openexchangerates: "EUR", exchangerateapi: "EUR" }
  },
  { 
    name: "Gold (XAU/USD)", type: "commodity", 
    marketIds: { polygon: "X:XAUUSD", finnhub: "FXCM:XAU/USD", twelvedata: "XAU/USD" }, // Finnhub uses various symbols, FXCM:XAU/USD is one
    economicIds: { openexchangerates: "XAU", exchangerateapi: "XAU" } // XAU might not work for ExchangeRate-API (FX only)
  },
  { 
    name: "Silver (XAG/USD)", type: "commodity", 
    marketIds: { polygon: "X:XAGUSD", finnhub: "FXCM:XAG/USD", twelvedata: "XAG/USD" },
    economicIds: { openexchangerates: "XAG", exchangerateapi: "XAG" }
  },
  { 
    name: "Crude Oil (WTI)", type: "commodity", 
    marketIds: { polygon: "CL", finnhub: "USO", twelvedata: "CL" }, // USO is an Oil ETF for Finnhub, CL might be generic for Polygon/TD
    economicIds: { openexchangerates: "WTI", exchangerateapi: "WTI" } // WTI for oil
  },
  { 
    name: "Bitcoin (BTC/USD)", type: "crypto", 
    marketIds: { polygon: "X:BTCUSD", finnhub: "BINANCE:BTCUSDT", twelvedata: "BTC/USD" },
    economicIds: { openexchangerates: "BTC", exchangerateapi: "BTC" }
  },
];


const TIMEFRAMES = [
  { id: "15min", name: "15min" },
  { id: "1H", name: "1H" },
  { id: "4H", name: "4H" },
  { id: "1D", name: "1D" },
];

const DEFAULT_POLYGON_KEY = 'zWvUPCQiznWJu0wB3hRic9Qr7YuDC26Q';
const DEFAULT_FINNHUB_KEY = 'd167e09r01qvtdbgqdfgd167e09r01qvtdbgqdg0';
const DEFAULT_TWELVEDATA_KEY = '3a10512308b24fbb880b7a137f824a4d';
const DEFAULT_OPEN_EXCHANGE_RATES_KEY = '23ea9d3f2b64490cb54e23b4c2b50133';
const DEFAULT_EXCHANGERATE_API_KEY = 'd30c5b3ab75049fb4f361d6d';


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
  const epsilon = 0.0000001; 
  if (macdData.histogram !== undefined && macdData.histogram > epsilon) return 'Uptrend';
  if (macdData.histogram !== undefined && macdData.histogram < -epsilon) return 'Downtrend';
  if (macdData.value > macdData.signal) return 'Uptrend';
  if (macdData.value < macdData.signal) return 'Downtrend';
  return 'Neutral';
};


async function fetchCombinedDataForAsset(
  asset: Asset, // Use the new Asset interface
  timeframeId: string,
  apiKeys: { // Group API keys
    polygon?: string | null;
    finnhub?: string | null;
    twelvedata?: string | null;
    openExchangeRates?: string | null;
    exchangeRateApi?: string | null;
  }
): Promise<{
  tradeRecommendation: GenerateTradeRecommendationOutput | null;
  newsSentiment: SummarizeNewsSentimentOutput | null;
  marketOverviewData?: MarketData; // This type is from fetch-market-data action
  technicalIndicatorsData?: ProcessedTechnicalIndicatorsData; // This type is from TechnicalIndicatorsCard
  economicIndicatorData?: FetchedEconomicIndicatorData; // This type is from EconomicIndicatorCard/fetch-economic-data
  combinedError?: string;
}> {
  let combinedError: string | undefined;

  try {
    const marketApiDataPromise = fetchMarketData(asset, timeframeId, {
      polygon: apiKeys.polygon,
      finnhub: apiKeys.finnhub,
      twelvedata: apiKeys.twelvedata,
    });
    const economicApiDataPromise = fetchEconomicData(asset, {
      openExchangeRates: apiKeys.openExchangeRates,
      exchangeRateApi: apiKeys.exchangeRateApi,
    });

    const [marketApiData, economicApiData] = await Promise.all([marketApiDataPromise, economicApiDataPromise]);

    let dataErrors: string[] = [];

    if (marketApiData.error) {
      dataErrors.push(`Market Data (${marketApiData.sourceProvider || 'Unknown'}): ${marketApiData.error}`);
    }
    if (economicApiData.error) {
      dataErrors.push(`Economic Data (${economicApiData.sourceProvider || 'Unknown'}): ${economicApiData.error}`);
    }
    
    if (dataErrors.length > 0) {
        combinedError = dataErrors.join('; ');
    }
    
    const rsi: RsiData = {
      value: marketApiData.rsi,
      status: getRsiStatus(marketApiData.rsi),
    };
    const macd: MacdData = {
      value: marketApiData.macd?.value,
      signal: marketApiData.macd?.signal,
      histogram: marketApiData.macd?.histogram,
      status: getMacdStatus(marketApiData.macd),
    };

    const processedTechIndicators: ProcessedTechnicalIndicatorsData = {
      rsi,
      macd,
      error: marketApiData.error && (!marketApiData.rsi && !marketApiData.macd?.value) ? marketApiData.error : undefined,
      // Pass sourceProvider to technical indicators card data
      sourceProvider: marketApiData.sourceProvider 
    };
    
    if (marketApiData.error && !marketApiData.price && !marketApiData.rsi && !marketApiData.macd?.value) {
         return {
            tradeRecommendation: { recommendation: 'HOLD', reason: `Market data unavailable: ${marketApiData.error}`, error: marketApiData.error },
            newsSentiment: { overallSentiment: 'Unknown', summary: `Sentiment analysis cannot proceed due to market data error: ${marketApiData.error}`, error: marketApiData.error },
            marketOverviewData: { ...marketApiData, error: marketApiData.error, sourceProvider: marketApiData.sourceProvider }, 
            technicalIndicatorsData: processedTechIndicators, // Already includes sourceProvider
            economicIndicatorData: { 
                indicatorName: economicApiData.indicatorName || 'N/A', 
                value: economicApiData.value || 'N/A', 
                sourceProvider: economicApiData.sourceProvider || 'N/A',
                comparisonCurrency: economicApiData.comparisonCurrency,
                lastUpdated: economicApiData.lastUpdated,
                error: economicApiData.error || combinedError 
            },
            combinedError,
        };
    }

    const currentPrice = marketApiData.price ?? (asset.type === 'crypto' ? 60000 : asset.type === 'commodity' ? (asset.name.includes("XAU") ? 2300 : (asset.name.includes("XAG") ? 25 : (asset.name.includes("Oil") ? 75 : 100) )) : 1.1);
    const rsiValue = marketApiData.rsi ?? 50;
    const macdValue = marketApiData.macd?.value ?? 0;
    
    const simulatedInterestRate = 0.5 + Math.random() * 2;
    const interestRateForAI = parseFloat(simulatedInterestRate.toFixed(2));

    let newsHeadlines: string[] = [
        `Market analysts watch ${asset.name} closely on ${timeframeId} charts.`,
        `Volatility expected for ${asset.type}s amid global economic shifts.`,
        `${asset.name} price movements influenced by recent ${timeframeId} trends.`
      ];
    if (asset.name.includes("EUR/USD")) newsHeadlines.push("ECB policy decisions in focus."); 
    if (asset.type === "crypto") newsHeadlines.push("Crypto market sentiment shifts rapidly."); 

    const tradeRecommendationInput: GenerateTradeRecommendationInput = {
      rsi: parseFloat(rsiValue.toFixed(2)),
      macd: parseFloat(macdValue.toFixed(4)),
      sentimentScore: parseFloat(((Math.random() * 2) - 1).toFixed(2)), 
      interestRate: interestRateForAI, 
      price: parseFloat(currentPrice.toFixed(asset.name.includes("JPY") || asset.name.includes("XAU") || asset.name.includes("XAG") || asset.name.includes("Oil") ? 2 : (asset.type === "crypto" ? 2 : 4))),
    };

    const newsSentimentInput: SummarizeNewsSentimentInput = { currencyPair: asset.name, newsHeadlines };

    const [tradeRecommendation, newsSentiment] = await Promise.all([
      generateTradeRecommendation(tradeRecommendationInput),
      summarizeNewsSentiment(newsSentimentInput)
    ]);
    
    // Ensure economicIndicatorData also gets sourceProvider
    const finalEconomicData: FetchedEconomicIndicatorData = {
        indicatorName: economicApiData.indicatorName,
        value: economicApiData.value,
        comparisonCurrency: economicApiData.comparisonCurrency,
        lastUpdated: economicApiData.lastUpdated,
        sourceProvider: economicApiData.sourceProvider, // Use sourceProvider
        error: economicApiData.error 
    };
    
    return {
        tradeRecommendation,
        newsSentiment,
        marketOverviewData: {...marketApiData, sourceProvider: marketApiData.sourceProvider}, // Ensure sourceProvider is passed
        technicalIndicatorsData: processedTechIndicators, // Already includes sourceProvider
        economicIndicatorData: finalEconomicData,
        combinedError: marketApiData.error || economicApiData.error || tradeRecommendation?.error || newsSentiment?.error || combinedError 
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    let finalCombinedError = `Unexpected error in data aggregation for ${asset.name}: ${errorMessage}`;
    console.error(`Error in fetchCombinedDataForAsset for ${asset.name} (${timeframeId}):`, errorMessage);
    
    const defaultTechIndicators: ProcessedTechnicalIndicatorsData = {
        rsi: { value: undefined, status: 'N/A' },
        macd: { value: undefined, signal: undefined, histogram: undefined, status: 'N/A' },
        error: finalCombinedError,
        sourceProvider: 'Unknown',
    };
    return {
        tradeRecommendation: { recommendation: 'HOLD', reason: `Analysis error: ${finalCombinedError}`, error: finalCombinedError },
        newsSentiment: { overallSentiment: 'Unknown', summary: `Analysis error: ${finalCombinedError}`, error: finalCombinedError },
        marketOverviewData: { assetName: asset.name, timeframe: timeframeId, error: finalCombinedError, sourceProvider: 'Unknown' },
        technicalIndicatorsData: defaultTechIndicators,
        economicIndicatorData: { indicatorName: 'N/A', value: 'N/A', sourceProvider: 'Unknown', error: finalCombinedError },
        combinedError: finalCombinedError
    };
  }
}

export default function HomePage() {
  const [selectedAsset, setSelectedAsset] = useState<Asset>(ASSETS[0]);
  const [selectedTimeframe, setSelectedTimeframe] = useState(TIMEFRAMES[0]);
  
  const [aiData, setAiData] = useState<{
    tradeRecommendation: GenerateTradeRecommendationOutput | null;
    newsSentiment: SummarizeNewsSentimentOutput | null;
    marketOverviewData?: MarketData;
    technicalIndicatorsData?: ProcessedTechnicalIndicatorsData;
    economicIndicatorData?: FetchedEconomicIndicatorData;
    combinedError?: string;
  } | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const { toast } = useToast();
  const [isAutoRefreshEnabled, setIsAutoRefreshEnabled] = useState(true);


  // API Key States
  const [polygonApiKey, setPolygonApiKey] = useState<string | null>(null);
  const [tempPolygonKey, setTempPolygonKey] = useState('');
  const [showPolygonKey, setShowPolygonKey] = useState(false);

  const [finnhubApiKey, setFinnhubApiKey] = useState<string | null>(null);
  const [tempFinnhubKey, setTempFinnhubKey] = useState('');
  const [showFinnhubKey, setShowFinnhubKey] = useState(false);

  const [twelveDataApiKey, setTwelveDataApiKey] = useState<string | null>(null);
  const [tempTwelveDataKey, setTempTwelveDataKey] = useState('');
  const [showTwelveDataKey, setShowTwelveDataKey] = useState(false);
  
  const [openExchangeRatesApiKey, setOpenExchangeRatesApiKey] = useState<string | null>(null);
  const [tempOpenExchangeRatesKey, setTempOpenExchangeRatesKey] = useState('');
  const [showOpenExchangeRatesKey, setShowOpenExchangeRatesKey] = useState(false);

  const [exchangeRateApiKey, setExchangeRateApiKey] = useState<string | null>(null);
  const [tempExchangeRateApiKey, setTempExchangeRateApiKey] = useState('');
  const [showExchangeRateApiKey, setShowExchangeRateApiKey] = useState(false);


  useEffect(() => {
    const initKey = (storageKey: string, defaultKey: string, setKeyFn: (key: string | null) => void, setTempKeyFn: (key: string) => void) => {
      let keyToUse = localStorage.getItem(storageKey);
      if (!keyToUse) {
        keyToUse = defaultKey;
        // localStorage.setItem(storageKey, keyToUse); // Don't set item if default is used, let user set it.
      }
      // If defaultKey is used (because nothing in local storage), still set it in state for pre-fill
      // But if keyToUse is null (meaning default was empty and nothing in storage), setKeyFn(null)
      setKeyFn(keyToUse || (defaultKey || null)); 
      setTempKeyFn(keyToUse || defaultKey || '');
    };

    initKey('polygonApiKey', DEFAULT_POLYGON_KEY, setPolygonApiKey, setTempPolygonKey);
    initKey('finnhubApiKey', DEFAULT_FINNHUB_KEY, setFinnhubApiKey, setTempFinnhubKey);
    initKey('twelveDataApiKey', DEFAULT_TWELVEDATA_KEY, setTwelveDataApiKey, setTempTwelveDataKey);
    initKey('openExchangeRatesApiKey', DEFAULT_OPEN_EXCHANGE_RATES_KEY, setOpenExchangeRatesApiKey, setTempOpenExchangeRatesKey);
    initKey('exchangeRateApiKey', DEFAULT_EXCHANGERATE_API_KEY, setExchangeRateApiKey, setTempExchangeRateApiKey);
    
    setIsLoading(false); 
  }, []);

  const handleSetKey = (tempKey: string, setKeyFn: (key: string | null) => void, storageKey: string, keyName: string) => {
    const trimmedKey = tempKey.trim();
    if (trimmedKey) {
      setKeyFn(trimmedKey);
      localStorage.setItem(storageKey, trimmedKey);
      toast({ title: `${keyName} API Key Set`, description: "Data fetching for this provider is configured." });
      // Trigger data load if essential keys are now set or updated
      // Determine current state of all keys for the loadData call
      const currentKeys = {
          polygon: storageKey === 'polygonApiKey' ? trimmedKey : polygonApiKey,
          finnhub: storageKey === 'finnhubApiKey' ? trimmedKey : finnhubApiKey,
          twelvedata: storageKey === 'twelveDataApiKey' ? trimmedKey : twelveDataApiKey,
          openExchangeRates: storageKey === 'openExchangeRatesApiKey' ? trimmedKey : openExchangeRatesApiKey,
          exchangeRateApi: storageKey === 'exchangeRateApiKey' ? trimmedKey : exchangeRateApiKey,
      };
      if (currentKeys.polygon || currentKeys.finnhub || currentKeys.twelvedata) { // if any market key is set
          loadData(selectedAsset, selectedTimeframe, currentKeys);
      }
    } else {
      setKeyFn(null); // Set state to null if input is empty
      localStorage.removeItem(storageKey); // Remove from local storage
      toast({ title: `${keyName} API Key Cleared`, description: `API key for ${keyName} has been removed.`, variant: "destructive" });
    }
  };


  const loadData = useCallback(async (
      asset: Asset, 
      timeframe: typeof TIMEFRAMES[0],
      currentApiKeys: { // Pass all keys
        polygon?: string | null;
        finnhub?: string | null;
        twelvedata?: string | null;
        openExchangeRates?: string | null;
        exchangeRateApi?: string | null;
      }
    ) => {
    if (!currentApiKeys.polygon && !currentApiKeys.finnhub && !currentApiKeys.twelvedata) {
      setLastError("At least one Market Data API key (Polygon, Finnhub, or TwelveData) is required. Please set one to fetch data.");
      setIsLoading(false); 
      setAiData(null); 
      return;
    }
    // No strict requirement for economic data keys, can proceed without them
    
    setIsLoading(true);
    setLastError(null);
    setAiData(null); 
    const data = await fetchCombinedDataForAsset(asset, timeframe.id, currentApiKeys);
    setAiData(data);
    
    // Consolidate errors for display
    let errorMessages: string[] = [];
    if (data.combinedError) errorMessages.push(data.combinedError);
    // Individual errors if not already part of combinedError (which it should be by new logic)
    // else {
    //     if (data.tradeRecommendation?.error) errorMessages.push(`AI Trade Rec: ${data.tradeRecommendation.error}`);
    //     if (data.newsSentiment?.error) errorMessages.push(`AI News Sent: ${data.newsSentiment.error}`);
    //     // market/economic errors are already in data.combinedError via fetchCombinedDataForAsset
    // }
    
    if (errorMessages.length > 0) {
        setLastError(errorMessages.join('; '));
    } else {
        setLastError(null); // Clear previous errors if successful
    }
    setIsLoading(false);
  }, []); 

  useEffect(() => {
    const currentApiKeys = { polygon: polygonApiKey, finnhub: finnhubApiKey, twelvedata: twelveDataApiKey, openExchangeRates: openExchangeRatesApiKey, exchangeRateApi: exchangeRateApiKey };
    if ((currentApiKeys.polygon || currentApiKeys.finnhub || currentApiKeys.twelvedata) && !isLoading && !isRefreshing) {
      if (!aiData) { 
         loadData(selectedAsset, selectedTimeframe, currentApiKeys);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [polygonApiKey, finnhubApiKey, twelveDataApiKey, openExchangeRatesApiKey, exchangeRateApiKey, selectedAsset, selectedTimeframe, loadData]);


  const handleAssetChange = (asset: Asset) => {
    if (asset.name !== selectedAsset.name) { // Compare by a unique identifier like name or a generated ID
      setSelectedAsset(asset);
      const currentApiKeys = { polygon: polygonApiKey, finnhub: finnhubApiKey, twelvedata: twelveDataApiKey, openExchangeRates: openExchangeRatesApiKey, exchangeRateApi: exchangeRateApiKey };
      if (currentApiKeys.polygon || currentApiKeys.finnhub || currentApiKeys.twelvedata) {
        loadData(asset, selectedTimeframe, currentApiKeys);
      }
    }
  };

  const handleTimeframeChange = (timeframe: typeof TIMEFRAMES[0]) => {
    if (timeframe.id !== selectedTimeframe.id) {
      setSelectedTimeframe(timeframe);
      const currentApiKeys = { polygon: polygonApiKey, finnhub: finnhubApiKey, twelvedata: twelveDataApiKey, openExchangeRates: openExchangeRatesApiKey, exchangeRateApi: exchangeRateApiKey };
      if (currentApiKeys.polygon || currentApiKeys.finnhub || currentApiKeys.twelvedata) {
        loadData(selectedAsset, timeframe, currentApiKeys);
      }
    }
  };

  const handleRefresh = useCallback(async () => {
    const currentApiKeys = { polygon: polygonApiKey, finnhub: finnhubApiKey, twelvedata: twelveDataApiKey, openExchangeRates: openExchangeRatesApiKey, exchangeRateApi: exchangeRateApiKey };
    if (!currentApiKeys.polygon && !currentApiKeys.finnhub && !currentApiKeys.twelvedata) {
      toast({ title: "Market Data API Key Required", description: "Please set at least one market data API key (Polygon, Finnhub, or TwelveData).", variant: "destructive" });
      return;
    }
      setIsRefreshing(true);
      setLastError(null); 
      const data = await fetchCombinedDataForAsset(selectedAsset, selectedTimeframe.id, currentApiKeys);
      setAiData(data);
      if (data.combinedError) {
        setLastError(data.combinedError);
      } else {
         setLastError(null);
      }
      setIsRefreshing(false);
  }, [polygonApiKey, finnhubApiKey, twelveDataApiKey, openExchangeRatesApiKey, exchangeRateApiKey, selectedAsset, selectedTimeframe, toast]);

  const renderCardSkeleton = (heightClass = "h-[250px]") => <Skeleton className={`${heightClass} w-full`} />;

  const isAnyMarketKeySet = !!(polygonApiKey || finnhubApiKey || twelveDataApiKey);
  const isKeySetupPhase = !isAnyMarketKeySet;
  const isDataFetchingDisabled = isLoading || isRefreshing || isKeySetupPhase;


  // Auto-refresh logic
  useEffect(() => {
    if (!isAutoRefreshEnabled || isKeySetupPhase || isLoading || isRefreshing || !aiData) {
      return; // Don't run if auto-refresh disabled, setting up keys, already loading/refreshing, or no initial data
    }

    const getIntervalMs = (timeframeId: string): number => {
      switch (timeframeId) {
        case '15min': return 1 * 60 * 1000;  // 1 minute
        case '1H':    return 5 * 60 * 1000;  // 5 minutes
        case '4H':    return 15 * 60 * 1000; // 15 minutes
        case '1D':    return 30 * 60 * 1000; // 30 minutes
        default:      return 5 * 60 * 1000;  // Default to 5 mins
      }
    };

    const intervalMs = getIntervalMs(selectedTimeframe.id);
    
    const intervalId = setInterval(() => {
      if (!document.hidden && !isRefreshing && !isLoading) { // Only refresh if tab is visible and not already refreshing/loading
        // console.log(`Auto-refresh triggered for ${selectedAsset.name} (${selectedTimeframe.name}) at ${new Date().toLocaleTimeString()}`);
        handleRefresh();
      }
    }, intervalMs);

    return () => {
      clearInterval(intervalId);
      // console.log(`Cleared auto-refresh for ${selectedAsset.name} (${selectedTimeframe.name})`);
    };
  }, [selectedAsset, selectedTimeframe, handleRefresh, isKeySetupPhase, isLoading, isRefreshing, aiData, isAutoRefreshEnabled]);


  const ApiKeyInputGroup = ({
    label,
    id,
    value,
    onChange,
    showKey,
    onToggleShowKey,
    onSetKey,
    placeholder,
    providerName
  }: {
    label: string;
    id: string;
    value: string;
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    showKey: boolean;
    onToggleShowKey: () => void;
    onSetKey: () => void;
    placeholder: string;
    providerName: string;
  }) => (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-foreground mb-1">{label}</label>
      <div className="flex gap-2 items-center">
        <Input
          id={id}
          type={showKey ? "text" : "password"}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          className="flex-grow"
        />
        <Button variant="ghost" size="icon" onClick={onToggleShowKey} aria-label={showKey ? `Hide ${providerName} API key` : `Show ${providerName} API key`}>
          {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
        </Button>
        <Button onClick={onSetKey} size="sm"><KeyRound size={16} /> Set</Button>
      </div>
    </div>
  );


  return (
    <div className="flex flex-col min-h-screen bg-background">
      <Header />
      <main className="flex-grow container mx-auto p-4 md:p-8">
        <div className="mb-6 p-4 border border-border rounded-lg bg-card shadow-md space-y-4">
            <h3 className="text-lg font-semibold text-foreground mb-2">API Key Configuration</h3>
            <p className="text-xs text-muted-foreground mb-3">
                API keys are pre-filled and stored in your browser's local storage. Change them if needed.
                The application will attempt to fetch market data by trying Polygon.io, then Finnhub.io, then TwelveData.
                Economic data will try OpenExchangeRates.org, then ExchangeRate-API.com.
            </p>
            <div className="grid md:grid-cols-2 gap-x-4 gap-y-6">
                <ApiKeyInputGroup
                    label="Polygon.io API Key (Market Data - Primary):"
                    id="polygonKeyInput"
                    value={tempPolygonKey}
                    onChange={(e) => setTempPolygonKey(e.target.value)}
                    showKey={showPolygonKey}
                    onToggleShowKey={() => setShowPolygonKey(!showPolygonKey)}
                    onSetKey={() => handleSetKey(tempPolygonKey, setPolygonApiKey, 'polygonApiKey', 'Polygon.io')}
                    placeholder="Enter Polygon.io API Key"
                    providerName="Polygon.io"
                />
                <ApiKeyInputGroup
                    label="Finnhub.io API Key (Market Data - Fallback 1):"
                    id="finnhubKeyInput"
                    value={tempFinnhubKey}
                    onChange={(e) => setTempFinnhubKey(e.target.value)}
                    showKey={showFinnhubKey}
                    onToggleShowKey={() => setShowFinnhubKey(!showFinnhubKey)}
                    onSetKey={() => handleSetKey(tempFinnhubKey, setFinnhubApiKey, 'finnhubApiKey', 'Finnhub.io')}
                    placeholder="Enter Finnhub.io API Key"
                    providerName="Finnhub.io"
                />
                 <ApiKeyInputGroup
                    label="Twelve Data API Key (Market Data - Fallback 2):"
                    id="twelveDataKeyInput"
                    value={tempTwelveDataKey}
                    onChange={(e) => setTempTwelveDataKey(e.target.value)}
                    showKey={showTwelveDataKey}
                    onToggleShowKey={() => setShowTwelveDataKey(!showTwelveDataKey)}
                    onSetKey={() => handleSetKey(tempTwelveDataKey, setTwelveDataApiKey, 'twelveDataApiKey', 'Twelve Data')}
                    placeholder="Enter Twelve Data API Key"
                    providerName="Twelve Data"
                />
                <ApiKeyInputGroup
                    label="Open Exchange Rates API Key (Economic Data - Primary):"
                    id="openExchangeRatesKeyInput"
                    value={tempOpenExchangeRatesKey}
                    onChange={(e) => setTempOpenExchangeRatesKey(e.target.value)}
                    showKey={showOpenExchangeRatesKey}
                    onToggleShowKey={() => setShowOpenExchangeRatesKey(!showOpenExchangeRatesKey)}
                    onSetKey={() => handleSetKey(tempOpenExchangeRatesKey, setOpenExchangeRatesApiKey, 'openExchangeRatesApiKey', 'Open Exchange Rates')}
                    placeholder="Enter Open Exchange Rates API Key"
                    providerName="Open Exchange Rates"
                />
                <ApiKeyInputGroup
                    label="ExchangeRate-API.com API Key (Economic Data - Fallback):"
                    id="exchangeRateApiKeyInput"
                    value={tempExchangeRateApiKey}
                    onChange={(e) => setTempExchangeRateApiKey(e.target.value)}
                    showKey={showExchangeRateApiKey}
                    onToggleShowKey={() => setShowExchangeRateApiKey(!showExchangeRateApiKey)}
                    onSetKey={() => handleSetKey(tempExchangeRateApiKey, setExchangeRateApiKey, 'exchangeRateApiKey', 'ExchangeRate-API.com')}
                    placeholder="Enter ExchangeRate-API.com API Key"
                    providerName="ExchangeRate-API.com"
                />
            </div>
             <div className="text-xs text-muted-foreground p-2 bg-muted/30 rounded-md mt-2">
                <AlertTriangle size={14} className="inline mr-1 text-destructive" />
                For production, API keys should be managed server-side. Storing sensitive keys in browser local storage is for convenience in development only.
            </div>
        </div>

        <div className="flex flex-col gap-4 mb-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h2 className="text-lg font-semibold text-foreground">Select Asset:</h2>
            <div className="flex gap-2 flex-wrap">
              {ASSETS.map(asset => (
                <Button
                  key={asset.name} // Use name as key, assuming names are unique
                  variant={selectedAsset.name === asset.name ? "default" : "outline"}
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
          <div className="flex flex-wrap justify-end gap-2 items-center">
            <Button 
                onClick={() => setIsAutoRefreshEnabled(prev => !prev)} 
                disabled={isKeySetupPhase} 
                className="self-end" 
                size="sm"
                variant={isAutoRefreshEnabled ? "secondary" : "default"}
            >
                {isAutoRefreshEnabled ? (
                    <PauseCircle className="mr-2 h-4 w-4" />
                ) : (
                    <PlayCircle className="mr-2 h-4 w-4" />
                )}
                {isAutoRefreshEnabled ? 'Stop Auto-Refresh' : 'Start Auto-Refresh'}
            </Button>
            <Button onClick={handleRefresh} disabled={isDataFetchingDisabled} className="self-end" size="sm">
                {isRefreshing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
                )}
                Refresh Data for {selectedAsset.name} ({selectedTimeframe.name})
            </Button>
          </div>
        </div>

        {lastError && (
          <div className="mb-4 p-4 border border-destructive/50 bg-destructive/10 text-destructive rounded-md flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 mt-0.5 shrink-0" />
            <div>
                <p className="font-semibold">Notice:</p>
                <p className="text-sm">{lastError}</p>
                <p className="text-xs mt-1">Some data might be unavailable or outdated. AI analysis may be affected. Check API key validity or console for provider-specific errors.</p>
            </div>
          </div>
        )}
        
        {isKeySetupPhase && !isLoading && ( 
            <div className="text-center py-10">
                <KeyRound size={48} className="mx-auto text-muted-foreground mb-4" />
                <p className="text-xl text-muted-foreground">
                    Please ensure at least one Market Data API key (Polygon, Finnhub, or TwelveData) is set above to enable core data fetching and AI analysis.
                </p>
                <p className="text-sm text-muted-foreground mt-2">
                    Default keys have been pre-filled. If they are incorrect or restricted, please update them.
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
              <SignalDisplayCard data={aiData?.tradeRecommendation} isLoading={isLoading || isRefreshing} />
            </div>
            <div className="lg:row-span-1">
              <MarketOverviewCard
                initialData={aiData?.marketOverviewData} // This should now contain sourceProvider
                key={`${selectedAsset.name}-${selectedTimeframe.id}-market`}
              />
            </div>
            <div className="lg:col-span-1">
              <TechnicalIndicatorsCard
                initialData={aiData?.technicalIndicatorsData} // This should now contain sourceProvider
                key={`${selectedAsset.name}-${selectedTimeframe.id}-tech`}
              />
            </div>
            <div className="lg:col-span-1">
              <SentimentAnalysisCard
                data={aiData?.newsSentiment}
                isLoading={isLoading || isRefreshing}
                currencyPair={selectedAsset.name}
              />
            </div>
            <div className="lg:col-span-1">
              <EconomicIndicatorCard
                initialData={aiData?.economicIndicatorData} // This should now contain sourceProvider
                 key={`${selectedAsset.name}-${selectedTimeframe.id}-econ`}
              />
            </div>
          </div>
        ) : !isKeySetupPhase && !isLoading ? ( 
             <div className="text-center py-10">
                <Info size={48} className="mx-auto text-muted-foreground mb-4" />
                <p className="text-xl text-muted-foreground">
                    Select an asset and timeframe, or try refreshing. If issues persist, check API key validity or console for errors.
                </p>
            </div>
        ) : null}
      </main>
      <footer className="text-center p-4 text-sm text-muted-foreground border-t border-border/50">
        Market data via Polygon.io, Finnhub.io, or TwelveData.
        Economic data via OpenExchangeRates.org or ExchangeRate-API.com.
        © {new Date().getFullYear()} ForeSight AI. All rights reserved.
      </footer>
    </div>
  );
}
    
    

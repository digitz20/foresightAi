
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
import EconomicIndicatorCard, { type EconomicIndicatorData as FetchedEconomicIndicatorData } from '@/components/dashboard/EconomicIndicatorCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RefreshCw, Loader2, Clock, AlertTriangle, Info, KeyRound, Eye, EyeOff, PlayCircle, PauseCircle } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from "@/hooks/use-toast";

import { generateTradeRecommendation, GenerateTradeRecommendationInput, GenerateTradeRecommendationOutput } from '@/ai/flows/generate-trade-recommendation';
import { summarizeNewsSentiment, SummarizeNewsSentimentInput, SummarizeNewsSentimentOutput } from '@/ai/flows/summarize-news-sentiment';

import { fetchMarketData, MarketData } from '@/app/actions/fetch-market-data';
import { fetchEconomicData } from '@/app/actions/fetch-economic-data';
import { fetchNewsHeadlines, NewsHeadlinesResult } from '@/app/actions/fetch-news-headlines';


interface Asset {
  name: string; 
  type: 'currency' | 'commodity' | 'crypto';
  searchKeywords: string[]; // Keywords for news search
  marketIds: { 
    polygon?: string;     
    finnhub?: string;     
    twelvedata?: string;  
  };
  economicIds: { 
    openexchangerates?: string; 
    exchangerateapi?: string;   
  };
}


const ASSETS: Asset[] = [
  { 
    name: "EUR/USD", type: "currency", searchKeywords: ["EUR", "USD", "Euro", "Dollar", "ECB", "Federal Reserve"],
    marketIds: { polygon: "C:EURUSD", finnhub: "OANDA:EUR_USD", twelvedata: "EUR/USD" },
    economicIds: { openexchangerates: "EUR", exchangerateapi: "EUR" }
  },
  { 
    name: "GBP/USD", type: "currency", searchKeywords: ["GBP", "USD", "British Pound", "US Dollar", "Bank of England", "BoE", "Federal Reserve", "Fed"],
    marketIds: { polygon: "C:GBPUSD", finnhub: "OANDA:GBP_USD", twelvedata: "GBP/USD" },
    economicIds: { openexchangerates: "GBP", exchangerateapi: "GBP" }
  },
  { 
    name: "USD/JPY", type: "currency", searchKeywords: ["USD", "JPY", "Japanese Yen", "Bank of Japan", "BoJ"],
    marketIds: { polygon: "C:USDJPY", finnhub: "OANDA:USD_JPY", twelvedata: "USD/JPY" },
    economicIds: { openexchangerates: "USD", exchangerateapi: "USD" }
  },
  { 
    name: "AUD/USD", type: "currency", searchKeywords: ["AUD", "USD", "Australian Dollar", "Reserve Bank of Australia", "RBA"],
    marketIds: { polygon: "C:AUDUSD", finnhub: "OANDA:AUD_USD", twelvedata: "AUD/USD" },
    economicIds: { openexchangerates: "AUD", exchangerateapi: "AUD" }
  },
  { 
    name: "USD/CAD", type: "currency", searchKeywords: ["USD", "CAD", "Canadian Dollar", "Bank of Canada", "BoC"],
    marketIds: { polygon: "C:USDCAD", finnhub: "OANDA:USD_CAD", twelvedata: "USD/CAD" },
    economicIds: { openexchangerates: "USD", exchangerateapi: "USD" } 
  },
  {
    name: "USD/CHF", type: "currency", searchKeywords: ["USD", "CHF", "Swiss Franc", "SNB", "Swiss National Bank"],
    marketIds: { polygon: "C:USDCHF", finnhub: "OANDA:USD_CHF", twelvedata: "USD/CHF" },
    economicIds: { openexchangerates: "USD", exchangerateapi: "USD" }
  },
  {
    name: "NZD/USD", type: "currency", searchKeywords: ["NZD", "USD", "New Zealand Dollar", "RBNZ", "Reserve Bank of New Zealand"],
    marketIds: { polygon: "C:NZDUSD", finnhub: "OANDA:NZD_USD", twelvedata: "NZD/USD" },
    economicIds: { openexchangerates: "NZD", exchangerateapi: "NZD" }
  },
  {
    name: "EUR/GBP", type: "currency", searchKeywords: ["EUR", "GBP", "Euro", "British Pound", "ECB", "BoE"],
    marketIds: { polygon: "C:EURGBP", finnhub: "OANDA:EUR_GBP", twelvedata: "EUR/GBP" },
    economicIds: { openexchangerates: "EUR", exchangerateapi: "EUR" }
  },
  { 
    name: "EUR/JPY", type: "currency", searchKeywords: ["EUR", "JPY", "Euro", "Japanese Yen", "ECB", "Bank of Japan", "BoJ"],
    marketIds: { polygon: "C:EURJPY", finnhub: "OANDA:EUR_JPY", twelvedata: "EUR/JPY" },
    economicIds: { openexchangerates: "EUR", exchangerateapi: "EUR" }
  },
  { 
    name: "GBP/JPY", type: "currency", searchKeywords: ["GBP", "JPY", "British Pound", "Japanese Yen", "Bank of England", "Bank of Japan"],
    marketIds: { polygon: "C:GBPJPY", finnhub: "OANDA:GBP_JPY", twelvedata: "GBP/JPY" },
    economicIds: { openexchangerates: "GBP", exchangerateapi: "GBP" }
  },
  { 
    name: "AUD/CAD", type: "currency", searchKeywords: ["AUD", "CAD", "Australian Dollar", "Canadian Dollar", "Reserve Bank of Australia", "RBA", "Bank of Canada", "BoC"],
    marketIds: { polygon: "C:AUDCAD", finnhub: "OANDA:AUD_CAD", twelvedata: "AUD/CAD" },
    economicIds: { openexchangerates: "AUD", exchangerateapi: "AUD" }
  },
  { 
    name: "USD/SGD", type: "currency", searchKeywords: ["USD", "SGD", "Singapore Dollar", "Monetary Authority of Singapore", "MAS"],
    marketIds: { polygon: "C:USDSGD", finnhub: "OANDA:USD_SGD", twelvedata: "USD/SGD" },
    economicIds: { openexchangerates: "USD", exchangerateapi: "USD" }
  },
  { 
    name: "Gold (XAU/USD)", type: "commodity", searchKeywords: ["Gold", "XAUUSD", "precious metals", "commodities"],
    marketIds: { polygon: "X:XAUUSD", finnhub: "FXCM:XAU/USD", twelvedata: "XAU/USD" }, 
    economicIds: { openexchangerates: "XAU", exchangerateapi: "XAU" } 
  },
  { 
    name: "Silver (XAG/USD)", type: "commodity", searchKeywords: ["Silver", "XAGUSD", "precious metals", "commodities"],
    marketIds: { polygon: "X:XAGUSD", finnhub: "FXCM:XAG/USD", twelvedata: "XAG/USD" },
    economicIds: { openexchangerates: "XAG", exchangerateapi: "XAG" }
  },
  { 
    name: "Crude Oil (WTI)", type: "commodity", searchKeywords: ["Crude Oil", "WTI", "energy", "OPEC"],
    marketIds: { polygon: "CL", finnhub: "USO", twelvedata: "CL" }, 
    economicIds: { openexchangerates: "WTI", exchangerateapi: "WTI" } 
  },
  { 
    name: "Bitcoin (BTC/USD)", type: "crypto", searchKeywords: ["Bitcoin", "BTC", "crypto", "cryptocurrency"],
    marketIds: { polygon: "X:BTCUSD", finnhub: "BINANCE:BTCUSDT", twelvedata: "BTC/USD" },
    economicIds: { openexchangerates: "BTC", exchangerateapi: "BTC" }
  },
];


const TIMEFRAMES = [
  { id: "5min", name: "5min" },
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
const DEFAULT_NEWSAPI_KEY = 'd2412348368f4a3ea431d8704ca200fc';


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
  asset: Asset, 
  timeframeId: string,
  apiKeys: { 
    polygon?: string | null;
    finnhub?: string | null;
    twelvedata?: string | null;
    openExchangeRates?: string | null;
    exchangeRateApi?: string | null;
    newsApi?: string | null; 
  }
): Promise<{
  tradeRecommendation: GenerateTradeRecommendationOutput | null;
  newsSentiment: SummarizeNewsSentimentOutput | null;
  marketOverviewData?: MarketData; 
  technicalIndicatorsData?: ProcessedTechnicalIndicatorsData; 
  economicIndicatorData?: FetchedEconomicIndicatorData; 
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
    
    let newsApiPromise: Promise<NewsHeadlinesResult> = Promise.resolve({ headlines: [], error: "NewsAPI key not provided." , sourceProvider: 'NewsAPI.org'});
    if (apiKeys.newsApi) {
        newsApiPromise = fetchNewsHeadlines(asset, apiKeys.newsApi);
    }

    const [marketApiData, economicApiData, fetchedNewsData] = await Promise.all([marketApiDataPromise, economicApiDataPromise, newsApiPromise]);
    
    let dataErrors: string[] = [];

    if (marketApiData.error) {
      dataErrors.push(`Market Data (${marketApiData.sourceProvider || 'Unknown'}): ${marketApiData.error}`);
    }
    if (economicApiData.error) {
      dataErrors.push(`Economic Data (${economicApiData.sourceProvider || 'Unknown'}): ${economicApiData.error}`);
    }
    if (fetchedNewsData.error && (!fetchedNewsData.headlines || fetchedNewsData.headlines.length === 0)) {
        dataErrors.push(`News Headlines (${fetchedNewsData.sourceProvider || 'NewsAPI.org'}): ${fetchedNewsData.error}`);
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
      sourceProvider: marketApiData.sourceProvider 
    };
    
    const headlinesForSentiment = fetchedNewsData.headlines && fetchedNewsData.headlines.length > 0 
        ? fetchedNewsData.headlines 
        : [`No specific news headlines found for ${asset.name}. General market conditions apply.`];
    
    const newsSentimentInput: SummarizeNewsSentimentInput = { currencyPair: asset.name, newsHeadlines: headlinesForSentiment };
    const newsSentiment = await summarizeNewsSentiment(newsSentimentInput);


    if (marketApiData.error && !marketApiData.price && !marketApiData.rsi && !marketApiData.macd?.value) {
         return {
            tradeRecommendation: { recommendation: 'HOLD', reason: `Market data unavailable: ${marketApiData.error}`, error: marketApiData.error },
            newsSentiment: newsSentiment, // Use the fetched news sentiment even if market data fails
            marketOverviewData: { ...marketApiData, error: marketApiData.error, sourceProvider: marketApiData.sourceProvider }, 
            technicalIndicatorsData: processedTechIndicators,
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
    
    // Derive sentiment score
    let derivedSentimentScore = 0.0;
    const sentimentText = newsSentiment?.overallSentiment?.toLowerCase();
    if (newsSentiment && !newsSentiment.error && sentimentText) {
      if (sentimentText.includes('positive')) {
        derivedSentimentScore = 0.7;
      } else if (sentimentText.includes('negative')) {
        derivedSentimentScore = -0.7;
      } else if (sentimentText.includes('mixed')) {
        derivedSentimentScore = 0.1; 
      }
      // Neutral or Unknown will remain 0.0
    }

    // Estimate interest rate
    let derivedInterestRate = 0.5; // Default fallback
    const primaryCurrencyForRate = asset.economicIds.openexchangerates?.toUpperCase() || asset.economicIds.exchangerateapi?.toUpperCase();

    if (primaryCurrencyForRate) {
        switch (primaryCurrencyForRate) {
            case 'EUR': derivedInterestRate = 0.5; break;
            case 'USD': derivedInterestRate = 1.0; break;
            case 'GBP': derivedInterestRate = 0.75; break;
            case 'JPY': derivedInterestRate = -0.1; break;
            case 'AUD': derivedInterestRate = 0.8; break;
            case 'CAD': derivedInterestRate = 0.9; break;
            case 'CHF': derivedInterestRate = 0.25; break;
            case 'NZD': derivedInterestRate = 0.85; break;
            case 'SGD': derivedInterestRate = 0.6; break; // Added SGD estimate
            case 'XAU': case 'XAG': case 'BTC': derivedInterestRate = 0.25; break; 
            case 'WTI': derivedInterestRate = 0.5; break; 
            default: derivedInterestRate = 0.5;
        }
    }

    const tradeRecommendationInput: GenerateTradeRecommendationInput = {
      rsi: parseFloat(rsiValue.toFixed(2)),
      macd: parseFloat(macdValue.toFixed(4)),
      sentimentScore: parseFloat(derivedSentimentScore.toFixed(2)), 
      interestRate: parseFloat(derivedInterestRate.toFixed(2)), 
      price: parseFloat(currentPrice.toFixed(asset.name.includes("JPY") || asset.name.includes("XAU") || asset.name.includes("XAG") || asset.name.includes("Oil") || asset.type === "crypto" ? 2 : 4)),
    };

    const tradeRecommendation = await generateTradeRecommendation(tradeRecommendationInput);
    
    const finalEconomicData: FetchedEconomicIndicatorData = {
        indicatorName: economicApiData.indicatorName,
        value: economicApiData.value,
        comparisonCurrency: economicApiData.comparisonCurrency,
        lastUpdated: economicApiData.lastUpdated,
        sourceProvider: economicApiData.sourceProvider,
        error: economicApiData.error 
    };
    
    let finalErrors: string[] = [];
    if (marketApiData.error) finalErrors.push(`Market: ${marketApiData.error}`);
    if (economicApiData.error) finalErrors.push(`Economic: ${economicApiData.error}`);
    if (fetchedNewsData.error && (!fetchedNewsData.headlines || fetchedNewsData.headlines.length === 0)) finalErrors.push(`News: ${fetchedNewsData.error}`);
    if (newsSentiment.error) finalErrors.push(`Sentiment AI: ${newsSentiment.error}`);
    if (tradeRecommendation.error) finalErrors.push(`Trade AI: ${tradeRecommendation.error}`);
    
    const finalCombinedError = finalErrors.length > 0 ? finalErrors.join('; ') : undefined;

    return {
        tradeRecommendation,
        newsSentiment,
        marketOverviewData: {...marketApiData, sourceProvider: marketApiData.sourceProvider},
        technicalIndicatorsData: processedTechIndicators, 
        economicIndicatorData: finalEconomicData,
        combinedError: finalCombinedError || combinedError
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
  
  const [newsApiKey, setNewsApiKey] = useState<string | null>(null);
  const [tempNewsApiKey, setTempNewsApiKey] = useState('');
  const [showNewsApiKey, setShowNewsApiKey] = useState(false);


  useEffect(() => {
    const initKey = (storageKey: string, defaultKey: string, setKeyFn: (key: string | null) => void, setTempKeyFn: (key: string) => void) => {
      let keyToUse = localStorage.getItem(storageKey);
      if (!keyToUse) {
        keyToUse = defaultKey;
      }
      setKeyFn(keyToUse || (defaultKey || null)); 
      setTempKeyFn(keyToUse || defaultKey || '');
    };

    initKey('polygonApiKey', DEFAULT_POLYGON_KEY, setPolygonApiKey, setTempPolygonKey);
    initKey('finnhubApiKey', DEFAULT_FINNHUB_KEY, setFinnhubApiKey, setTempFinnhubKey);
    initKey('twelveDataApiKey', DEFAULT_TWELVEDATA_KEY, setTwelveDataApiKey, setTempTwelveDataKey);
    initKey('openExchangeRatesApiKey', DEFAULT_OPEN_EXCHANGE_RATES_KEY, setOpenExchangeRatesApiKey, setTempOpenExchangeRatesKey);
    initKey('exchangeRateApiKey', DEFAULT_EXCHANGERATE_API_KEY, setExchangeRateApiKey, setTempExchangeRateApiKey);
    initKey('newsApiKey', DEFAULT_NEWSAPI_KEY, setNewsApiKey, setTempNewsApiKey);
    
    setIsLoading(false); 
  }, []);

  const handleSetKey = (tempKey: string, setKeyFn: (key: string | null) => void, storageKey: string, keyName: string) => {
    const trimmedKey = tempKey.trim();
    if (trimmedKey) {
      setKeyFn(trimmedKey);
      localStorage.setItem(storageKey, trimmedKey);
      toast({ title: `${keyName} API Key Set`, description: "Data fetching for this provider is configured." });
      
      const currentKeys = {
          polygon: storageKey === 'polygonApiKey' ? trimmedKey : polygonApiKey,
          finnhub: storageKey === 'finnhubApiKey' ? trimmedKey : finnhubApiKey,
          twelvedata: storageKey === 'twelveDataApiKey' ? trimmedKey : twelveDataApiKey,
          openExchangeRates: storageKey === 'openExchangeRatesApiKey' ? trimmedKey : openExchangeRatesApiKey,
          exchangeRateApi: storageKey === 'exchangeRateApiKey' ? trimmedKey : exchangeRateApiKey,
          newsApi: storageKey === 'newsApiKey' ? trimmedKey : newsApiKey,
      };
      if (currentKeys.polygon || currentKeys.finnhub || currentKeys.twelvedata) { 
          loadData(selectedAsset, selectedTimeframe, currentKeys);
      }
    } else {
      setKeyFn(null); 
      localStorage.removeItem(storageKey); 
      toast({ title: `${keyName} API Key Cleared`, description: `API key for ${keyName} has been removed.`, variant: "destructive" });
    }
  };


  const loadData = useCallback(async (
      asset: Asset, 
      timeframe: typeof TIMEFRAMES[0],
      currentApiKeys: { 
        polygon?: string | null;
        finnhub?: string | null;
        twelvedata?: string | null;
        openExchangeRates?: string | null;
        exchangeRateApi?: string | null;
        newsApi?: string | null;
      }
    ) => {
    if (!currentApiKeys.polygon && !currentApiKeys.finnhub && !currentApiKeys.twelvedata) {
      setLastError("At least one Market Data API key (Polygon, Finnhub, or TwelveData) is required. Please set one to fetch data.");
      setIsLoading(false); 
      setAiData(null); 
      return;
    }
        
    setIsLoading(true);
    setLastError(null);
    setAiData(null); 
    const data = await fetchCombinedDataForAsset(asset, timeframe.id, currentApiKeys);
    setAiData(data);
    
    let errorMessages: string[] = [];
    if (data.combinedError) errorMessages.push(data.combinedError);
    
    if (errorMessages.length > 0) {
        setLastError(errorMessages.join('; '));
    } else {
        setLastError(null); 
    }
    setIsLoading(false);
  }, []); 

  useEffect(() => {
    const currentApiKeys = { 
        polygon: polygonApiKey, 
        finnhub: finnhubApiKey, 
        twelvedata: twelveDataApiKey, 
        openExchangeRates: openExchangeRatesApiKey, 
        exchangeRateApi: exchangeRateApiKey,
        newsApi: newsApiKey, 
    };
    if ((currentApiKeys.polygon || currentApiKeys.finnhub || currentApiKeys.twelvedata) && !isLoading && !isRefreshing) {
      if (!aiData) { 
         loadData(selectedAsset, selectedTimeframe, currentApiKeys);
      }
    }
  }, [polygonApiKey, finnhubApiKey, twelveDataApiKey, openExchangeRatesApiKey, exchangeRateApiKey, newsApiKey, selectedAsset, selectedTimeframe, loadData, aiData, isLoading, isRefreshing]);


  const handleAssetChange = (asset: Asset) => {
    if (asset.name !== selectedAsset.name) { 
      setSelectedAsset(asset);
      const currentApiKeys = { polygon: polygonApiKey, finnhub: finnhubApiKey, twelvedata: twelveDataApiKey, openExchangeRates: openExchangeRatesApiKey, exchangeRateApi: exchangeRateApiKey, newsApi: newsApiKey };
      if (currentApiKeys.polygon || currentApiKeys.finnhub || currentApiKeys.twelvedata) {
        loadData(asset, selectedTimeframe, currentApiKeys);
      }
    }
  };

  const handleTimeframeChange = (timeframe: typeof TIMEFRAMES[0]) => {
    if (timeframe.id !== selectedTimeframe.id) {
      setSelectedTimeframe(timeframe);
      const currentApiKeys = { polygon: polygonApiKey, finnhub: finnhubApiKey, twelvedata: twelveDataApiKey, openExchangeRates: openExchangeRatesApiKey, exchangeRateApi: exchangeRateApiKey, newsApi: newsApiKey };
      if (currentApiKeys.polygon || currentApiKeys.finnhub || currentApiKeys.twelvedata) {
        loadData(selectedAsset, timeframe, currentApiKeys);
      }
    }
  };

  const handleRefresh = useCallback(async () => {
    const currentApiKeys = { polygon: polygonApiKey, finnhub: finnhubApiKey, twelvedata: twelveDataApiKey, openExchangeRates: openExchangeRatesApiKey, exchangeRateApi: exchangeRateApiKey, newsApi: newsApiKey };
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
  }, [polygonApiKey, finnhubApiKey, twelveDataApiKey, openExchangeRatesApiKey, exchangeRateApiKey, newsApiKey, selectedAsset, selectedTimeframe, toast]);

  const renderCardSkeleton = (heightClass = "h-[250px]") => <Skeleton className={`${heightClass} w-full`} />;

  const isAnyMarketKeySet = !!(polygonApiKey || finnhubApiKey || twelveDataApiKey);
  const isKeySetupPhase = !isAnyMarketKeySet;
  const isDataFetchingDisabled = isLoading || isRefreshing || isKeySetupPhase;


  useEffect(() => {
    if (!isAutoRefreshEnabled || isKeySetupPhase || isLoading || isRefreshing || !aiData) {
      return; 
    }

    const getIntervalMs = (timeframeId: string): number => {
      switch (timeframeId) {
        case '5min':  return 30 * 1000;      // 30 seconds for 5min timeframe
        case '15min': return 1 * 60 * 1000;  
        case '1H':    return 5 * 60 * 1000;  
        case '4H':    return 15 * 60 * 1000; 
        case '1D':    return 30 * 60 * 1000; 
        default:      return 5 * 60 * 1000;  
      }
    };

    const intervalMs = getIntervalMs(selectedTimeframe.id);
    
    const intervalId = setInterval(() => {
      if (!document.hidden && !isRefreshing && !isLoading) { 
        handleRefresh();
      }
    }, intervalMs);

    return () => {
      clearInterval(intervalId);
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
                Market data tries Polygon.io &rarr; Finnhub.io &rarr; TwelveData.
                Economic data tries OpenExchangeRates.org &rarr; ExchangeRate-API.com.
                News headlines are fetched from NewsAPI.org.
            </p>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-6">
                <ApiKeyInputGroup
                    label="Polygon.io API Key (Market Data):"
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
                    label="Finnhub.io API Key (Market Data):"
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
                    label="Twelve Data API Key (Market Data):"
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
                    label="Open Exchange Rates API Key (Economic Data):"
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
                    label="ExchangeRate-API.com Key (Economic Data):"
                    id="exchangeRateApiKeyInput"
                    value={tempExchangeRateApiKey}
                    onChange={(e) => setTempExchangeRateApiKey(e.target.value)}
                    showKey={showExchangeRateApiKey}
                    onToggleShowKey={() => setShowExchangeRateApiKey(!showExchangeRateApiKey)}
                    onSetKey={() => handleSetKey(tempExchangeRateApiKey, setExchangeRateApiKey, 'exchangeRateApiKey', 'ExchangeRate-API.com')}
                    placeholder="Enter ExchangeRate-API.com API Key"
                    providerName="ExchangeRate-API.com"
                />
                 <ApiKeyInputGroup
                    label="NewsAPI.org Key (News Headlines):"
                    id="newsApiKeyInput"
                    value={tempNewsApiKey}
                    onChange={(e) => setTempNewsApiKey(e.target.value)}
                    showKey={showNewsApiKey}
                    onToggleShowKey={() => setShowNewsApiKey(!showNewsApiKey)}
                    onSetKey={() => handleSetKey(tempNewsApiKey, setNewsApiKey, 'newsApiKey', 'NewsAPI.org')}
                    placeholder="Enter NewsAPI.org API Key"
                    providerName="NewsAPI.org"
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
                  key={asset.name} 
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
                initialData={aiData?.marketOverviewData} 
                key={`${selectedAsset.name}-${selectedTimeframe.id}-market`}
              />
            </div>
            <div className="lg:col-span-1">
              <TechnicalIndicatorsCard
                initialData={aiData?.technicalIndicatorsData} 
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
                initialData={aiData?.economicIndicatorData} 
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
        News headlines via NewsAPI.org.
        © {new Date().getFullYear()} ForeSight AI. All rights reserved.
      </footer>
    </div>
  );
}
    
    


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
import EconomicIndicatorCard, { type EconomicIndicatorData } from '@/components/dashboard/EconomicIndicatorCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RefreshCw, Loader2, Clock, AlertTriangle, Info, KeyRound, Eye, EyeOff } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from "@/hooks/use-toast";

import { generateTradeRecommendation, GenerateTradeRecommendationInput, GenerateTradeRecommendationOutput } from '@/ai/flows/generate-trade-recommendation';
import { summarizeNewsSentiment, SummarizeNewsSentimentInput, SummarizeNewsSentimentOutput } from '@/ai/flows/summarize-news-sentiment';
import { fetchMarketData, MarketData } from '@/app/actions/fetch-market-data';
import { fetchEconomicData, EconomicData as FetchedEconomicData } from '@/app/actions/fetch-economic-data';

const ASSETS = [
  { id: "C:EURUSD", name: "EUR/USD", type: "currency" },
  { id: "C:GBPJPY", name: "GBP/JPY", type: "currency" },
  { id: "C:AUDUSD", name: "AUD/USD", type: "currency" },
  { id: "C:USDCAD", name: "USD/CAD", type: "currency" },
  { id: "C:XAUUSD", name: "Gold (XAU/USD)", type: "commodity" },
  { id: "C:XAGUSD", name: "Silver (XAG/USD)", type: "commodity" },
  { id: "USO", name: "Crude Oil (USO ETF)", type: "commodity" }, // USO is an ETF
  { id: "X:BTCUSD", name: "Bitcoin (BTC/USD)", type: "crypto" },
];

const TIMEFRAMES = [
  { id: "15min", name: "15min" },
  { id: "1H", name: "1H" },
  { id: "4H", name: "4H" },
  { id: "1D", name: "1D" },
];

const DEFAULT_POLYGON_KEY = 'zWvUPCQiznWJu0wB3hRic9Qr7YuDC26Q';
const DEFAULT_OPEN_EXCHANGE_RATES_KEY = '23ea9d3f2b64490cb54e23b4c2b50133';


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
  assetId: string,
  assetName: string,
  assetType: string,
  timeframeId: string,
  polygonApiKey: string | null,
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
    const marketApiDataPromise = fetchMarketData(assetId, assetName, timeframeId, polygonApiKey);
    const economicApiDataPromise = fetchEconomicData(assetId, assetName, openExchangeRatesApiKey);

    const [marketApiData, economicApiData] = await Promise.all([marketApiDataPromise, economicApiDataPromise]);

    let dataErrors: string[] = [];

    if (marketApiData.error) {
      dataErrors.push(`Market Data: ${marketApiData.error}`);
    }

    if (economicApiData.error) {
      dataErrors.push(`Economic Data: ${economicApiData.error}`);
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
      error: marketApiData.error && (!marketApiData.rsi && !marketApiData.macd) ? marketApiData.error : undefined,
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

    const currentPrice = marketApiData.price ?? (assetType === 'crypto' ? 60000 : assetType === 'commodity' ? (assetId.includes("XAU") ? 2300 : (assetId.includes("XAG") ? 25 : (assetId.includes("USO") ? 75 : 100) )) : 1.1);
    const rsiValue = marketApiData.rsi ?? 50;
    const macdValue = marketApiData.macd?.value ?? 0;
    
    const simulatedInterestRate = 0.5 + Math.random() * 2;
    const interestRateForAI = parseFloat(simulatedInterestRate.toFixed(2));

    let newsHeadlines: string[] = [
        `Market analysts watch ${assetName} closely on ${timeframeId} charts.`,
        `Volatility expected for ${assetType}s amid global economic shifts.`,
        `${assetName} price movements influenced by recent ${timeframeId} trends.`
      ];
    if (assetId.includes("EURUSD")) newsHeadlines.push("ECB policy decisions in focus."); // C:EURUSD
    if (assetId.includes("BTC")) newsHeadlines.push("Crypto market sentiment shifts rapidly."); // X:BTCUSD

    const tradeRecommendationInput: GenerateTradeRecommendationInput = {
      rsi: parseFloat(rsiValue.toFixed(2)),
      macd: parseFloat(macdValue.toFixed(4)),
      sentimentScore: parseFloat(((Math.random() * 2) - 1).toFixed(2)), 
      interestRate: interestRateForAI, 
      price: parseFloat(currentPrice.toFixed(assetId.includes("JPY") || assetId.includes("XAU") || assetId.includes("XAG") || assetId.includes("USO") ? 2 : (assetId.includes("BTC") ? 2 : 4))),
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

  const [polygonApiKey, setPolygonApiKey] = useState<string | null>(null);
  const [openExchangeRatesApiKey, setOpenExchangeRatesApiKey] = useState<string | null>(null);
  const [tempPolygonKey, setTempPolygonKey] = useState('');
  const [tempOpenExchangeRatesKey, setTempOpenExchangeRatesKey] = useState('');
  const [showPolygonKey, setShowPolygonKey] = useState(false);
  const [showOpenExchangeRatesKey, setShowOpenExchangeRatesKey] = useState(false);


  useEffect(() => {
    let keyToUseForPolygon = localStorage.getItem('polygonApiKey');
    if (!keyToUseForPolygon) {
      keyToUseForPolygon = DEFAULT_POLYGON_KEY;
      localStorage.setItem('polygonApiKey', keyToUseForPolygon);
    }
    setPolygonApiKey(keyToUseForPolygon);
    setTempPolygonKey(keyToUseForPolygon);

    let keyToUseForOpenExchange = localStorage.getItem('openExchangeRatesApiKey');
    if (!keyToUseForOpenExchange) {
      keyToUseForOpenExchange = DEFAULT_OPEN_EXCHANGE_RATES_KEY;
      localStorage.setItem('openExchangeRatesApiKey', keyToUseForOpenExchange);
    }
    setOpenExchangeRatesApiKey(keyToUseForOpenExchange);
    setTempOpenExchangeRatesKey(keyToUseForOpenExchange);
    
    setIsLoading(false); 
  }, []);


  const handleSetPolygonKey = () => {
    if (tempPolygonKey.trim()) {
      setPolygonApiKey(tempPolygonKey.trim());
      localStorage.setItem('polygonApiKey', tempPolygonKey.trim());
      toast({ title: "Polygon.io API Key Set", description: "Market data fetching enabled." });
      if (openExchangeRatesApiKey) {
        loadData(selectedAsset, selectedTimeframe, tempPolygonKey.trim(), openExchangeRatesApiKey);
      }
    } else {
      toast({ title: "API Key Empty", description: "Please enter a valid Polygon.io API key.", variant: "destructive" });
    }
  };

  const handleSetOpenExchangeRatesKey = () => {
    if (tempOpenExchangeRatesKey.trim()) {
      setOpenExchangeRatesApiKey(tempOpenExchangeRatesKey.trim());
      localStorage.setItem('openExchangeRatesApiKey', tempOpenExchangeRatesKey.trim());
      toast({ title: "Open Exchange Rates API Key Set", description: "Economic data fetching enabled." });
      if (polygonApiKey) {
         loadData(selectedAsset, selectedTimeframe, polygonApiKey, tempOpenExchangeRatesKey.trim());
      }
    } else {
      toast({ title: "API Key Empty", description: "Please enter a valid Open Exchange Rates API key.", variant: "destructive" });
    }
  };


  const loadData = useCallback(async (
      asset: typeof ASSETS[0], 
      timeframe: typeof TIMEFRAMES[0],
      currentPolygonKey: string | null,
      currentOpenExchangeRatesKey: string | null
    ) => {
    if (!currentPolygonKey || !currentOpenExchangeRatesKey) {
      setLastError("One or more API keys are not set. Please set both API keys to fetch all data.");
      setIsLoading(false); 
      setAiData(null); 
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
        currentPolygonKey,
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
  }, []); 

  useEffect(() => {
    if (polygonApiKey && openExchangeRatesApiKey && !isLoading && !isRefreshing) {
      if (!aiData) {
         loadData(selectedAsset, selectedTimeframe, polygonApiKey, openExchangeRatesApiKey);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [polygonApiKey, openExchangeRatesApiKey, selectedAsset, selectedTimeframe, loadData]);


  const handleAssetChange = (asset: typeof ASSETS[0]) => {
    if (asset.id !== selectedAsset.id) {
      setSelectedAsset(asset);
      if (polygonApiKey && openExchangeRatesApiKey) {
        loadData(asset, selectedTimeframe, polygonApiKey, openExchangeRatesApiKey);
      }
    }
  };

  const handleTimeframeChange = (timeframe: typeof TIMEFRAMES[0]) => {
    if (timeframe.id !== selectedTimeframe.id) {
      setSelectedTimeframe(timeframe);
       if (polygonApiKey && openExchangeRatesApiKey) {
        loadData(selectedAsset, timeframe, polygonApiKey, openExchangeRatesApiKey);
      }
    }
  };

  const handleRefresh = async () => {
    if (!polygonApiKey || !openExchangeRatesApiKey) {
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
          polygonApiKey,
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

  const isDataFetchingDisabled = isLoading || isRefreshing || !polygonApiKey || !openExchangeRatesApiKey;
  const isKeySetupPhase = !polygonApiKey || !openExchangeRatesApiKey;

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <Header />
      <main className="flex-grow container mx-auto p-4 md:p-8">
        <div className="mb-6 p-4 border border-border rounded-lg bg-card shadow-md space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
                <div>
                    <label htmlFor="polygonKeyInput" className="block text-sm font-medium text-foreground mb-1">Polygon.io API Key:</label>
                    <div className="flex gap-2 items-center">
                        <Input 
                            id="polygonKeyInput"
                            type={showPolygonKey ? "text" : "password"}
                            value={tempPolygonKey} 
                            onChange={(e) => setTempPolygonKey(e.target.value)}
                            placeholder="Enter Polygon.io API Key"
                            className="flex-grow"
                        />
                        <Button variant="ghost" size="icon" onClick={() => setShowPolygonKey(!showPolygonKey)} aria-label={showPolygonKey ? "Hide API key" : "Show API key"}>
                            {showPolygonKey ? <EyeOff size={16} /> : <Eye size={16} />}
                        </Button>
                        <Button onClick={handleSetPolygonKey} size="sm"><KeyRound size={16} /> Set</Button>
                    </div>
                </div>
                <div>
                    <label htmlFor="openExchangeRatesKeyInput" className="block text-sm font-medium text-foreground mb-1">Open Exchange Rates API Key:</label>
                    <div className="flex gap-2 items-center">
                        <Input 
                            id="openExchangeRatesKeyInput"
                            type={showOpenExchangeRatesKey ? "text" : "password"} 
                            value={tempOpenExchangeRatesKey} 
                            onChange={(e) => setTempOpenExchangeRatesKey(e.target.value)}
                            placeholder="Enter Open Exchange Rates API Key"
                            className="flex-grow"
                        />
                         <Button variant="ghost" size="icon" onClick={() => setShowOpenExchangeRatesKey(!showOpenExchangeRatesKey)} aria-label={showOpenExchangeRatesKey ? "Hide API key" : "Show API key"}>
                            {showOpenExchangeRatesKey ? <EyeOff size={16} /> : <Eye size={16} />}
                        </Button>
                        <Button onClick={handleSetOpenExchangeRatesKey} size="sm"><KeyRound size={16} /> Set</Button>
                    </div>
                </div>
            </div>
             <div className="text-xs text-muted-foreground p-2 bg-muted/30 rounded-md mt-2">
                <AlertTriangle size={14} className="inline mr-1 text-destructive" />
                API keys are auto-filled and stored in your browser's local storage for convenience. For production, keys should be server-managed. Data fetching is disabled until keys are set.
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
                    Please set valid API keys above to enable data fetching and AI analysis.
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
                isLoading={isLoading || isRefreshing}
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
        Market data from <a href="https://polygon.io" target="_blank" rel="noopener noreferrer" className="underline hover:text-primary">Polygon.io</a>.
        Exchange rate data from <a href="https://openexchangerates.org" target="_blank" rel="noopener noreferrer" className="underline hover:text-primary">OpenExchangeRates.org</a>.
        © {new Date().getFullYear()} ForeSight AI. All rights reserved.
      </footer>
    </div>
  );
}
    
    

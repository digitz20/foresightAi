
'use client';

import { useState, useEffect, useCallback } from 'react';
import Header from '@/components/layout/Header';
import SignalDisplayCard from '@/components/dashboard/SignalDisplayCard';
import MarketOverviewCard from '@/components/dashboard/MarketOverviewCard';
import TechnicalIndicatorsCard from '@/components/dashboard/TechnicalIndicatorsCard';
import SentimentAnalysisCard from '@/components/dashboard/SentimentAnalysisCard';
import EconomicIndicatorCard from '@/components/dashboard/EconomicIndicatorCard';
import { Button } from '@/components/ui/button';
import { RefreshCw, Loader2, Clock } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

import { generateTradeRecommendation, GenerateTradeRecommendationInput, GenerateTradeRecommendationOutput } from '@/ai/flows/generate-trade-recommendation';
import { summarizeNewsSentiment, SummarizeNewsSentimentInput, SummarizeNewsSentimentOutput } from '@/ai/flows/summarize-news-sentiment';

const ASSETS = [
  { id: "EUR/USD", name: "EUR/USD", type: "currency" },
  { id: "GBP/JPY", name: "GBP/JPY", type: "currency" },
  { id: "AUD/USD", name: "AUD/USD", type: "currency" },
  { id: "USD/CAD", name: "USD/CAD", type: "currency" },
  { id: "XAU/USD", name: "Gold (XAU/USD)", type: "commodity" },
  { id: "XAG/USD", name: "Silver (XAG/USD)", type: "commodity" },
  { id: "OIL/USD", name: "Oil (WTI)", type: "commodity" },
  { id: "BTC/USD", name: "Bitcoin (BTC/USD)", type: "crypto" },
];

const TIMEFRAMES = [
  { id: "15min", name: "15min" },
  { id: "1H", name: "1H" },
  { id: "4H", name: "4H" },
  { id: "1D", name: "1D" },
];

// Helper function to generate slightly varied data
const getVariedData = (base: number, timeframe: string, assetType: string) => {
  let multiplier = 1;
  if (timeframe === "1H") multiplier = 1.05;
  else if (timeframe === "4H") multiplier = 1.1;
  else if (timeframe === "1D") multiplier = 1.15;

  if (assetType === "crypto") multiplier *= 1.5;
  if (assetType === "commodity") multiplier *= 1.2;
  
  return parseFloat((base * multiplier + (Math.random() - 0.5) * base * 0.1).toFixed(4));
};


async function fetchAiDataForAsset(currencyPair: string, timeframe: string): Promise<{
  tradeRecommendation: GenerateTradeRecommendationOutput | null;
  newsSentiment: SummarizeNewsSentimentOutput | null;
  marketOverviewData?: any; 
  technicalIndicatorsData?: any; 
  economicIndicatorData?: any;
}> {
  try {
    const assetConfig = ASSETS.find(a => a.id === currencyPair) || ASSETS[0];
    const assetType = assetConfig.type;

    let rsi = 45, macd = 0.0015, price = 1.0850, interestRate = 0.5;
    let newsHeadlines: string[] = [
        `Market awaits key economic data release for ${currencyPair}.`,
        `Global tensions cause market uncertainty, affecting ${assetType}s.`,
        `${assetType === 'currency' ? 'Forex' : assetType} markets react to ${timeframe} trends.`
      ];
    let marketPrice = 1.0853, marketChange = `+0.0012 (0.11%)`, marketIsPositive = true;
    let techRsiValue = 45, techMacdValue = 0.0015, techMacdSignal = 0.0010, techMacdHistogram = 0.0005;
    let econIndicatorName = 'Global Economic Outlook', econValue = 'Stable', econPrevious = 'Cautious', econImpact = 'Neutral';

    // Base values - these will be adjusted
    const baseRsi = 30 + Math.random() * 40; // Random RSI between 30 and 70
    const baseMacd = (Math.random() - 0.5) * 0.005; // Random MACD
    const basePrice = assetType === 'crypto' ? 60000 + Math.random() * 10000 : assetType === 'commodity' ? (currencyPair.includes("XAU") ? 2300 + Math.random() * 100 : (currencyPair.includes("XAG") ? 25 + Math.random() * 5 : 75 + Math.random() * 10)) : 1 + Math.random() * 0.5;
    const baseInterestRate = 0.1 + Math.random() * 5;


    rsi = getVariedData(baseRsi, timeframe, assetType);
    macd = getVariedData(baseMacd, timeframe, assetType);
    price = getVariedData(basePrice, timeframe, assetType);
    interestRate = baseInterestRate; // Interest rates are less volatile for this sim

    if (currencyPair === "EUR/USD") {
      newsHeadlines = [
        `Euro gains momentum on ${timeframe} charts.`,
        "Dollar weakens amid mixed economic data.",
        `Positive outlook for Eurozone manufacturing sector affecting EUR/USD on ${timeframe} view.`
      ];
      marketPrice = price; marketChange = `${(price * 0.001 * (Math.random() > 0.5 ? 1 : -1)).toFixed(4)} (${(0.1 * (Math.random() > 0.5 ? 1 : -1)).toFixed(2)}%)`; marketIsPositive = Math.random() > 0.5;
      econIndicatorName = 'Eurozone Inflation Rate'; econValue = `${(1 + Math.random() * 2).toFixed(1)}%`; econPrevious = `${(1 + Math.random() * 2).toFixed(1)}%`; econImpact = 'Moderate';
    } else if (currencyPair === "GBP/JPY") {
        newsHeadlines = [
        `BoE Governor's speech impacts Sterling on ${timeframe} outlook.`,
        `Yen strength observed due to risk-off sentiment for ${currencyPair}.`,
        `UK inflation data slightly higher than expected, watch ${timeframe} charts.`
      ];
      marketPrice = price; marketChange = `${(price * 0.001 * (Math.random() > 0.5 ? 1 : -1)).toFixed(2)} (${(0.1 * (Math.random() > 0.5 ? 1 : -1)).toFixed(2)}%)`; marketIsPositive = Math.random() > 0.5;
      econIndicatorName = 'UK GDP Growth'; econValue = `${(0.1 + Math.random() * 0.5).toFixed(1)}%`; econPrevious = `${(0.1 + Math.random() * 0.5).toFixed(1)}%`; econImpact = 'Low';
    } else if (currencyPair === "AUD/USD") {
        newsHeadlines = [ `RBA policy decisions influencing AUD/USD on ${timeframe} charts.`, `Commodity prices impact on Australian Dollar.`, `US economic data creating volatility for AUD/USD.`];
        marketPrice = price; marketChange = `${(price * 0.001 * (Math.random() > 0.5 ? 1 : -1)).toFixed(4)} (${(0.1 * (Math.random() > 0.5 ? 1 : -1)).toFixed(2)}%)`; marketIsPositive = Math.random() > 0.5;
        econIndicatorName = 'Australia Employment Change'; econValue = `${Math.floor(Math.random()*20)-10}K`; econPrevious = `${Math.floor(Math.random()*20)-10}K`; econImpact = 'Significant';
    } else if (currencyPair === "USD/CAD") {
        newsHeadlines = [ `Oil price fluctuations key for USD/CAD on ${timeframe} view.`, `Bank of Canada's stance on interest rates.`, `Canadian economic performance affecting CAD.`];
        marketPrice = price; marketChange = `${(price * 0.001 * (Math.random() > 0.5 ? 1 : -1)).toFixed(4)} (${(0.1 * (Math.random() > 0.5 ? 1 : -1)).toFixed(2)}%)`; marketIsPositive = Math.random() > 0.5;
        econIndicatorName = 'Canada Retail Sales'; econValue = `${(Math.random()*1 - 0.5).toFixed(1)}%`; econPrevious = `${(Math.random()*1 - 0.5).toFixed(1)}%`; econImpact = 'Moderate';
    } else if (currencyPair === "XAU/USD") { 
      newsHeadlines = [
        `Gold prices react to geopolitical shifts, ${timeframe} analysis.`,
        "Fed's interest rate outlook influences precious metals.",
        `Strong demand for gold from central banks affects ${timeframe} prices.`
      ];
      marketPrice = price; marketChange = `${(price * 0.005 * (Math.random() > 0.5 ? 1 : -1)).toFixed(2)} (${(0.5 * (Math.random() > 0.5 ? 1 : -1)).toFixed(2)}%)`; marketIsPositive = Math.random() > 0.5;
      econIndicatorName = 'Global Risk Sentiment'; econValue = 'Elevated'; econPrevious = 'Moderate'; econImpact = 'High for Gold';
    } else if (currencyPair === "XAG/USD") {
        newsHeadlines = [ `Silver follows gold but with higher volatility on ${timeframe} charts.`, `Industrial demand outlook for silver.`, `Market sentiment towards precious metals.`];
        marketPrice = price; marketChange = `${(price * 0.01 * (Math.random() > 0.5 ? 1 : -1)).toFixed(2)} (${(1 * (Math.random() > 0.5 ? 1 : -1)).toFixed(2)}%)`; marketIsPositive = Math.random() > 0.5;
        econIndicatorName = 'Industrial Production Index'; econValue = 'Growing'; econPrevious = 'Stable'; econImpact = 'High for Silver';
    } else if (currencyPair === "OIL/USD") {
        newsHeadlines = [ `OPEC+ decisions impact oil supply and ${timeframe} prices.`, `Global energy demand forecasts.`, `Inventory reports create short-term oil volatility.`];
        marketPrice = price; marketChange = `${(price * 0.01 * (Math.random() > 0.5 ? 1 : -1)).toFixed(2)} (${(1 * (Math.random() > 0.5 ? 1 : -1)).toFixed(2)}%)`; marketIsPositive = Math.random() > 0.5;
        econIndicatorName = 'US Crude Oil Inventories'; econValue = `${(Math.random()*4-2).toFixed(1)}M barrels`; econPrevious = `${(Math.random()*4-2).toFixed(1)}M barrels`; econImpact = 'High for Oil';
    } else if (currencyPair === "BTC/USD") { 
        newsHeadlines = [
            `Bitcoin ETFs see varied inflows, note ${timeframe} impact.`,
            `Regulatory uncertainty continues for crypto on ${timeframe} horizon.`,
            `Adoption news for Bitcoin and other cryptocurrencies.`
        ];
        marketPrice = price; marketChange = `${(price * 0.02 * (Math.random() > 0.5 ? 1 : -1)).toFixed(2)} (${(2 * (Math.random() > 0.5 ? 1 : -1)).toFixed(2)}%)`; marketIsPositive = Math.random() > 0.5;
        econIndicatorName = 'Crypto Fear & Greed Index'; econValue = `${Math.floor(Math.random()*100)}`; econPrevious = `${Math.floor(Math.random()*100)}`; econImpact = 'High for BTC';
    }

    techRsiValue = rsi;
    techMacdValue = macd;
    // Ensure histogram is plausible relative to MACD and Signal
    techMacdSignal = macd * (0.8 + Math.random() * 0.4); // Signal is some fraction of MACD
    techMacdHistogram = macd - techMacdSignal;

    const tradeRecommendationInput: GenerateTradeRecommendationInput = {
      rsi: parseFloat(rsi.toFixed(2)), 
      macd: parseFloat(macd.toFixed(4)), 
      sentimentScore: parseFloat(((Math.random() * 2) - 1).toFixed(2)), // Random sentiment score -1 to 1
      interestRate: parseFloat(interestRate.toFixed(2)), 
      price: parseFloat(price.toFixed(currencyPair.includes("JPY") || currencyPair.includes("XAU") ? 2 : 4)),
    };
    const newsSentimentInput: SummarizeNewsSentimentInput = { currencyPair, newsHeadlines };
    
    const marketOverviewData = { pair: currencyPair, value: marketPrice, change: marketChange, isPositive: marketIsPositive, timeframe };
    const technicalIndicatorsData = {
        rsi: { value: parseFloat(techRsiValue.toFixed(2)), status: techRsiValue < 30 ? 'Oversold' : techRsiValue > 70 ? 'Overbought' : 'Neutral' },
        macd: { value: parseFloat(techMacdValue.toFixed(4)), signal: parseFloat(techMacdSignal.toFixed(4)), histogram: parseFloat(techMacdHistogram.toFixed(4)), status: techMacdHistogram > 0 ? 'Uptrend' : 'Downtrend' },
    };
    const economicIndicatorData = { indicatorName: econIndicatorName, value: econValue, previous: econPrevious, impact: econImpact, source: 'Simulated API' };

    const [tradeRecommendation, newsSentiment] = await Promise.all([
      generateTradeRecommendation(tradeRecommendationInput),
      summarizeNewsSentiment(newsSentimentInput)
    ]);
    
    return { tradeRecommendation, newsSentiment, marketOverviewData, technicalIndicatorsData, economicIndicatorData };
  } catch (error) {
    console.error(`Error fetching AI data for ${currencyPair} (${timeframe}):`, error);
    return { 
        tradeRecommendation: null, newsSentiment: null,
        marketOverviewData: { pair: currencyPair, value: 0, change: "N/A", isPositive: false, timeframe },
        technicalIndicatorsData: { rsi: { value: 0, status: 'N/A' }, macd: { value: 0, signal: 0, histogram: 0, status: 'N/A' } },
        economicIndicatorData: { indicatorName: 'N/A', value: 'N/A', previous: 'N/A', impact: 'N/A', source: 'Error' }
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
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadData = useCallback(async (assetId: string, timeframeId: string) => {
    setIsLoading(true);
    const data = await fetchAiDataForAsset(assetId, timeframeId);
    setAiData(data);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    loadData(selectedAsset.id, selectedTimeframe.id);
  }, [selectedAsset, selectedTimeframe, loadData]);

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
      const data = await fetchAiDataForAsset(selectedAsset.id, selectedTimeframe.id);
      setAiData(data);
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
            Refresh Signal for {selectedAsset.name} ({selectedTimeframe.name})
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
                key={selectedAsset.id + "-" + selectedTimeframe.id + "-market"}
              />
            )}
          </div>
          
          <div className="lg:col-span-1">
            {isLoading ? renderCardSkeleton("h-[350px]") : (
             <TechnicalIndicatorsCard 
                initialData={aiData?.technicalIndicatorsData} 
                key={selectedAsset.id + '-' + selectedTimeframe.id + '-tech'}
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
                key={selectedAsset.id + '-' + selectedTimeframe.id + '-econ'}
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

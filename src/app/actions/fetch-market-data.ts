
'use server';

import { format, subDays } from 'date-fns';

// This interface is now shared and needs to be consistent with page.tsx
interface AssetMarketIds {
  polygon?: string;
  finnhub?: string;
  twelvedata?: string;
}

interface Asset {
  name: string;
  type: string;
  marketIds: AssetMarketIds;
  // economicIds are handled by fetch-economic-data.ts
}

export interface HistoricalDataPoint {
  date: string; // Formatted date string e.g., "MMM dd"
  price: number;
}

export interface MarketData {
  price?: number;
  rsi?: number;
  macd?: {
    value?: number;
    signal?: number;
    histogram?: number;
  };
  historical?: HistoricalDataPoint[];
  error?: string;
  assetName?: string;
  timeframe?: string;
  sourceProvider?: 'Polygon.io' | 'Finnhub.io' | 'TwelveData' | 'Unknown';
  providerSpecificError?: boolean; // True if error is due to current provider (e.g. key, rate limit)
}

// Helper to map our timeframe IDs to Polygon.io timespan strings for indicators
function mapTimeframeToPolygonTimespan(timeframeId: string): string {
  switch (timeframeId) {
    case '15min': case '1H': case '4H': return 'hour';
    case '1D': return 'day';
    default: return 'hour';
  }
}

// Helper to map our timeframe IDs to Finnhub resolution
function mapTimeframeToFinnhubResolution(timeframeId: string): string {
  switch (timeframeId) {
    case '15min': return '15';
    case '1H': return '60';
    case '4H': return 'D'; // Finnhub may not have 4H, use Daily as fallback
    case '1D': return 'D';
    default: return '60';
  }
}

// Helper to map our timeframe IDs to Twelve Data interval
function mapTimeframeToTwelveDataInterval(timeframeId: string): string {
  switch (timeframeId) {
    case '15min': return '15min';
    case '1H': return '1h';
    case '4H': return '4h';
    case '1D': return '1day';
    default: return '1h';
  }
}


async function fetchFromPolygon(
  polygonTicker: string,
  assetName: string,
  timeframeId: string,
  apiKey: string
): Promise<MarketData> {
  const result: MarketData = { assetName, timeframe: timeframeId, sourceProvider: 'Polygon.io' };
  const indicatorTimespan = mapTimeframeToPolygonTimespan(timeframeId);
  const baseUrl = 'https://api.polygon.io';

  // For Price, RSI, MACD
  const priceUrl = `${baseUrl}/v2/aggs/ticker/${polygonTicker}/prev?adjusted=true&apiKey=${apiKey}`;
  const rsiUrl = `${baseUrl}/v1/indicators/rsi/${polygonTicker}?timespan=${indicatorTimespan}&adjusted=true&window=14&series_type=close&order=desc&limit=1&apiKey=${apiKey}`;
  const macdUrl = `${baseUrl}/v1/indicators/macd/${polygonTicker}?timespan=${indicatorTimespan}&adjusted=true&short_window=12&long_window=26&signal_window=9&series_type=close&order=desc&limit=1&apiKey=${apiKey}`;

  // For Historical Chart Data (last 60 days, daily)
  const today = new Date();
  const fromDate = format(subDays(today, 90), 'yyyy-MM-dd'); // Fetch 90 days to ensure enough points after filtering
  const toDate = format(today, 'yyyy-MM-dd');
  const historicalUrl = `${baseUrl}/v2/aggs/ticker/${polygonTicker}/range/1/day/${fromDate}/${toDate}?adjusted=true&sort=asc&limit=120&apiKey=${apiKey}`;

  let fetchErrors: string[] = [];
  let isKeyOrRateLimitError = false;

  try {
    const [priceResponse, rsiResponse, macdResponse, historicalResponse] = await Promise.all([
      fetch(priceUrl, { next: { revalidate: 300 } }),
      fetch(rsiUrl, { next: { revalidate: 600 } }),
      fetch(macdUrl, { next: { revalidate: 600 } }),
      fetch(historicalUrl, { next: { revalidate: 3600 } }), // Cache historical data longer
    ]);

    // Process Price
    if (!priceResponse.ok) {
      const errorText = await priceResponse.text();
      let detail = `Price API Error ${priceResponse.status}: ${errorText.substring(0,100)}`;
      if (priceResponse.status === 401 || priceResponse.status === 403) { detail = 'Invalid/unauthorized API Key.'; isKeyOrRateLimitError = true; }
      if (priceResponse.status === 429) { detail = 'API rate limit hit.'; isKeyOrRateLimitError = true; }
      fetchErrors.push(detail);
    } else {
      const priceData = await priceResponse.json();
      if (priceData.results?.[0]?.c !== undefined) result.price = parseFloat(priceData.results[0].c);
      else if (priceData.status === 'ERROR') fetchErrors.push(`Price: API error - ${priceData.error || priceData.message}`);
      else fetchErrors.push('Price: Data not found/unexpected format.');
    }

    // Process RSI
    if (!rsiResponse.ok) {
      const errorText = await rsiResponse.text();
      let detail = `RSI API Error ${rsiResponse.status}: ${errorText.substring(0,100)}`;
      if (rsiResponse.status === 401 || rsiResponse.status === 403) { detail = 'Invalid/unauthorized API Key.'; isKeyOrRateLimitError = true; }
      if (rsiResponse.status === 429) { detail = 'API rate limit hit.'; isKeyOrRateLimitError = true; }
      fetchErrors.push(detail);
    } else {
      const rsiData = await rsiResponse.json();
      if (rsiData.results?.values?.[0]?.value !== undefined) result.rsi = parseFloat(rsiData.results.values[0].value);
      else if (rsiData.status === 'ERROR') fetchErrors.push(`RSI: API error - ${rsiData.error || rsiData.message}`);
      else fetchErrors.push('RSI: Data not found/unexpected format.');
    }

    // Process MACD
    if (!macdResponse.ok) {
      const errorText = await macdResponse.text();
      let detail = `MACD API Error ${macdResponse.status}: ${errorText.substring(0,100)}`;
      if (macdResponse.status === 401 || macdResponse.status === 403) { detail = 'Invalid/unauthorized API Key.'; isKeyOrRateLimitError = true; }
      if (macdResponse.status === 429) { detail = 'API rate limit hit.'; isKeyOrRateLimitError = true; }
      fetchErrors.push(detail);
    } else {
      const macdData = await macdResponse.json();
      if (macdData.results?.values?.[0]?.value !== undefined) {
        result.macd = {
          value: parseFloat(macdData.results.values[0].value),
          signal: parseFloat(macdData.results.values[0].signal),
          histogram: parseFloat(macdData.results.values[0].histogram),
        };
      } else if (macdData.status === 'ERROR') fetchErrors.push(`MACD: API error - ${macdData.error || macdData.message}`);
      else fetchErrors.push('MACD: Data not found/unexpected format.');
    }

    // Process Historical Data
    if (!historicalResponse.ok) {
        const errorText = await historicalResponse.text();
        let detail = `Historical API Error ${historicalResponse.status}: ${errorText.substring(0,100)}`;
        if (historicalResponse.status === 401 || historicalResponse.status === 403) { detail = 'Invalid/unauthorized API Key for historical data.'; isKeyOrRateLimitError = true; }
        if (historicalResponse.status === 429) { detail = 'API rate limit hit for historical data.'; isKeyOrRateLimitError = true; }
        fetchErrors.push(detail);
    } else {
        const historicalData = await historicalResponse.json();
        if (historicalData.results) {
            result.historical = historicalData.results
              .map((r: any) => ({
                date: format(new Date(r.t), 'MMM dd'), // Format date for chart
                price: r.c,
              }))
              .slice(-60); // Take last 60 points for a cleaner chart
        } else if (historicalData.status === 'ERROR') {
            fetchErrors.push(`Historical: API error - ${historicalData.error || historicalData.message}`);
        } else {
            fetchErrors.push('Historical: Data not found/unexpected format.');
        }
    }


    if (fetchErrors.length > 0) {
      result.error = `Polygon.io: ${fetchErrors.join('; ')}`;
      result.providerSpecificError = isKeyOrRateLimitError || fetchErrors.some(e => e.toLowerCase().includes('api key') || e.toLowerCase().includes('rate limit'));
    }
     if (!result.price && !result.rsi && !result.macd?.value && !result.historical?.length && !result.error) {
        result.error = `Polygon.io: No market data could be retrieved for ${assetName}. Verify symbol and API key/plan. Timespan: '${indicatorTimespan}'.`;
        result.providerSpecificError = true; // Likely a symbol or config issue with this provider
    }


  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    result.error = `Polygon.io: Network/Client error - ${msg.substring(0,100)}`;
    result.providerSpecificError = true;
  }
  return result;
}


async function fetchFromFinnhub(
  finnhubTicker: string,
  assetName: string,
  timeframeId: string,
  apiKey: string
): Promise<MarketData> {
  const result: MarketData = { assetName, timeframe: timeframeId, sourceProvider: 'Finnhub.io' };
  const resolution = mapTimeframeToFinnhubResolution(timeframeId);
  const now = Math.floor(Date.now() / 1000);
  const daysForIndicator = resolution === 'D' ? 200 : 60; 
  const fromTs = now - (daysForIndicator * 24 * 60 * 60); 

  const quoteUrl = `https://finnhub.io/api/v1/quote?symbol=${finnhubTicker}&token=${apiKey}`;
  const rsiUrl = `https://finnhub.io/api/v1/indicator?symbol=${finnhubTicker}&resolution=${resolution}&from=${fromTs}&to=${now}&indicator=rsi&timeperiod=14&token=${apiKey}`;
  const macdUrl = `https://finnhub.io/api/v1/indicator?symbol=${finnhubTicker}&resolution=${resolution}&from=${fromTs}&to=${now}&indicator=macd&fastperiod=12&slowperiod=26&signalperiod=9&token=${apiKey}`;
  
  // Historical data for Finnhub (daily candles for last ~60 trading days)
  const toDateHistorical = format(new Date(), 'yyyy-MM-dd');
  const fromDateHistorical = format(subDays(new Date(), 90), 'yyyy-MM-dd'); // Fetch ~90 days
  const historicalUrl = `https://finnhub.io/api/v1/stock/candle?symbol=${finnhubTicker}&resolution=D&from=${Math.floor(new Date(fromDateHistorical).getTime()/1000)}&to=${Math.floor(new Date(toDateHistorical).getTime()/1000)}&token=${apiKey}`;


  let fetchErrors: string[] = [];
  let isKeyOrRateLimitError = false;

  try {
    const [quoteResponse, rsiResponse, macdResponse, historicalResponse] = await Promise.all([
        fetch(quoteUrl, { next: { revalidate: 300 } }),
        fetch(rsiUrl, { next: { revalidate: 600 } }),
        fetch(macdUrl, { next: { revalidate: 600 } }),
        fetch(historicalUrl, { next: { revalidate: 3600 } }),
    ]);

    // Process Quote
    if (!quoteResponse.ok) {
      const errorText = await quoteResponse.text();
      let detail = `Quote API Error ${quoteResponse.status}: ${errorText.substring(0,100)}`;
      if (quoteResponse.status === 401 || quoteResponse.status === 403) { detail = 'Invalid/unauthorized API Key.'; isKeyOrRateLimitError = true; }
      if (quoteResponse.status === 429) { detail = 'API rate limit hit.'; isKeyOrRateLimitError = true; }
      fetchErrors.push(detail);
    } else {
      const quoteData = await quoteResponse.json();
      if (quoteData.c !== undefined) result.price = parseFloat(quoteData.c); 
      else fetchErrors.push('Quote: Price data (c) not found.');
    }

    // Process RSI
    if (!rsiResponse.ok) {
      const errorText = await rsiResponse.text();
      let detail = `RSI API Error ${rsiResponse.status}: ${errorText.substring(0,100)}`;
      if (rsiResponse.status === 401 || rsiResponse.status === 403) { detail = 'Invalid/unauthorized API Key.'; isKeyOrRateLimitError = true; }
      if (rsiResponse.status === 429) { detail = 'API rate limit hit.'; isKeyOrRateLimitError = true; }
      fetchErrors.push(detail);
    } else {
      const rsiData = await rsiResponse.json();
      if (rsiData.s === 'ok' && rsiData.rsi?.length > 0) result.rsi = parseFloat(rsiData.rsi[rsiData.rsi.length - 1]);
      else if (rsiData.s !== 'ok') fetchErrors.push(`RSI: API error - ${rsiData.s || 'Finnhub RSI Error'}`);
      else fetchErrors.push('RSI: Data not found/unexpected format.');
    }

    // Process MACD
    if (!macdResponse.ok) {
      const errorText = await macdResponse.text();
      let detail = `MACD API Error ${macdResponse.status}: ${errorText.substring(0,100)}`;
      if (macdResponse.status === 401 || macdResponse.status === 403) { detail = 'Invalid/unauthorized API Key.'; isKeyOrRateLimitError = true; }
      if (macdResponse.status === 429) { detail = 'API rate limit hit.'; isKeyOrRateLimitError = true; }
      fetchErrors.push(detail);
    } else {
      const macdData = await macdResponse.json();
      if (macdData.s === 'ok' && macdData.macd?.length > 0 && macdData.macdSignal?.length > 0 && macdData.macdHist?.length > 0) {
        result.macd = {
          value: parseFloat(macdData.macd[macdData.macd.length - 1]),
          signal: parseFloat(macdData.macdSignal[macdData.macdSignal.length - 1]),
          histogram: parseFloat(macdData.macdHist[macdData.macdHist.length - 1]),
        };
      } else if (macdData.s !== 'ok') fetchErrors.push(`MACD: API error - ${macdData.s || 'Finnhub MACD Error'}`);
      else fetchErrors.push('MACD: Data not found/unexpected format.');
    }
    
    // Process Historical Data
    if (!historicalResponse.ok) {
        const errorText = await historicalResponse.text();
        let detail = `Historical API Error ${historicalResponse.status}: ${errorText.substring(0,100)}`;
        if (historicalResponse.status === 401 || historicalResponse.status === 403) { detail = 'Invalid/unauthorized API Key for historical data.'; isKeyOrRateLimitError = true; }
        if (historicalResponse.status === 429) { detail = 'API rate limit hit for historical data.'; isKeyOrRateLimitError = true; }
        fetchErrors.push(detail);
    } else {
        const historicalData = await historicalResponse.json();
        if (historicalData.s === 'ok' && historicalData.c && historicalData.t) {
             result.historical = historicalData.c.map((price: number, index: number) => ({
                date: format(new Date(historicalData.t[index] * 1000), 'MMM dd'),
                price: price,
            })).slice(-60);
        } else if (historicalData.s !== 'ok') {
            fetchErrors.push(`Historical: API error - ${historicalData.s || 'Finnhub Historical Error'}`);
        } else {
            fetchErrors.push('Historical: Data not found/unexpected format from Finnhub.');
        }
    }


    if (fetchErrors.length > 0) {
      result.error = `Finnhub.io: ${fetchErrors.join('; ')}`;
      result.providerSpecificError = isKeyOrRateLimitError || fetchErrors.some(e => e.toLowerCase().includes('api key') || e.toLowerCase().includes('rate limit'));
    }
     if (!result.price && !result.rsi && !result.macd?.value && !result.historical?.length && !result.error) {
        result.error = `Finnhub.io: No market data retrieved for ${assetName}. Check symbol/API key. Resolution: '${resolution}'.`;
        result.providerSpecificError = true;
    }

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    result.error = `Finnhub.io: Network/Client error - ${msg.substring(0,100)}`;
    result.providerSpecificError = true;
  }
  return result;
}

async function fetchFromTwelveData(
  twelveDataTicker: string,
  assetName: string,
  timeframeId: string,
  apiKey: string
): Promise<MarketData> {
  const result: MarketData = { assetName, timeframe: timeframeId, sourceProvider: 'TwelveData' };
  const interval = mapTimeframeToTwelveDataInterval(timeframeId);
  const baseUrl = 'https://api.twelvedata.com';
  
  const priceUrl = `${baseUrl}/price?symbol=${twelveDataTicker}&apikey=${apiKey}`;
  const rsiUrl = `${baseUrl}/rsi?symbol=${twelveDataTicker}&interval=${interval}&time_period=14&series_type=close&outputsize=1&apikey=${apiKey}`;
  const macdUrl = `${baseUrl}/macd?symbol=${twelveDataTicker}&interval=${interval}&fast_period=12&slow_period=26&signal_period=9&series_type=close&outputsize=1&apikey=${apiKey}`;
  
  // Historical data for TwelveData (daily for last ~60 data points)
  // Twelve Data's 'outputsize' for time_series can be used. Interval '1day'.
  const historicalUrl = `${baseUrl}/time_series?symbol=${twelveDataTicker}&interval=1day&outputsize=90&apikey=${apiKey}`;


  let fetchErrors: string[] = [];
  let isKeyOrRateLimitError = false;

  try {
     const [priceResponse, rsiResponse, macdResponse, historicalResponse] = await Promise.all([
        fetch(priceUrl, { next: { revalidate: 300 } }),
        fetch(rsiUrl, { next: { revalidate: 600 } }),
        fetch(macdUrl, { next: { revalidate: 600 } }),
        fetch(historicalUrl, { next: { revalidate: 3600 } }),
    ]);

    // Process Price
    if (!priceResponse.ok) {
      const errorData = await priceResponse.json().catch(() => ({ message: `HTTP ${priceResponse.status}` }));
      let detail = `Price API Error ${errorData.code || priceResponse.status}: ${errorData.message?.substring(0,100)}`;
      if (errorData.message?.toLowerCase().includes('api key') || errorData.code === 401 || errorData.code === 403) { detail = 'Invalid/unauthorized API Key.'; isKeyOrRateLimitError = true; }
      if (errorData.message?.toLowerCase().includes('limit') || errorData.code === 429) { detail = 'API rate/credit limit hit.'; isKeyOrRateLimitError = true; }
      fetchErrors.push(detail);
    } else {
      const priceData = await priceResponse.json();
      if (priceData.price !== undefined) result.price = parseFloat(priceData.price);
      else fetchErrors.push('Price: Data not found/unexpected format.');
    }

    // Process RSI
     if (!rsiResponse.ok) {
      const errorData = await rsiResponse.json().catch(() => ({ message: `HTTP ${rsiResponse.status}` }));
      let detail = `RSI API Error ${errorData.code || rsiResponse.status}: ${errorData.message?.substring(0,100)}`;
      if (errorData.message?.toLowerCase().includes('api key') || errorData.code === 401 || errorData.code === 403) { detail = 'Invalid/unauthorized API Key.'; isKeyOrRateLimitError = true; }
      if (errorData.message?.toLowerCase().includes('limit') || errorData.code === 429) { detail = 'API rate/credit limit hit.'; isKeyOrRateLimitError = true; }
      fetchErrors.push(detail);
    } else {
      const rsiData = await rsiResponse.json();
      if (rsiData.values?.[0]?.rsi !== undefined) result.rsi = parseFloat(rsiData.values[0].rsi);
      else if (rsiData.status === 'error') fetchErrors.push(`RSI: API error - ${rsiData.message}`);
      else fetchErrors.push('RSI: Data not found/unexpected format.');
    }

    // Process MACD
    if (!macdResponse.ok) {
      const errorData = await macdResponse.json().catch(() => ({ message: `HTTP ${macdResponse.status}` }));
      let detail = `MACD API Error ${errorData.code || macdResponse.status}: ${errorData.message?.substring(0,100)}`;
      if (errorData.message?.toLowerCase().includes('api key') || errorData.code === 401 || errorData.code === 403) { detail = 'Invalid/unauthorized API Key.'; isKeyOrRateLimitError = true; }
      if (errorData.message?.toLowerCase().includes('limit') || errorData.code === 429) { detail = 'API rate/credit limit hit.'; isKeyOrRateLimitError = true; }
      fetchErrors.push(detail);
    } else {
      const macdData = await macdResponse.json();
      if (macdData.values?.[0]?.macd !== undefined) {
        result.macd = {
          value: parseFloat(macdData.values[0].macd),
          signal: parseFloat(macdData.values[0].macd_signal),
          histogram: parseFloat(macdData.values[0].macd_hist),
        };
      } else if (macdData.status === 'error') fetchErrors.push(`MACD: API error - ${macdData.message}`);
      else fetchErrors.push('MACD: Data not found/unexpected format.');
    }
    
    // Process Historical Data
    if (!historicalResponse.ok) {
        const errorData = await historicalResponse.json().catch(() => ({ message: `HTTP ${historicalResponse.status}` }));
        let detail = `Historical API Error ${errorData.code || historicalResponse.status}: ${errorData.message?.substring(0,100)}`;
        if (errorData.message?.toLowerCase().includes('api key') || errorData.code === 401 || errorData.code === 403) { detail = 'Invalid/unauthorized API Key for historical data.'; isKeyOrRateLimitError = true; }
        if (errorData.message?.toLowerCase().includes('limit') || errorData.code === 429) { detail = 'API rate/credit limit hit for historical data.'; isKeyOrRateLimitError = true; }
        fetchErrors.push(detail);
    } else {
        const historicalData = await historicalResponse.json();
        if (historicalData.values) {
             result.historical = historicalData.values
                .map((v: any) => ({
                    date: format(new Date(v.datetime), 'MMM dd'),
                    price: parseFloat(v.close),
                }))
                .reverse() // TwelveData often returns newest first, so reverse for charting
                .slice(-60);
        } else if (historicalData.status === 'error') {
            fetchErrors.push(`Historical: API error - ${historicalData.message}`);
        } else {
            fetchErrors.push('Historical: Data not found/unexpected format from TwelveData.');
        }
    }

    
    if (fetchErrors.length > 0) {
      result.error = `TwelveData: ${fetchErrors.join('; ')}`;
      result.providerSpecificError = isKeyOrRateLimitError || fetchErrors.some(e => e.toLowerCase().includes('api key') || e.toLowerCase().includes('limit'));
    }
    if (!result.price && !result.rsi && !result.macd?.value && !result.historical?.length && !result.error) {
        result.error = `TwelveData: No market data retrieved for ${assetName}. Check symbol/API key. Interval: '${interval}'.`;
        result.providerSpecificError = true;
    }

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    result.error = `TwelveData: Network/Client error - ${msg.substring(0,100)}`;
    result.providerSpecificError = true;
  }
  return result;
}


export async function fetchMarketData(
  asset: Asset,
  timeframeId: string,
  apiKeys: {
    polygon?: string | null;
    finnhub?: string | null;
    twelvedata?: string | null;
  }
): Promise<MarketData> {
  let marketData: MarketData = { assetName: asset.name, timeframe: timeframeId, sourceProvider: 'Unknown' };
  let lastError: string | undefined;
  let attemptLog: string[] = [];

  // Provider 1: Polygon.io
  if (apiKeys.polygon && asset.marketIds.polygon) {
    attemptLog.push("Attempting Polygon.io...");
    marketData = await fetchFromPolygon(asset.marketIds.polygon, asset.name, timeframeId, apiKeys.polygon);
    // Success if we have price AND indicators OR price AND historical data
    const polygonSuccess = marketData.price !== undefined && 
                           ((marketData.rsi !== undefined && marketData.macd?.value !== undefined) || 
                            (marketData.historical && marketData.historical.length > 0));

    if (!marketData.error || polygonSuccess) {
      console.log(`Successfully fetched from Polygon.io for ${asset.name}`);
      if (marketData.error && polygonSuccess) { // Partial success
        console.warn(`Polygon.io for ${asset.name} had partial data with error: ${marketData.error}`);
        marketData.error = `Partial data from Polygon.io: ${marketData.error}`; // Keep error for info
      } else {
        marketData.error = undefined; // Clear error on full success
      }
      return marketData;
    }
    lastError = marketData.error;
    attemptLog.push(`Polygon.io failed: ${lastError}`);
    if (!marketData.providerSpecificError) { 
        console.warn(`Polygon.io failed with non-provider specific error for ${asset.name}: ${lastError}. Not falling back further for market data.`);
        return marketData;
    }
  } else {
    attemptLog.push("Skipping Polygon.io (no API key or asset ID).");
  }

  // Provider 2: Finnhub.io
  if (apiKeys.finnhub && asset.marketIds.finnhub) {
    attemptLog.push("Attempting Finnhub.io...");
    marketData = await fetchFromFinnhub(asset.marketIds.finnhub, asset.name, timeframeId, apiKeys.finnhub);
    const finnhubSuccess = marketData.price !== undefined && 
                           ((marketData.rsi !== undefined && marketData.macd?.value !== undefined) ||
                            (marketData.historical && marketData.historical.length > 0));
                            
    if (!marketData.error || finnhubSuccess) {
      console.log(`Successfully fetched from Finnhub.io for ${asset.name}`);
      if (marketData.error && finnhubSuccess) {
        console.warn(`Finnhub.io for ${asset.name} had partial data with error: ${marketData.error}`);
        marketData.error = `Partial data from Finnhub.io: ${marketData.error}`;
      } else {
        marketData.error = undefined;
      }
      return marketData;
    }
    lastError = marketData.error;
    attemptLog.push(`Finnhub.io failed: ${lastError}`);
    if (!marketData.providerSpecificError) {
        console.warn(`Finnhub.io failed with non-provider specific error for ${asset.name}: ${lastError}. Not falling back further for market data.`);
        return marketData;
    }
  } else {
    attemptLog.push("Skipping Finnhub.io (no API key or asset ID).");
  }

  // Provider 3: TwelveData
  if (apiKeys.twelvedata && asset.marketIds.twelvedata) {
    attemptLog.push("Attempting TwelveData...");
    marketData = await fetchFromTwelveData(asset.marketIds.twelvedata, asset.name, timeframeId, apiKeys.twelvedata);
    const twelveDataSuccess = marketData.price !== undefined &&
                              ((marketData.rsi !== undefined && marketData.macd?.value !== undefined) ||
                               (marketData.historical && marketData.historical.length > 0));

    if (!marketData.error || twelveDataSuccess) {
      console.log(`Successfully fetched from TwelveData for ${asset.name}`);
       if (marketData.error && twelveDataSuccess) {
        console.warn(`TwelveData for ${asset.name} had partial data with error: ${marketData.error}`);
        marketData.error = `Partial data from TwelveData: ${marketData.error}`;
      } else {
        marketData.error = undefined;
      }
      return marketData;
    }
    lastError = marketData.error;
    attemptLog.push(`TwelveData failed: ${lastError}`);
    // This is the last fallback, so return its result or error
  } else {
    attemptLog.push("Skipping TwelveData (no API key or asset ID).");
  }
  
  console.warn(`All market data providers failed for ${asset.name}. Last error: ${lastError}. Attempts: ${attemptLog.join(' | ')}`);
  
  // If all fallbacks failed, return the last known marketData object, which will contain the last error
  // or a generic error if no providers were even attempted.
  if (!marketData.sourceProvider || marketData.sourceProvider === 'Unknown') {
      marketData.error = lastError || "No API providers configured or all failed for market data.";
      // Ensure sourceProvider is set even on total failure, if one was attempted and failed last
      if (attemptLog.includes("Attempting TwelveData...")) marketData.sourceProvider = 'TwelveData';
      else if (attemptLog.includes("Attempting Finnhub.io...")) marketData.sourceProvider = 'Finnhub.io';
      else if (attemptLog.includes("Attempting Polygon.io...")) marketData.sourceProvider = 'Polygon.io';
      else marketData.sourceProvider = 'Unknown';
  }
  return marketData;
}


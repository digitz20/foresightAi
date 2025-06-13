
'use server';

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

export interface MarketData {
  price?: number;
  rsi?: number;
  macd?: {
    value?: number;
    signal?: number;
    histogram?: number;
  };
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
  const priceUrl = `${baseUrl}/v2/aggs/ticker/${polygonTicker}/prev?adjusted=true&apiKey=${apiKey}`;
  const rsiUrl = `${baseUrl}/v1/indicators/rsi/${polygonTicker}?timespan=${indicatorTimespan}&adjusted=true&window=14&series_type=close&order=desc&limit=1&apiKey=${apiKey}`;
  const macdUrl = `${baseUrl}/v1/indicators/macd/${polygonTicker}?timespan=${indicatorTimespan}&adjusted=true&short_window=12&long_window=26&signal_window=9&series_type=close&order=desc&limit=1&apiKey=${apiKey}`;

  let fetchErrors: string[] = [];
  let isKeyOrRateLimitError = false;

  try {
    const priceResponse = await fetch(priceUrl, { next: { revalidate: 300 } });
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

    const rsiResponse = await fetch(rsiUrl, { next: { revalidate: 600 } });
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

    const macdResponse = await fetch(macdUrl, { next: { revalidate: 600 } });
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

    if (fetchErrors.length > 0) {
      result.error = `Polygon.io: ${fetchErrors.join('; ')}`;
      result.providerSpecificError = isKeyOrRateLimitError || fetchErrors.some(e => e.toLowerCase().includes('api key') || e.toLowerCase().includes('rate limit'));
    }
     if (!result.price && !result.rsi && !result.macd?.value && !result.error) {
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
  const daysForIndicator = resolution === 'D' ? 200 : 60; // More data for daily, less for intraday
  const fromTs = now - (daysForIndicator * 24 * 60 * 60); // Approx N days ago for indicators

  const quoteUrl = `https://finnhub.io/api/v1/quote?symbol=${finnhubTicker}&token=${apiKey}`;
  const rsiUrl = `https://finnhub.io/api/v1/indicator?symbol=${finnhubTicker}&resolution=${resolution}&from=${fromTs}&to=${now}&indicator=rsi&timeperiod=14&token=${apiKey}`;
  const macdUrl = `https://finnhub.io/api/v1/indicator?symbol=${finnhubTicker}&resolution=${resolution}&from=${fromTs}&to=${now}&indicator=macd&fastperiod=12&slowperiod=26&signalperiod=9&token=${apiKey}`;

  let fetchErrors: string[] = [];
  let isKeyOrRateLimitError = false;

  try {
    const quoteResponse = await fetch(quoteUrl, { next: { revalidate: 300 } });
    if (!quoteResponse.ok) {
      const errorText = await quoteResponse.text();
      let detail = `Quote API Error ${quoteResponse.status}: ${errorText.substring(0,100)}`;
      if (quoteResponse.status === 401 || quoteResponse.status === 403) { detail = 'Invalid/unauthorized API Key.'; isKeyOrRateLimitError = true; }
      if (quoteResponse.status === 429) { detail = 'API rate limit hit.'; isKeyOrRateLimitError = true; }
      fetchErrors.push(detail);
    } else {
      const quoteData = await quoteResponse.json();
      if (quoteData.c !== undefined) result.price = parseFloat(quoteData.c); // Current price
      else fetchErrors.push('Quote: Price data (c) not found.');
    }

    const rsiResponse = await fetch(rsiUrl, { next: { revalidate: 600 } });
    if (!rsiResponse.ok) {
      const errorText = await rsiResponse.text();
      let detail = `RSI API Error ${rsiResponse.status}: ${errorText.substring(0,100)}`;
      if (rsiResponse.status === 401 || rsiResponse.status === 403) { detail = 'Invalid/unauthorized API Key.'; isKeyOrRateLimitError = true; }
      if (rsiResponse.status === 429) { detail = 'API rate limit hit.'; isKeyOrRateLimitError = true; }
      fetchErrors.push(detail);
    } else {
      const rsiData = await rsiResponse.json();
      if (rsiData.s === 'ok' && rsiData.rsi?.length > 0) result.rsi = parseFloat(rsiData.rsi[rsiData.rsi.length - 1]);
      else if (rsiData.s !== 'ok') fetchErrors.push(`RSI: API error - ${rsiData.s}`);
      else fetchErrors.push('RSI: Data not found/unexpected format.');
    }

    const macdResponse = await fetch(macdUrl, { next: { revalidate: 600 } });
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
      } else if (macdData.s !== 'ok') fetchErrors.push(`MACD: API error - ${macdData.s}`);
      else fetchErrors.push('MACD: Data not found/unexpected format.');
    }

    if (fetchErrors.length > 0) {
      result.error = `Finnhub.io: ${fetchErrors.join('; ')}`;
      result.providerSpecificError = isKeyOrRateLimitError || fetchErrors.some(e => e.toLowerCase().includes('api key') || e.toLowerCase().includes('rate limit'));
    }
     if (!result.price && !result.rsi && !result.macd?.value && !result.error) {
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
  
  // Price (real-time or delayed - using /price endpoint for simplicity)
  const priceUrl = `${baseUrl}/price?symbol=${twelveDataTicker}&apikey=${apiKey}`;
  // RSI
  const rsiUrl = `${baseUrl}/rsi?symbol=${twelveDataTicker}&interval=${interval}&time_period=14&series_type=close&outputsize=1&apikey=${apiKey}`;
  // MACD
  const macdUrl = `${baseUrl}/macd?symbol=${twelveDataTicker}&interval=${interval}&fast_period=12&slow_period=26&signal_period=9&series_type=close&outputsize=1&apikey=${apiKey}`;

  let fetchErrors: string[] = [];
  let isKeyOrRateLimitError = false;

  try {
    const priceResponse = await fetch(priceUrl, { next: { revalidate: 300 } });
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

    const rsiResponse = await fetch(rsiUrl, { next: { revalidate: 600 } });
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

    const macdResponse = await fetch(macdUrl, { next: { revalidate: 600 } });
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
    
    if (fetchErrors.length > 0) {
      result.error = `TwelveData: ${fetchErrors.join('; ')}`;
      result.providerSpecificError = isKeyOrRateLimitError || fetchErrors.some(e => e.toLowerCase().includes('api key') || e.toLowerCase().includes('limit'));
    }
    if (!result.price && !result.rsi && !result.macd?.value && !result.error) {
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
    if (!marketData.error || (marketData.price && marketData.rsi && marketData.macd)) {
      console.log(`Successfully fetched from Polygon.io for ${asset.name}`);
      return marketData;
    }
    lastError = marketData.error;
    attemptLog.push(`Polygon.io failed: ${lastError}`);
    if (!marketData.providerSpecificError) { // If not a key/rate limit error for Polygon, return its error
        console.warn(`Polygon.io failed with non-provider specific error for ${asset.name}: ${lastError}. Not falling back further.`);
        return marketData;
    }
  } else {
    attemptLog.push("Skipping Polygon.io (no API key or asset ID).");
  }

  // Provider 2: Finnhub.io
  if (apiKeys.finnhub && asset.marketIds.finnhub) {
    attemptLog.push("Attempting Finnhub.io...");
    marketData = await fetchFromFinnhub(asset.marketIds.finnhub, asset.name, timeframeId, apiKeys.finnhub);
    if (!marketData.error || (marketData.price && marketData.rsi && marketData.macd)) {
      console.log(`Successfully fetched from Finnhub.io for ${asset.name}`);
      return marketData;
    }
    lastError = marketData.error;
    attemptLog.push(`Finnhub.io failed: ${lastError}`);
    if (!marketData.providerSpecificError) {
        console.warn(`Finnhub.io failed with non-provider specific error for ${asset.name}: ${lastError}. Not falling back further.`);
        return marketData;
    }
  } else {
    attemptLog.push("Skipping Finnhub.io (no API key or asset ID).");
  }

  // Provider 3: TwelveData
  if (apiKeys.twelvedata && asset.marketIds.twelvedata) {
    attemptLog.push("Attempting TwelveData...");
    marketData = await fetchFromTwelveData(asset.marketIds.twelvedata, asset.name, timeframeId, apiKeys.twelvedata);
    if (!marketData.error || (marketData.price && marketData.rsi && marketData.macd)) {
      console.log(`Successfully fetched from TwelveData for ${asset.name}`);
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
      marketData.sourceProvider = 'Unknown';
  }
  return marketData;
}

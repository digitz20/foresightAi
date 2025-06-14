
'use server';

import { format, subDays, fromUnixTime, subMinutes } from 'date-fns';

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
  date: string; // Formatted date string e.g., "MMM dd" or "HH:mm"
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
  marketStatus?: 'open' | 'closed' | 'extended-hours' | 'pre-market' | 'post-market' | 'unknown';
  lastTradeTimestamp?: number; // Unix milliseconds
}

// Helper to map our timeframe IDs to Polygon.io timespan strings for indicators
function mapTimeframeToPolygonTimespan(timeframeId: string): string {
  switch (timeframeId) {
    case '1min':
    case '2min':
    case '3min':
    case '4min':
    case '5min': return 'minute'; // Polygon uses 'minute' for 1-59 min intervals for indicators
    case '15min': case '1H': case '4H': return 'hour';
    case '1D': return 'day';
    default: return 'hour';
  }
}

// Helper to map our timeframe IDs to Finnhub resolution
function mapTimeframeToFinnhubResolution(timeframeId: string): string {
  switch (timeframeId) {
    case '1min': return '1';
    case '2min': return '1'; // Finnhub doesn't have 2min, use 1min
    case '3min': return '1'; // Finnhub doesn't have 3min, use 1min
    case '4min': return '1'; // Finnhub doesn't have 4min, use 1min
    case '5min': return '5';
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
    case '1min': return '1min';
    case '2min': return '1min'; // TwelveData might not have 2min, use 1min
    case '3min': return '1min'; // TwelveData might not have 3min, use 1min
    case '4min': return '1min'; // TwelveData might not have 4min, use 1min
    case '5min': return '5min';
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
  const result: MarketData = { assetName, timeframe: timeframeId, sourceProvider: 'Polygon.io', marketStatus: 'unknown' };
  const indicatorTimespan = mapTimeframeToPolygonTimespan(timeframeId);
  
  let historicalMultiplier: number;
  let historicalTimespan: string;
  let fromDateHist: Date;
  const today = new Date();
  const historicalLimit = 120; // Aim for up to 120 data points for charts

  switch (timeframeId) {
    case '1min':
      historicalMultiplier = 1;
      historicalTimespan = 'minute';
      fromDateHist = subMinutes(today, historicalLimit * 1 * 2); // Fetch ~2 hours of data
      break;
    case '2min':
      historicalMultiplier = 2;
      historicalTimespan = 'minute';
      fromDateHist = subMinutes(today, historicalLimit * 2 * 2); // Fetch ~4 hours
      break;
    case '3min':
      historicalMultiplier = 3;
      historicalTimespan = 'minute';
      fromDateHist = subMinutes(today, historicalLimit * 3 * 2); // Fetch ~6 hours
      break;
    case '4min':
      historicalMultiplier = 4;
      historicalTimespan = 'minute';
      fromDateHist = subMinutes(today, historicalLimit * 4 * 2); // Fetch ~8 hours
      break;
    case '5min':
      historicalMultiplier = 5;
      historicalTimespan = 'minute';
      fromDateHist = subMinutes(today, historicalLimit * 5 * 2); // Fetch ~10 hours
      break;
    case '15min':
      historicalMultiplier = 15;
      historicalTimespan = 'minute';
      fromDateHist = subDays(today, 3); // Fetch a few days
      break;
    case '1H':
      historicalMultiplier = 1;
      historicalTimespan = 'hour';
      fromDateHist = subDays(today, 10); // Fetch a couple of weeks
      break;
    case '4H':
      historicalMultiplier = 4;
      historicalTimespan = 'hour';
      fromDateHist = subDays(today, 30); // Fetch around a month
      break;
    case '1D':
      historicalMultiplier = 1;
      historicalTimespan = 'day';
      fromDateHist = subDays(today, 180); // Fetch around 6 months
      break;
    default: // Default to 1H equivalent
      historicalMultiplier = 1;
      historicalTimespan = 'hour';
      fromDateHist = subDays(today, 10);
  }


  const baseUrl = 'https://api.polygon.io';

  const priceUrl = `${baseUrl}/v2/aggs/ticker/${polygonTicker}/prev?adjusted=true&apiKey=${apiKey}`;
  const rsiUrl = `${baseUrl}/v1/indicators/rsi/${polygonTicker}?timespan=${indicatorTimespan}&adjusted=true&window=14&series_type=close&order=desc&limit=1&apiKey=${apiKey}`;
  const macdUrl = `${baseUrl}/v1/indicators/macd/${polygonTicker}?timespan=${indicatorTimespan}&adjusted=true&short_window=12&long_window=26&signal_window=9&series_type=close&order=desc&limit=1&apiKey=${apiKey}`;
  const snapshotUrl = `${baseUrl}/v2/snapshot/tickers/${polygonTicker}?apiKey=${apiKey}`; // For market status

  const fromDate = format(fromDateHist, 'yyyy-MM-dd');
  const toDate = format(today, 'yyyy-MM-dd');
  const historicalUrl = `${baseUrl}/v2/aggs/ticker/${polygonTicker}/range/${historicalMultiplier}/${historicalTimespan}/${fromDate}/${toDate}?adjusted=true&sort=asc&limit=${historicalLimit}&apiKey=${apiKey}`;

  let fetchErrors: string[] = [];
  let isKeyOrRateLimitError = false;

  try {
    const [priceResponse, rsiResponse, macdResponse, historicalResponse, snapshotResponse] = await Promise.all([
      fetch(priceUrl, { next: { revalidate: 300 } }), // 5 min revalidation for price
      fetch(rsiUrl, { next: { revalidate: (timeframeId.includes('min') || timeframeId.includes('H')) ? 300 : 600 } }), // Shorter for intraday
      fetch(macdUrl, { next: { revalidate: (timeframeId.includes('min') || timeframeId.includes('H')) ? 300 : 600 } }),
      fetch(historicalUrl, { next: { revalidate: (timeframeId.includes('min') || timeframeId.includes('H')) ? 300 : 3600 } }),
      fetch(snapshotUrl, { next: { revalidate: 60 } }) // Snapshot revalidates more frequently for status
    ]);

    // Process Snapshot for Market Status
    const snapshot404ErrorMessage = `Market status snapshot unavailable for ${polygonTicker} (404).`;
    if (snapshotResponse.ok) {
        const snapshotData = await snapshotResponse.json();
        if (snapshotData.ticker && snapshotData.ticker.marketStatus) {
            result.marketStatus = snapshotData.ticker.marketStatus.toLowerCase() as MarketData['marketStatus'];
        }
        if (snapshotData.ticker && snapshotData.ticker.lastTrade && snapshotData.ticker.lastTrade.t) {
            result.lastTradeTimestamp = snapshotData.ticker.lastTrade.t;
        } else if (snapshotData.ticker && snapshotData.ticker.lastQuote && snapshotData.ticker.lastQuote.t) {
             result.lastTradeTimestamp = snapshotData.ticker.lastQuote.t; // Fallback to last quote if no trade
        }
         if (snapshotData.ticker && snapshotData.ticker.updated) { // Use updated if lastTrade.t is missing
            if(!result.lastTradeTimestamp) result.lastTradeTimestamp = snapshotData.ticker.updated;
        }
    } else {
        const errorText = await snapshotResponse.text();
        let snapshotErrorDetail = `Snapshot API Error ${snapshotResponse.status}: ${errorText.substring(0,50)}`;
        if (snapshotResponse.status === 404) {
             snapshotErrorDetail = snapshot404ErrorMessage;
        } else {
            if (snapshotResponse.status === 401 || snapshotResponse.status === 403) isKeyOrRateLimitError = true;
            if (snapshotResponse.status === 429) isKeyOrRateLimitError = true;
        }
        fetchErrors.push(snapshotErrorDetail);
        result.marketStatus = 'unknown'; 
    }


    // Process Price
    if (!priceResponse.ok) {
      const errorText = await priceResponse.text();
      let detail = `Price API Error ${priceResponse.status}: ${errorText.substring(0,100)}`;
      if (priceResponse.status === 401 || priceResponse.status === 403) { detail = 'Invalid/unauthorized API Key.'; isKeyOrRateLimitError = true; }
      if (priceResponse.status === 429) { detail = 'API rate limit hit.'; isKeyOrRateLimitError = true; }
      fetchErrors.push(detail);
    } else {
      const priceData = await priceResponse.json();
      if (priceData.results?.[0]?.c !== undefined) {
        result.price = parseFloat(priceData.results[0].c);
        if (!result.lastTradeTimestamp && priceData.results?.[0]?.t) { 
            result.lastTradeTimestamp = priceData.results[0].t;
        }
      }
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
            const dateFormat = timeframeId.includes('min') ? 'HH:mm' : 'MMM dd';
            result.historical = historicalData.results
              .map((r: any) => ({
                date: format(new Date(r.t), dateFormat),
                price: r.c,
              }))
              .slice(-60); // Keep last 60 points for display consistency
        } else if (historicalData.status === 'ERROR') {
            fetchErrors.push(`Historical: API error - ${historicalData.error || historicalData.message}`);
        } else {
            fetchErrors.push('Historical: Data not found/unexpected format.');
        }
    }

    const essentialDataFetched = result.price !== undefined || 
                                 (result.rsi !== undefined && result.macd?.value !== undefined) || 
                                 (result.historical && result.historical.length > 0);
    
    const isOnlySnapshot404Error = fetchErrors.length === 1 && fetchErrors[0] === snapshot404ErrorMessage;

    if (fetchErrors.length > 0) {
        if (isOnlySnapshot404Error && essentialDataFetched) {
            console.warn(`Polygon.io: Snapshot for ${polygonTicker} returned 404, but other data was fetched.`);
            result.error = undefined; 
            result.providerSpecificError = false; 
        } else {
            result.error = `Polygon.io: ${fetchErrors.join('; ')}`;
            result.providerSpecificError = isKeyOrRateLimitError || fetchErrors.some(
                e => e.toLowerCase().includes('api key') ||
                     e.toLowerCase().includes('rate limit') ||
                     e.toLowerCase().includes('unauthorized') ||
                     (e !== snapshot404ErrorMessage && (e.includes('API Error') || e.includes('API error') || e.includes('Data not found/unexpected format')))
            );
        }
    }
    
    if (!essentialDataFetched && !result.error) {
        result.error = `Polygon.io: No market data could be retrieved for ${assetName}. Verify symbol and API key/plan. Timespan: '${indicatorTimespan}'. Historical: ${historicalMultiplier}${historicalTimespan}.`;
        result.providerSpecificError = true;
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
  const result: MarketData = { assetName, timeframe: timeframeId, sourceProvider: 'Finnhub.io', marketStatus: 'unknown' };
  const resolution = mapTimeframeToFinnhubResolution(timeframeId);
  const now = Math.floor(Date.now() / 1000);
  let daysForIndicator = 60; // Default for daily-like resolutions for indicators
  if (resolution === '1' || resolution === '5' || resolution === '15' || resolution === '30' || resolution === '60') { // Intraday resolutions
      daysForIndicator = resolution === '60' ? 10 : (resolution === '30' ? 5 : (resolution === '15' ? 3 : 2 ) ); // Fewer days for intraday indicators
  } else if (resolution === 'D') {
      daysForIndicator = 200; // More days for daily indicators
  }


  const fromTs = now - (daysForIndicator * 24 * 60 * 60);

  const quoteUrl = `https://finnhub.io/api/v1/quote?symbol=${finnhubTicker}&token=${apiKey}`;
  const rsiUrl = `https://finnhub.io/api/v1/indicator?symbol=${finnhubTicker}&resolution=${resolution}&from=${fromTs}&to=${now}&indicator=rsi&timeperiod=14&token=${apiKey}`;
  const macdUrl = `https://finnhub.io/api/v1/indicator?symbol=${finnhubTicker}&resolution=${resolution}&from=${fromTs}&to=${now}&indicator=macd&fastperiod=12&slowperiod=26&signalperiod=9&token=${apiKey}`;

  let historicalResolution = 'D';
  let fromTsHistorical = Math.floor(subDays(new Date(), 90).getTime() / 1000); // Default: 90 days for daily
  
  if (timeframeId.includes('min') || timeframeId.includes('H')) {
     historicalResolution = resolution; // Use mapped resolution for intraday
     // For 60 points on chart:
     const pointsToFetch = 60;
     let minutesPerPoint = 1; // Default for '1'
     if (resolution === '5') minutesPerPoint = 5;
     else if (resolution === '15') minutesPerPoint = 15;
     else if (resolution === '30') minutesPerPoint = 30;
     else if (resolution === '60') minutesPerPoint = 60;

     fromTsHistorical = now - (pointsToFetch * minutesPerPoint * 60 * 2); // Fetch ~double needed
  }
  
  const toTsHistorical = now;
  const historicalUrl = `https://finnhub.io/api/v1/stock/candle?symbol=${finnhubTicker}&resolution=${historicalResolution}&from=${fromTsHistorical}&to=${toTsHistorical}&token=${apiKey}`;

  let fetchErrors: string[] = [];
  let isKeyOrRateLimitError = false;

  try {
    const [quoteResponse, rsiResponse, macdResponse, historicalResponse] = await Promise.all([
        fetch(quoteUrl, { next: { revalidate: 300 } }),
        fetch(rsiUrl, { next: { revalidate: (resolution === '1' || resolution === '5' || resolution === '15') ? 300: 600 } }),
        fetch(macdUrl, { next: { revalidate: (resolution === '1' || resolution === '5' || resolution === '15') ? 300: 600 } }),
        fetch(historicalUrl, { next: { revalidate: (historicalResolution === '1' || historicalResolution === '5' || historicalResolution === '15') ? 300 : 3600 } }),
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
      if (quoteData.t !== undefined) result.lastTradeTimestamp = quoteData.t * 1000; // Finnhub 't' is Unix seconds
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
             const dateFormat = (historicalResolution !== 'D' && historicalResolution !== 'W' && historicalResolution !== 'M') ? 'HH:mm' : 'MMM dd';
             result.historical = historicalData.c.map((price: number, index: number) => ({
                date: format(fromUnixTime(historicalData.t[index]), dateFormat),
                price: price,
            })).slice(-60); // Keep last 60 points
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
        result.error = `Finnhub.io: No market data retrieved for ${assetName}. Check symbol/API key. Resolution: '${resolution}'. Historical: ${historicalResolution}`;
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
  const result: MarketData = { assetName, timeframe: timeframeId, sourceProvider: 'TwelveData', marketStatus: 'unknown' };
  const interval = mapTimeframeToTwelveDataInterval(timeframeId);
  const baseUrl = 'https://api.twelvedata.com';

  const priceUrl = `${baseUrl}/price?symbol=${twelveDataTicker}&apikey=${apiKey}`;
  const rsiUrl = `${baseUrl}/rsi?symbol=${twelveDataTicker}&interval=${interval}&time_period=14&series_type=close&outputsize=1&apikey=${apiKey}`;
  const macdUrl = `${baseUrl}/macd?symbol=${twelveDataTicker}&interval=${interval}&fast_period=12&slow_period=26&signal_period=9&series_type=close&outputsize=1&apikey=${apiKey}`;

  const historicalInterval = mapTimeframeToTwelveDataInterval(timeframeId); // Use mapped interval for history
  const historicalOutputSize = 120; // Fetch more to slice later
  const historicalUrl = `${baseUrl}/time_series?symbol=${twelveDataTicker}&interval=${historicalInterval}&outputsize=${historicalOutputSize}&apikey=${apiKey}`;

  let fetchErrors: string[] = [];
  let isKeyOrRateLimitError = false;

  try {
     const [priceResponse, rsiResponse, macdResponse, historicalResponse] = await Promise.all([
        fetch(priceUrl, { next: { revalidate: 300 } }),
        fetch(rsiUrl, { next: { revalidate: (interval.includes('min') || interval.includes('h')) ? 300 : 600 } }),
        fetch(macdUrl, { next: { revalidate: (interval.includes('min') || interval.includes('h')) ? 300 : 600 } }),
        fetch(historicalUrl, { next: { revalidate: (historicalInterval.includes('min') || historicalInterval.includes('h')) ? 300 : 3600 } }),
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
      if (priceData.timestamp !== undefined) result.lastTradeTimestamp = priceData.timestamp * 1000; // TwelveData timestamp is Unix seconds
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
             const dateFormat = (historicalInterval !== '1day' && historicalInterval !== '1week' && historicalInterval !== '1month') ? 'HH:mm' : 'MMM dd';
             result.historical = historicalData.values
                .map((v: any) => ({
                    date: format(new Date(v.datetime), dateFormat), // TwelveData datetime is ISO string
                    price: parseFloat(v.close),
                }))
                .reverse() // TwelveData often returns newest first
                .slice(-60); // Keep last 60 points
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
        result.error = `TwelveData: No market data retrieved for ${assetName}. Check symbol/API key. Interval: '${interval}'. Historical: ${historicalInterval}.`;
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
  let marketData: MarketData = { assetName: asset.name, timeframe: timeframeId, sourceProvider: 'Unknown', marketStatus: 'unknown' };
  let lastError: string | undefined;
  let attemptLog: string[] = [];

  // Provider 1: Polygon.io
  if (apiKeys.polygon && asset.marketIds.polygon) {
    attemptLog.push("Attempting Polygon.io...");
    marketData = await fetchFromPolygon(asset.marketIds.polygon, asset.name, timeframeId, apiKeys.polygon);
    
    const essentialPolygonDataFetched = marketData.price !== undefined ||
                                     (marketData.rsi !== undefined && marketData.macd?.value !== undefined) ||
                                     (marketData.historical && marketData.historical.length > 0);

    if (essentialPolygonDataFetched && !marketData.error) { 
      console.log(`Successfully fetched from Polygon.io for ${asset.name} (${timeframeId}). Market Status: ${marketData.marketStatus}`);
      return marketData; 
    }
    
    if (marketData.error || !essentialPolygonDataFetched) {
        lastError = marketData.error || `Polygon.io: Essential data missing for ${asset.name}.`;
        attemptLog.push(`Polygon.io failed: ${lastError}`);
        if (!marketData.providerSpecificError) {
            console.warn(`Polygon.io failed with non-provider specific error for ${asset.name} (${timeframeId}): ${lastError}. Not falling back further for market data.`);
            if (essentialPolygonDataFetched && marketData.error) {
                 marketData.error = `Partial data from Polygon.io: ${marketData.error}`;
                 return marketData;
            }
            return marketData; 
        }
    }
  } else {
    attemptLog.push("Skipping Polygon.io (no API key or asset ID).");
  }


  // Provider 2: Finnhub.io
  if (apiKeys.finnhub && asset.marketIds.finnhub) {
    attemptLog.push("Attempting Finnhub.io...");
    marketData = await fetchFromFinnhub(asset.marketIds.finnhub, asset.name, timeframeId, apiKeys.finnhub);
    const finnhubSuccess = marketData.price !== undefined || // Price OR (Indicators AND/OR History)
                           ((marketData.rsi !== undefined && marketData.macd?.value !== undefined) ||
                            (marketData.historical && marketData.historical.length > 0));

    if (!marketData.error && finnhubSuccess) { // Success if no error AND some data
      console.log(`Successfully fetched from Finnhub.io for ${asset.name} (${timeframeId})`);
      marketData.error = undefined; // Clear any benign errors if essential data is present
      return marketData;
    }
     if (marketData.error && finnhubSuccess) { // Partial success
        console.warn(`Finnhub.io for ${asset.name} (${timeframeId}) had partial data with error: ${marketData.error}`);
        marketData.error = `Partial data from Finnhub.io: ${marketData.error}`;
        return marketData; // Return partial data
    }
    lastError = marketData.error || `Finnhub.io: Essential data missing for ${asset.name}.`; // Update lastError
    attemptLog.push(`Finnhub.io failed: ${lastError}`);
    if (!marketData.providerSpecificError) {
        console.warn(`Finnhub.io failed with non-provider specific error for ${asset.name} (${timeframeId}): ${lastError}. Not falling back further for market data.`);
        return marketData;
    }
  } else {
    attemptLog.push("Skipping Finnhub.io (no API key or asset ID).");
  }

  // Provider 3: TwelveData
  if (apiKeys.twelvedata && asset.marketIds.twelvedata) {
    attemptLog.push("Attempting TwelveData...");
    marketData = await fetchFromTwelveData(asset.marketIds.twelvedata, asset.name, timeframeId, apiKeys.twelvedata);
    const twelveDataSuccess = marketData.price !== undefined ||
                              ((marketData.rsi !== undefined && marketData.macd?.value !== undefined) ||
                               (marketData.historical && marketData.historical.length > 0));

    if (!marketData.error && twelveDataSuccess) {
      console.log(`Successfully fetched from TwelveData for ${asset.name} (${timeframeId})`);
      marketData.error = undefined;
      return marketData;
    }
    if (marketData.error && twelveDataSuccess) {
        console.warn(`TwelveData for ${asset.name} (${timeframeId}) had partial data with error: ${marketData.error}`);
        marketData.error = `Partial data from TwelveData: ${marketData.error}`;
        return marketData;
    }
    lastError = marketData.error || `TwelveData: Essential data missing for ${asset.name}.`;
    attemptLog.push(`TwelveData failed: ${lastError}`);
  } else {
    attemptLog.push("Skipping TwelveData (no API key or asset ID).");
  }

  console.warn(`All market data providers failed for ${asset.name} (${timeframeId}). Last error: ${lastError}. Attempts: ${attemptLog.join(' | ')}`);

  if (marketData.sourceProvider === 'Unknown' || !marketData.sourceProvider) {
       marketData.error = lastError || "No API providers configured or all failed for market data.";
      if (attemptLog.filter(log => log.startsWith("Attempting")).length > 0) {
          const lastAttempt = attemptLog.filter(log => log.startsWith("Attempting")).pop();
          if (lastAttempt?.includes("Polygon.io")) marketData.sourceProvider = 'Polygon.io';
          else if (lastAttempt?.includes("Finnhub.io")) marketData.sourceProvider = 'Finnhub.io';
          else if (lastAttempt?.includes("TwelveData")) marketData.sourceProvider = 'TwelveData';
      }
  }
  if(!marketData.marketStatus) marketData.marketStatus = 'unknown';

  return marketData;
}


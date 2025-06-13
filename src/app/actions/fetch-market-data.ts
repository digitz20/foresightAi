
'use server';

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
}

// Helper to map our timeframe IDs to Polygon.io timespan strings for indicators
// For Polygon, 'minute', 'hour', 'day', 'week', 'month', 'quarter', 'year' are valid.
// We'll use 'hour' for sub-daily and 'day' for daily as a simplification.
function mapTimeframeToPolygonTimespan(timeframeId: string): string {
  switch (timeframeId) {
    case '15min':
    case '1H':
    case '4H':
      return 'hour';
    case '1D':
      return 'day';
    default:
      return 'hour'; // Default to hourly for indicators if timeframe is unknown
  }
}

export async function fetchMarketData(
  assetId: string, // Polygon.io ticker (e.g., C:EURUSD, X:BTCUSD, AAPL)
  assetName: string,
  timeframeId: string,
  apiKey: string | null
): Promise<MarketData> {
  if (!apiKey) {
    console.error('Polygon.io API key was not provided to fetchMarketData action.');
    return { error: 'API key not provided to server action.', assetName, timeframe: timeframeId };
  }

  const polygonTicker = assetId.toUpperCase();
  const indicatorTimespan = mapTimeframeToPolygonTimespan(timeframeId);
  const baseUrl = 'https://api.polygon.io';

  // 1. Fetch Previous Day's Close Price
  const priceUrl = `${baseUrl}/v2/aggs/ticker/${polygonTicker}/prev?adjusted=true&apiKey=${apiKey}`;

  // 2. Fetch RSI
  const rsiUrl = `${baseUrl}/v1/indicators/rsi/${polygonTicker}?timespan=${indicatorTimespan}&adjusted=true&window=14&series_type=close&order=desc&limit=1&apiKey=${apiKey}`;

  // 3. Fetch MACD
  const macdUrl = `${baseUrl}/v1/indicators/macd/${polygonTicker}?timespan=${indicatorTimespan}&adjusted=true&short_window=12&long_window=26&signal_window=9&series_type=close&order=desc&limit=1&apiKey=${apiKey}`;

  const result: MarketData = { assetName, timeframe: timeframeId };
  let fetchErrors: string[] = [];

  try {
    // Price Fetch
    const priceResponse = await fetch(priceUrl, { next: { revalidate: 300 } }); // Cache for 5 mins
    if (!priceResponse.ok) {
      const errorText = await priceResponse.text();
      let detail = `Polygon.io Price API Error ${priceResponse.status}: ${errorText.substring(0,100)}`;
      if (priceResponse.status === 401 || priceResponse.status === 403) detail = 'Invalid or unauthorized Polygon.io API Key for price.';
      if (priceResponse.status === 429) detail = 'Polygon.io API rate limit hit for price.';
      fetchErrors.push(`Price: ${detail}`);
    } else {
      const priceData = await priceResponse.json();
      if (priceData.results && priceData.results.length > 0 && priceData.results[0].c !== undefined) {
        result.price = parseFloat(priceData.results[0].c);
      } else if (priceData.status === 'ERROR') {
         fetchErrors.push(`Price: Polygon API error - ${priceData.error || priceData.message || 'Unknown error'}`);
      } else {
        fetchErrors.push('Price: Data not found or in unexpected format from Polygon.io.');
      }
    }

    // RSI Fetch
    const rsiResponse = await fetch(rsiUrl, { next: { revalidate: 600 } }); // Cache for 10 mins
    if (!rsiResponse.ok) {
      const errorText = await rsiResponse.text();
      let detail = `Polygon.io RSI API Error ${rsiResponse.status}: ${errorText.substring(0,100)}`;
       if (rsiResponse.status === 401 || rsiResponse.status === 403) detail = 'Invalid or unauthorized Polygon.io API Key for RSI.';
       if (rsiResponse.status === 429) detail = 'Polygon.io API rate limit hit for RSI.';
      fetchErrors.push(`RSI: ${detail}`);
    } else {
      const rsiData = await rsiResponse.json();
      if (rsiData.results?.values?.[0]?.value !== undefined) {
        result.rsi = parseFloat(rsiData.results.values[0].value);
      } else if (rsiData.status === 'ERROR') {
         fetchErrors.push(`RSI: Polygon API error - ${rsiData.error || rsiData.message || 'No data for symbol/timespan.'}`);
      } else {
        fetchErrors.push('RSI: Data not found or in unexpected format from Polygon.io.');
      }
    }

    // MACD Fetch
    const macdResponse = await fetch(macdUrl, { next: { revalidate: 600 } }); // Cache for 10 mins
    if (!macdResponse.ok) {
      const errorText = await macdResponse.text();
      let detail = `Polygon.io MACD API Error ${macdResponse.status}: ${errorText.substring(0,100)}`;
      if (macdResponse.status === 401 || macdResponse.status === 403) detail = 'Invalid or unauthorized Polygon.io API Key for MACD.';
      if (macdResponse.status === 429) detail = 'Polygon.io API rate limit hit for MACD.';
      fetchErrors.push(`MACD: ${detail}`);
    } else {
      const macdData = await macdResponse.json();
      if (macdData.results?.values?.[0]?.value !== undefined &&
          macdData.results.values[0].signal !== undefined &&
          macdData.results.values[0].histogram !== undefined) {
        result.macd = {
          value: parseFloat(macdData.results.values[0].value),
          signal: parseFloat(macdData.results.values[0].signal),
          histogram: parseFloat(macdData.results.values[0].histogram),
        };
      } else if (macdData.status === 'ERROR') {
         fetchErrors.push(`MACD: Polygon API error - ${macdData.error || macdData.message || 'No data for symbol/timespan.'}`);
      } else {
        fetchErrors.push('MACD: Data not found or in unexpected format from Polygon.io.');
      }
    }

    if (fetchErrors.length > 0) {
        const fullErrorMsg = fetchErrors.join('; ');
        result.error = fullErrorMsg;
        if (fetchErrors.some(e => e.toLowerCase().includes('api key'))) {
            result.error = `Polygon.io API Key invalid or issues with permissions. Details: ${fullErrorMsg}`;
            console.error(result.error);
        } else if (fetchErrors.some(e => e.toLowerCase().includes('rate limit'))) {
            result.error = `Polygon.io API rate limit or credit issue for ${assetName}. Please wait and try again. Details: ${fullErrorMsg.substring(0,200)}`;
            console.warn(result.error);
        } else {
            console.warn(`Partial or failed data fetch from Polygon.io for ${assetName}: ${fullErrorMsg}`);
        }
    }
    
    if (!result.price && !result.rsi && !result.macd?.value && !result.error) {
        result.error = `No market data could be retrieved for ${assetName} from Polygon.io. Verify symbol and API key/plan. Note: Indicators use '${indicatorTimespan}' timespan.`;
    }


  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error(`Network or unexpected error in fetchMarketData (Polygon.io) for ${assetName}: ${errorMessage}`);
    result.error = `Failed to fetch market data for ${assetName} from Polygon.io due to a network/client error: ${errorMessage.substring(0,100)}.`;
  }

  return result;
}

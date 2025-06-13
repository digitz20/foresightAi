
'use server';

// Define the expected structure of the response from this server action
export interface MarketData {
  price?: number;
  rsi?: number;
  macd?: {
    value?: number;
    signal?: number;
    histogram?: number;
  };
  error?: string;
  assetName?: string; // For display purposes
  timeframe?: string; // For display/context
}

// Helper to map our timeframe IDs to Twelve Data interval strings
function mapTimeframeToInterval(timeframeId: string): string {
  switch (timeframeId) {
    case '15min':
      return '15min';
    case '1H':
      return '1h';
    case '4H':
      return '4h';
    case '1D':
      return '1day';
    default:
      return '15min'; // Default interval
  }
}

export async function fetchMarketData(
  apiKey: string, // API key passed as an argument
  assetId: string,
  assetName: string,
  timeframeId: string
): Promise<MarketData> {
  if (!apiKey) {
    console.error('Twelve Data API key is not provided to fetchMarketData action.');
    return { error: 'API key not provided.', assetName, timeframe: timeframeId };
  }

  const interval = mapTimeframeToInterval(timeframeId);
  const symbol = assetId.toUpperCase();

  const baseUrl = 'https://api.twelvedata.com';
  // Add dp (decimal places) parameter to API calls for better precision control
  const priceUrl = `${baseUrl}/price?symbol=${symbol}&apikey=${apiKey}&dp=5`;
  const rsiUrl = `${baseUrl}/rsi?symbol=${symbol}&interval=${interval}&outputsize=1&apikey=${apiKey}&dp=2`;
  const macdUrl = `${baseUrl}/macd?symbol=${symbol}&interval=${interval}&outputsize=1&apikey=${apiKey}&dp=5`;

  try {
    const [priceResponse, rsiResponse, macdResponse] = await Promise.all([
      fetch(priceUrl),
      fetch(rsiUrl),
      fetch(macdUrl),
    ]);

    let priceData, rsiData, macdData;
    let apiErrorMessages: string[] = [];

    // Process Price Data
    if (priceResponse.ok) {
      priceData = await priceResponse.json();
      if (priceData.code === 401 || priceData.status === 'error' && priceData.message?.includes('API key is invalid')) {
        return { error: 'Invalid Twelve Data API Key.', assetName, timeframe: timeframeId };
      }
    } else {
      const errorText = await priceResponse.text();
      console.error(`Error fetching price for ${symbol}: ${priceResponse.status} ${errorText}`);
      if (priceResponse.status === 401) return { error: 'Invalid Twelve Data API Key.', assetName, timeframe: timeframeId };
      apiErrorMessages.push(`Price: ${priceResponse.status} ${priceResponse.statusText}`);
    }

    // Process RSI Data
    if (rsiResponse.ok) {
      rsiData = await rsiResponse.json();
      if (rsiData.code === 401 || rsiData.status === 'error' && rsiData.message?.includes('API key is invalid')) {
         // Do not return early, allow other calls to potentially succeed or fail similarly.
         apiErrorMessages.push('RSI: API key invalid (as per RSI endpoint).');
      }
    } else {
      const errorText = await rsiResponse.text();
      console.error(`Error fetching RSI for ${symbol} (${interval}): ${rsiResponse.status} ${errorText}`);
       if (rsiResponse.status !== 401) { // If it's not an auth error, add it to general errors
        apiErrorMessages.push(`RSI: ${rsiResponse.status} ${rsiResponse.statusText}`);
      } else {
        // If it *is* an auth error from RSI, and price didn't catch it, this indicates key is bad.
        // However, the price check should ideally catch this first.
         apiErrorMessages.push('RSI: API key may be invalid.');
      }
    }

    // Process MACD Data
    if (macdResponse.ok) {
      macdData = await macdResponse.json();
       if (macdData.code === 401 || macdData.status === 'error' && macdData.message?.includes('API key is invalid')) {
         apiErrorMessages.push('MACD: API key invalid (as per MACD endpoint).');
      }
    } else {
      const errorText = await macdResponse.text();
      console.error(`Error fetching MACD for ${symbol} (${interval}): ${macdResponse.status} ${errorText}`);
      if (macdResponse.status !== 401) {
        apiErrorMessages.push(`MACD: ${macdResponse.status} ${macdResponse.statusText}`);
      } else {
         apiErrorMessages.push('MACD: API key may be invalid.');
      }
    }
    
    // If any endpoint reported an invalid API key, and it's the only type of error, consolidate it.
    const isApiKeyInvalidError = apiErrorMessages.some(msg => msg.toLowerCase().includes('api key invalid'));
    if (isApiKeyInvalidError && apiErrorMessages.every(msg => msg.toLowerCase().includes('api key invalid') || msg.toLowerCase().includes('api key may be invalid'))) {
        return { error: 'Invalid Twelve Data API Key. Please check the key and try again.', assetName, timeframe: timeframeId };
    }


    if (apiErrorMessages.length > 0 && (!priceData && !rsiData && !macdData) ) {
        const combinedError = `Failed to fetch market data for ${assetName}: ${apiErrorMessages.join(', ')}. Check symbol, API key, and plan.`;
        console.error(combinedError);
        return { error: combinedError, assetName, timeframe: timeframeId };
    }

    const result: MarketData = { assetName, timeframe: timeframeId };

    if (priceData && priceData.price) {
      result.price = parseFloat(priceData.price);
    } else if (priceData && priceData.status === 'error' && !priceData.message?.includes('API key is invalid')) {
      // Don't repeat API key error if already handled or will be handled by a more general message
      console.warn(`TwelveData price API error for ${symbol}: ${priceData.message}`);
      if (!result.error) result.error = '';
      result.error += `Price data error: ${priceData.message}. `;
    }

    if (rsiData && rsiData.values && rsiData.values.length > 0) {
      result.rsi = parseFloat(rsiData.values[0].rsi);
    } else if (rsiData && rsiData.status === 'error' && !rsiData.message?.includes('API key is invalid')) {
      console.warn(`TwelveData RSI API error for ${symbol} (${interval}): ${rsiData.message}`);
      if (!result.error) result.error = '';
      result.error += `RSI data error: ${rsiData.message}. `;
    } else if (rsiData && rsiData.code === 400 && rsiData.message && rsiData.message.includes("plan doesn't allow access")) {
      console.warn(`RSI not available for ${symbol} on current plan.`);
      if (!result.error) result.error = '';
      result.error += `RSI data for ${symbol} may not be available on the current API plan. `;
    }

    if (macdData && macdData.values && macdData.values.length > 0) {
      result.macd = {
        value: parseFloat(macdData.values[0].macd),
        signal: parseFloat(macdData.values[0].macd_signal),
        histogram: parseFloat(macdData.values[0].macd_hist),
      };
    } else if (macdData && macdData.status === 'error' && !macdData.message?.includes('API key is invalid')) {
      console.warn(`TwelveData MACD API error for ${symbol} (${interval}): ${macdData.message}`);
      if (!result.error) result.error = '';
      result.error += `MACD data error: ${macdData.message}. `;
    } else if (macdData && macdData.code === 400 && macdData.message && macdData.message.includes("plan doesn't allow access")) {
      console.warn(`MACD not available for ${symbol} on current plan.`);
      if (!result.error) result.error = '';
      result.error += `MACD data for ${symbol} may not be available on the current API plan. `;
    }

    // Consolidate remaining non-API key specific errors
    const generalApiErrors = apiErrorMessages.filter(msg => !msg.toLowerCase().includes('api key invalid') && !msg.toLowerCase().includes('api key may be invalid'));
    if (generalApiErrors.length > 0 && (result.price || result.rsi || result.macd)) {
        if (!result.error) result.error = '';
        result.error += `Partial data: ${generalApiErrors.join(', ')}. Some indicators might be unavailable.`;
    }

    if (!result.price && !result.rsi && !result.macd && !result.error ) {
        result.error = `No market data could be retrieved for ${assetName}. Verify symbol, API key and API plan.`;
    }
    
    return result;

  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error(`Network or unexpected error fetching market data for ${assetName}: ${errorMessage}`);
    return { error: `Failed to fetch market data for ${assetName}: ${errorMessage}.`, assetName, timeframe: timeframeId };
  }
}

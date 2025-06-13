
'use server';

import type { z } from 'genkit';

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
  assetId: string,
  assetName: string, // Pass assetName for context in return
  timeframeId: string
): Promise<MarketData> {
  const apiKey = process.env.TWELVEDATA_API_KEY;
  if (!apiKey) {
    console.error('Twelve Data API key is not set.');
    return { error: 'API key not configured.', assetName, timeframe: timeframeId };
  }

  const interval = mapTimeframeToInterval(timeframeId);
  // Twelve Data API expects symbol in uppercase, especially for forex
  const symbol = assetId.toUpperCase();

  const baseUrl = 'https://api.twelvedata.com';
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
    } else {
      const errorText = await priceResponse.text();
      console.error(`Error fetching price for ${symbol}: ${priceResponse.status} ${errorText}`);
      apiErrorMessages.push(`Price: ${priceResponse.status} ${priceResponse.statusText}`);
    }
    
    // Process RSI Data
    if (rsiResponse.ok) {
      rsiData = await rsiResponse.json();
    } else {
      const errorText = await rsiResponse.text();
      console.error(`Error fetching RSI for ${symbol} (${interval}): ${rsiResponse.status} ${errorText}`);
      apiErrorMessages.push(`RSI: ${rsiResponse.status} ${rsiResponse.statusText}`);
    }

    // Process MACD Data
    if (macdResponse.ok) {
      macdData = await macdResponse.json();
    } else {
      const errorText = await macdResponse.text();
      console.error(`Error fetching MACD for ${symbol} (${interval}): ${macdResponse.status} ${errorText}`);
      apiErrorMessages.push(`MACD: ${macdResponse.status} ${macdResponse.statusText}`);
    }
    
    if (apiErrorMessages.length > 0 && (!priceData && !rsiData && !macdData) ) {
        // If all calls fail or crucial ones fail, return a general error
        const combinedError = `Failed to fetch some market data for ${assetName}: ${apiErrorMessages.join(', ')}. Check symbol and API key/plan.`;
        console.error(combinedError);
        return { error: combinedError, assetName, timeframe: timeframeId };
    }


    const result: MarketData = { assetName, timeframe: timeframeId };

    if (priceData && priceData.price) {
      result.price = parseFloat(priceData.price);
    } else if (priceData && priceData.status === 'error') {
      console.warn(`TwelveData price API error for ${symbol}: ${priceData.message}`);
      if (!result.error) result.error = '';
      result.error += `Price data error: ${priceData.message}. `;
    }


    if (rsiData && rsiData.values && rsiData.values.length > 0) {
      result.rsi = parseFloat(rsiData.values[0].rsi);
    } else if (rsiData && rsiData.status === 'error') {
      console.warn(`TwelveData RSI API error for ${symbol} (${interval}): ${rsiData.message}`);
      if (!result.error) result.error = '';
      result.error += `RSI data error: ${rsiData.message}. `;
    } else if (rsiData && rsiData.code === 400 && rsiData.message && rsiData.message.includes("plan doesn't allow access")) {
      // Specific handling for plan limitations on indicators for certain symbols
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
    } else if (macdData && macdData.status === 'error') {
      console.warn(`TwelveData MACD API error for ${symbol} (${interval}): ${macdData.message}`);
      if (!result.error) result.error = '';
      result.error += `MACD data error: ${macdData.message}. `;
    } else if (macdData && macdData.code === 400 && macdData.message && macdData.message.includes("plan doesn't allow access")) {
      console.warn(`MACD not available for ${symbol} on current plan.`);
      if (!result.error) result.error = '';
      result.error += `MACD data for ${symbol} may not be available on the current API plan. `;
    }
    
    // If we have some data but also some errors, include the error string
    if (apiErrorMessages.length > 0 && (result.price || result.rsi || result.macd)) {
        if (!result.error) result.error = '';
        result.error += `Partial data: ${apiErrorMessages.join(', ')}. Some indicators might be unavailable.`;
    }


    if (!result.price && !result.rsi && !result.macd && !result.error ) {
         // This case means no data and no specific errors were caught above, which is unlikely but good to cover.
        result.error = `No market data could be retrieved for ${assetName}. Verify symbol and API plan.`;
    }
    
    return result;

  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error(`Network or unexpected error fetching market data for ${assetName}: ${errorMessage}`);
    return { error: `Failed to fetch market data for ${assetName}: ${errorMessage}.`, assetName, timeframe: timeframeId };
  }
}

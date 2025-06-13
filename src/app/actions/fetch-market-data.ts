
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
  assetId: string,
  assetName: string,
  timeframeId: string,
  apiKey: string | null // API key passed as argument
): Promise<MarketData> {

  if (!apiKey) {
    console.error('Twelve Data API key was not provided to fetchMarketData action.');
    return { error: 'API key not provided to server action.', assetName, timeframe: timeframeId };
  }

  const interval = mapTimeframeToInterval(timeframeId);
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

    let priceData: any, rsiData: any, macdData: any;
    const apiErrorDetails: { source: string, message: string, isRateLimit: boolean, isInvalidKey: boolean }[] = [];

    // Helper function to process each response
    const processApiResponse = async (response: Response, type: 'Price' | 'RSI' | 'MACD') => {
      let data: any;
      let errorMessage = '';
      let isRateLimit = false;
      let isInvalidKey = false;
      let responseBodyText = ''; // To store response body for logging

      try {
        responseBodyText = await response.text(); // Read body once
        if (response.ok) {
          data = JSON.parse(responseBodyText);
          if (data.code === 401 || (data.status === 'error' && data.message?.toLowerCase().includes('api key is invalid'))) {
            isInvalidKey = true;
            errorMessage = data.message || 'Invalid API Key.';
          } else if (data.status === 'error' && (data.message?.toLowerCase().includes('api credits') || data.message?.toLowerCase().includes('rate limit'))) {
            isRateLimit = true;
            errorMessage = data.message;
          } else if (data.status === 'error') {
            errorMessage = data.message;
          }
        } else {
          // Log the raw error text for debugging
          console.error(`Error fetching ${type} for ${symbol} (${interval}): ${response.status} ${responseBodyText}`);
          if (response.status === 401 || responseBodyText.toLowerCase().includes('api key is invalid')) {
            isInvalidKey = true;
            errorMessage = responseBodyText || 'Invalid API Key.';
          } else if (response.status === 429 || responseBodyText.toLowerCase().includes('api credits') || responseBodyText.toLowerCase().includes('rate limit')) {
            isRateLimit = true;
            errorMessage = responseBodyText || 'Rate limit/credits issue.';
          } else {
            errorMessage = `${response.status} ${response.statusText || responseBodyText}`;
          }
        }
      } catch (e) {
         // Handle cases where response.text() or JSON.parse might fail
         console.error(`Error processing response for ${type}: ${e instanceof Error ? e.message : String(e)}. Raw response text: ${responseBodyText}`);
         errorMessage = `Error processing response for ${type}. Status: ${response.status}.`;
         if (response.status === 401) isInvalidKey = true;
         if (response.status === 429) isRateLimit = true;
      }
      
      if (errorMessage) {
        apiErrorDetails.push({ source: type, message: errorMessage, isRateLimit, isInvalidKey });
      }
      return data; // data might be undefined if JSON.parse failed or not OK response
    };

    priceData = await processApiResponse(priceResponse, 'Price');
    rsiData = await processApiResponse(rsiResponse, 'RSI');
    macdData = await processApiResponse(macdResponse, 'MACD');

    // Prioritize Invalid API Key error if any source reported it
    if (apiErrorDetails.some(d => d.isInvalidKey)) {
      const invalidKeyDetail = apiErrorDetails.find(d => d.isInvalidKey);
      const message = invalidKeyDetail?.message.length > 150 ? invalidKeyDetail.message.substring(0,150) + '...' : invalidKeyDetail?.message;
      return { error: `Invalid Twelve Data API Key. Please check the key. (Source: ${invalidKeyDetail?.source}, Message: ${message})`, assetName, timeframe: timeframeId };
    }

    // Check if all errors are rate limit errors and no data was fetched
    const allRequestsAttempted = 3; // Price, RSI, MACD
    const rateLimitErrorsCount = apiErrorDetails.filter(d => d.isRateLimit).length;
    const noDataFetched = !priceData?.price && !(rsiData?.values?.length > 0) && !(macdData?.values?.length > 0);

    // If all API calls resulted in some error, and at least one was a rate limit error, and no data was fetched.
    if (apiErrorDetails.length === allRequestsAttempted && rateLimitErrorsCount > 0 && noDataFetched) {
        const rateLimitMessages = apiErrorDetails.map(d => `${d.source}: ${d.message.length > 100 ? d.message.substring(0,100) + '...' : d.message }`).join('; ');
        const userMessage = `Twelve Data API rate limit or credit issue for ${assetName}. Please wait a moment and try again. Details: ${rateLimitMessages}`;
        console.warn(userMessage); // Log as warning for server logs
        return { error: userMessage, assetName, timeframe: timeframeId };
    }
    
    const result: MarketData = { assetName, timeframe: timeframeId };
    let combinedErrorMessages: string[] = [];

    // Populate data and collect errors for partial data
    if (priceData?.price) {
      result.price = parseFloat(priceData.price);
    } else {
        const priceErrorDetail = apiErrorDetails.find(d => d.source === 'Price');
        if (priceErrorDetail) {
            combinedErrorMessages.push(`Price: ${priceErrorDetail.message.length > 100 ? priceErrorDetail.message.substring(0,100) + '...' : priceErrorDetail.message}`);
        } else if (!priceData && priceResponse.ok) { // OK response but no price field (should not happen with good data)
             combinedErrorMessages.push('Price: Data format unexpected.');
        }
    }


    if (rsiData?.values?.length > 0) {
      result.rsi = parseFloat(rsiData.values[0].rsi);
    } else {
        const rsiErrorDetail = apiErrorDetails.find(d => d.source === 'RSI');
        if (rsiData?.code === 400 && rsiData.message?.includes("plan doesn't allow access")) {
             combinedErrorMessages.push(`RSI: ${rsiData.message}`);
        } else if (rsiErrorDetail) {
            combinedErrorMessages.push(`RSI: ${rsiErrorDetail.message.length > 100 ? rsiErrorDetail.message.substring(0,100) + '...' : rsiErrorDetail.message}`);
        } else if (!rsiData && rsiResponse.ok) {
            combinedErrorMessages.push('RSI: Data format unexpected.');
        }
    }


    if (macdData?.values?.length > 0) {
      result.macd = {
        value: parseFloat(macdData.values[0].macd),
        signal: parseFloat(macdData.values[0].macd_signal),
        histogram: parseFloat(macdData.values[0].macd_hist),
      };
    } else {
        const macdErrorDetail = apiErrorDetails.find(d => d.source === 'MACD');
        if (macdData?.code === 400 && macdData.message?.includes("plan doesn't allow access")) {
            combinedErrorMessages.push(`MACD: ${macdData.message}`);
        } else if (macdErrorDetail) {
            combinedErrorMessages.push(`MACD: ${macdErrorDetail.message.length > 100 ? macdErrorDetail.message.substring(0,100) + '...' : macdErrorDetail.message}`);
        } else if (!macdData && macdResponse.ok) {
             combinedErrorMessages.push('MACD: Data format unexpected.');
        }
    }

    if (combinedErrorMessages.length > 0) {
      result.error = combinedErrorMessages.join('. ');
      if(result.price || result.rsi || result.macd) { // Some data was fetched
          result.error = `Partial data for ${assetName}. Issues: ${result.error}`;
      } else { // No data fetched, and it wasn't a clean sweep of rate limit or invalid key
          result.error = `Could not fetch data for ${assetName}. Issues: ${result.error}`;
      }
    }
    
    // If no data and no specific error string was set yet
    if (!result.price && !result.rsi && !result.macd && !result.error ) {
        result.error = `No market data could be retrieved for ${assetName}. Verify symbol and API key/plan, or check API provider status.`;
    }

    return result;

  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error(`Network or unexpected error in fetchMarketData for ${assetName}: ${errorMessage}`);
    return { error: `Failed to fetch market data for ${assetName} due to a network or unexpected error: ${errorMessage}.`, assetName, timeframe: timeframeId };
  }
}


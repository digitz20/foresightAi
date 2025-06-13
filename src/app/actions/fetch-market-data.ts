
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
  assetName?: string; 
  timeframe?: string; 
}

// Helper to map our timeframe IDs to Finnhub resolution strings
function mapTimeframeToFinnhubResolution(timeframeId: string): string {
  switch (timeframeId) {
    case '15min':
      return '15';
    case '1H':
      return '60';
    case '4H': // Finnhub doesn't have 4H. Use Daily as a common proxy or '60' for more granularity.
      return 'D'; // Or '60' if more granular data is preferred for 4H context. Let's use Daily.
    case '1D':
      return 'D';
    default:
      return '15'; 
  }
}

// Helper to get the last non-null value from an array of numbers
const getLastValidValue = (arr?: number[]): number | undefined => {
  if (!arr || arr.length === 0) return undefined;
  for (let i = arr.length - 1; i >= 0; i--) {
    if (arr[i] !== null && arr[i] !== undefined && !isNaN(arr[i])) {
      return arr[i];
    }
  }
  return undefined;
};

export async function fetchMarketData(
  assetId: string,
  assetName: string,
  timeframeId: string,
  apiKey: string | null 
): Promise<MarketData> {

  if (!apiKey) {
    console.error('Finnhub API key was not provided to fetchMarketData action.');
    return { error: 'API key not provided to server action.', assetName, timeframe: timeframeId };
  }

  const symbol = assetId.toUpperCase();
  const resolution = mapTimeframeToFinnhubResolution(timeframeId);
  
  const now = Math.floor(Date.now() / 1000);
  let fromTime: number;
  switch (resolution) {
      case '15': fromTime = now - (2 * 24 * 60 * 60); break; // 2 days for 15min
      case '60': fromTime = now - (7 * 24 * 60 * 60); break; // 7 days for 1hr
      case 'D': fromTime = now - (90 * 24 * 60 * 60); break; // 90 days for Daily
      default: fromTime = now - (2 * 24 * 60 * 60); 
  }

  const baseUrl = 'https://finnhub.io/api/v1';
  const priceUrl = `${baseUrl}/quote?symbol=${symbol}&token=${apiKey}`;
  // Finnhub indicator endpoint needs specific parameters for RSI and MACD
  const rsiUrl = `${baseUrl}/indicator?symbol=${symbol}&resolution=${resolution}&from=${fromTime}&to=${now}&indicator=rsi&timeperiod=14&token=${apiKey}`;
  const macdUrl = `${baseUrl}/indicator?symbol=${symbol}&resolution=${resolution}&from=${fromTime}&to=${now}&indicator=macd&fastperiod=12&slowperiod=26&signalperiod=9&token=${apiKey}`;

  try {
    const [priceResponse, rsiResponse, macdResponse] = await Promise.all([
      fetch(priceUrl, { next: { revalidate: 60 } }), // Cache price for 1 min
      fetch(rsiUrl, { next: { revalidate: 300 } }), // Cache indicators for 5 mins
      fetch(macdUrl, { next: { revalidate: 300 } }),
    ]);

    let priceData: any, rsiData: any, macdData: any;
    const apiErrorDetails: { source: string, message: string, isRateLimit: boolean, isInvalidKey: boolean }[] = [];

    const processApiResponse = async (response: Response, type: 'Price' | 'RSI' | 'MACD') => {
      let data: any;
      let errorMessage = '';
      let isRateLimit = false;
      let isInvalidKey = false;
      let responseBodyText = '';

      try {
        responseBodyText = await response.text();
        if (!response.ok) {
           // Try to parse as JSON first for Finnhub's error structure
          try {
            data = JSON.parse(responseBodyText);
            if (data && data.error) {
              errorMessage = data.error;
              if (errorMessage.toLowerCase().includes('invalid api key') || errorMessage.toLowerCase().includes('insufficient privilege')) {
                isInvalidKey = true;
              }
              // Finnhub 429 often just has a generic message or HTML, status code is more reliable
            } else {
               errorMessage = `${response.status} ${response.statusText || responseBodyText}`;
            }
          } catch (e) {
            // Not JSON, use status text or raw body
            errorMessage = `${response.status} ${response.statusText || responseBodyText}`;
          }

          if (response.status === 401 || response.status === 403) isInvalidKey = true;
          if (response.status === 429) isRateLimit = true;

        } else { // Response OK
          data = JSON.parse(responseBodyText);
          // Check for 's' field in indicator response, 'ok' means data is likely present
          if ((type === 'RSI' || type === 'MACD') && data.s !== 'ok' && data.s !== 'no_data') {
            errorMessage = `Finnhub ${type} data not available (status: ${data.s}). For Forex/Crypto, ensure symbol and resolution are supported.`;
            // If 'no_data', it's not an error per se, just means indicator couldn't be calculated (e.g. new listing)
            // We'll let the later checks for actual values handle this.
            if(data.s === 'no_data') errorMessage = ''; // Clear error if it's just 'no_data'
          }
        }
      } catch (e) {
         console.error(`Error processing Finnhub response for ${type}: ${e instanceof Error ? e.message : String(e)}. Raw response text: ${responseBodyText}`);
         errorMessage = `Error processing response for ${type}. Status: ${response.status}.`;
         if (response.status === 401 || response.status === 403) isInvalidKey = true;
         if (response.status === 429) isRateLimit = true;
      }
      
      if (errorMessage) {
        apiErrorDetails.push({ source: type, message: errorMessage, isRateLimit, isInvalidKey });
      }
      return data;
    };

    priceData = await processApiResponse(priceResponse, 'Price');
    rsiData = await processApiResponse(rsiResponse, 'RSI');
    macdData = await processApiResponse(macdResponse, 'MACD');

    if (apiErrorDetails.some(d => d.isInvalidKey)) {
      const invalidKeyDetail = apiErrorDetails.find(d => d.isInvalidKey);
      const message = invalidKeyDetail?.message.length > 150 ? invalidKeyDetail.message.substring(0,150) + '...' : invalidKeyDetail?.message;
      return { error: `Invalid Finnhub API Key or insufficient privilege. (Source: ${invalidKeyDetail?.source}, Message: ${message})`, assetName, timeframe: timeframeId };
    }
    
    const rateLimitErrorsCount = apiErrorDetails.filter(d => d.isRateLimit).length;
    // For Finnhub, if any call is rate-limited, it's an issue.
    if (rateLimitErrorsCount > 0) {
        const rateLimitMessages = apiErrorDetails.filter(d=>d.isRateLimit).map(d => `${d.source}: ${d.message.length > 100 ? d.message.substring(0,100) + '...' : d.message }`).join('; ');
        const userMessage = `Finnhub API rate limit reached for ${assetName}. Please wait a moment and try again. Details: ${rateLimitMessages}`;
        console.warn(userMessage);
        return { error: userMessage, assetName, timeframe: timeframeId };
    }
    
    const result: MarketData = { assetName, timeframe: timeframeId };
    let combinedErrorMessages: string[] = [];

    if (priceData && (priceData.c !== undefined && priceData.c !== 0)) { // c is current price
      result.price = parseFloat(priceData.c);
    } else if (priceData && priceData.pc !== undefined) { // pc is previous close
      result.price = parseFloat(priceData.pc);
    } else {
        const priceErrorDetail = apiErrorDetails.find(d => d.source === 'Price');
        if (priceErrorDetail) {
            combinedErrorMessages.push(`Price: ${priceErrorDetail.message.length > 100 ? priceErrorDetail.message.substring(0,100) + '...' : priceErrorDetail.message}`);
        } else if (!priceData && priceResponse.ok) { 
             combinedErrorMessages.push('Price: Data format unexpected from Finnhub.');
        } else if (priceData && priceData.c === 0 && priceData.pc === 0) {
             combinedErrorMessages.push('Price: Finnhub reported 0 for current and previous close.');
        }
    }

    if (rsiData && rsiData.s === 'ok' && rsiData.rsi) {
      result.rsi = getLastValidValue(rsiData.rsi);
      if (result.rsi === undefined) combinedErrorMessages.push('RSI: No valid RSI values returned by Finnhub.');
    } else {
        const rsiErrorDetail = apiErrorDetails.find(d => d.source === 'RSI');
        if (rsiErrorDetail) {
            combinedErrorMessages.push(`RSI: ${rsiErrorDetail.message.length > 100 ? rsiErrorDetail.message.substring(0,100) + '...' : rsiErrorDetail.message}`);
        } else if (rsiData && rsiData.s === 'no_data') {
            combinedErrorMessages.push('RSI: Finnhub reported no data available to calculate RSI (e.g. new listing or insufficient history).');
        } else if (rsiData && rsiData.s !== 'ok') {
            combinedErrorMessages.push(`RSI: Finnhub status ${rsiData.s || 'unknown'}.`);
        } else if (!rsiData && rsiResponse.ok) {
            combinedErrorMessages.push('RSI: Data format unexpected from Finnhub.');
        }
    }

    if (macdData && macdData.s === 'ok' && macdData.macd && macdData.macdSignal && macdData.macdHist) {
      result.macd = {
        value: getLastValidValue(macdData.macd),
        signal: getLastValidValue(macdData.macdSignal),
        histogram: getLastValidValue(macdData.macdHist),
      };
      if (result.macd.value === undefined || result.macd.signal === undefined || result.macd.histogram === undefined) {
        combinedErrorMessages.push('MACD: Some MACD components missing from Finnhub data.');
      }
    } else {
        const macdErrorDetail = apiErrorDetails.find(d => d.source === 'MACD');
        if (macdErrorDetail) {
            combinedErrorMessages.push(`MACD: ${macdErrorDetail.message.length > 100 ? macdErrorDetail.message.substring(0,100) + '...' : macdErrorDetail.message}`);
        } else if (macdData && macdData.s === 'no_data') {
             combinedErrorMessages.push('MACD: Finnhub reported no data available to calculate MACD.');
        } else if (macdData && macdData.s !== 'ok') {
            combinedErrorMessages.push(`MACD: Finnhub status ${macdData.s || 'unknown'}.`);
        } else if (!macdData && macdResponse.ok) {
             combinedErrorMessages.push('MACD: Data format unexpected from Finnhub.');
        }
    }

    if (combinedErrorMessages.length > 0) {
      result.error = combinedErrorMessages.join('. ');
      if(result.price || result.rsi || result.macd?.value) { 
          result.error = `Partial data for ${assetName}. Issues: ${result.error}`;
      } else { 
          result.error = `Could not fetch data for ${assetName}. Issues: ${result.error}`;
      }
    }
    
    if (!result.price && !result.rsi && !result.macd?.value && !result.error ) {
        result.error = `No market data could be retrieved for ${assetName} from Finnhub. Verify symbol and API key/plan, or check API provider status.`;
    }

    return result;

  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error(`Network or unexpected error in fetchMarketData (Finnhub) for ${assetName}: ${errorMessage}`);
    return { error: `Failed to fetch market data for ${assetName} from Finnhub due to a network or unexpected error: ${errorMessage}.`, assetName, timeframe: timeframeId };
  }
}

    
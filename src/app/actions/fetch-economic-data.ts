
'use server';

export interface EconomicData {
  indicatorName: string;
  value: string;
  comparisonCurrency?: string;
  source: string;
  error?: string;
  lastUpdated?: string;
}

// Helper to extract base currency from assetId (e.g., "EUR/USD" -> "EUR")
// For XAU/USD, XAG/USD, CL (Oil), BTC/USD we might want to show their value against USD or a general index.
// For simplicity, we'll focus on the first part of currency pairs.
// For commodities/crypto, we'll try to get their USD rate or fetch a major currency like EUR as a proxy for economic health.
function getBaseCurrencyForApi(assetId: string): string {
  if (assetId.includes('/')) {
    return assetId.split('/')[0].toUpperCase();
  }
  // For non-currency pairs like "CL", "XAU/USD", "BTC/USD",
  // we might want to fetch rates for a major currency like EUR or USD
  // as a proxy for general economic data. ExchangeRate-API needs a base currency.
  // If it's XAU/USD, BTC/USD, etc., the "base" is XAU, BTC.
  // Let's assume for these we want to see their value in USD,
  // but the API works by base currency.
  // For simplicity, if it's a commodity or crypto, let's use USD as base to see other rates.
  // Or, more directly, if we want XAU/USD, we are interested in USD.
  // TradingEconomics is better for specific indicators.
  // With ExchangeRate-API, we are limited to FX.
  // Let's return the primary currency of the pair.
  switch (assetId) {
    case 'XAU/USD':
    case 'XAG/USD':
    case 'BTC/USD':
      return 'USD'; // Or another major currency if we want to show its general strength
    case 'CL': // Crude oil is often priced in USD
      return 'USD';
    default: // For pairs like EUR/USD, GBP/JPY
      return assetId.split('/')[0].toUpperCase();
  }
}


export async function fetchEconomicData(
  assetId: string, // e.g., "EUR/USD", "XAU/USD"
  assetName: string, // e.g., "EUR/USD", "Gold (Spot)"
  apiKey: string | null
): Promise<EconomicData> {
  if (!apiKey) {
    console.error('ExchangeRate-API key was not provided to fetchEconomicData action.');
    return {
      indicatorName: 'Exchange Rate Data',
      value: 'N/A',
      source: 'ExchangeRate-API.com',
      error: 'API key not configured for ExchangeRate-API.',
    };
  }

  const baseCurrency = getBaseCurrencyForApi(assetId);
  const targetCurrency = assetId.includes('/') ? assetId.split('/')[1].toUpperCase() : 'USD';
  // If assetId is something like XAU/USD, target is USD. If EUR/USD, target is USD.
  // If GBP/JPY, target is JPY.

  const apiUrl = `https://v6.exchangerate-api.com/v6/${apiKey}/latest/${baseCurrency}`;

  try {
    const response = await fetch(apiUrl);
    const data = await response.json();

    if (!response.ok || data.result === 'error') {
      let errorMessage = `API Error: ${data['error-type'] || response.statusText || 'Unknown error'}`;
      if (data['error-type'] === 'invalid-key') {
        errorMessage = 'Invalid ExchangeRate-API Key. Please check the key.';
      } else if (data['error-type'] === 'inactive-account') {
        errorMessage = 'ExchangeRate-API account is inactive.';
      } else if (data['error-type'] === 'quota-reached') {
        errorMessage = 'ExchangeRate-API quota reached.';
      }
      console.error(`Error fetching economic data from ExchangeRate-API for ${baseCurrency}: ${errorMessage}`, data);
      return {
        indicatorName: `Exchange Rate: ${assetName}`,
        value: 'N/A',
        source: 'ExchangeRate-API.com',
        error: errorMessage,
      };
    }

    const rate = data.conversion_rates && data.conversion_rates[targetCurrency];
    if (rate === undefined && targetCurrency !== baseCurrency) {
       // This can happen if targetCurrency is not in the list, though USD, EUR, JPY, GBP, AUD, CAD usually are.
       // Or if baseCurrency itself is the target, then rate is 1.
      console.warn(`Target currency ${targetCurrency} not found in rates for base ${baseCurrency}. Asset: ${assetName}`);
       return {
        indicatorName: `Exchange Rate: ${assetName}`,
        value: 'N/A',
        source: 'ExchangeRate-API.com',
        error: `Rate for ${targetCurrency} from base ${baseCurrency} not available.`,
        lastUpdated: data.time_last_update_utc,
      };
    }
    
    // For XAU/USD, XAG/USD, BTC/USD, CL - assetId doesn't cleanly map to base/target for this API
    // The current getBaseCurrencyForApi logic might make less sense for these.
    // Let's refine the indicator name and value based on what we fetched.
    let displayValue: string;
    let indicatorNameDisplay: string;
    let comparisonDisplay: string | undefined;

    if (assetId.includes('/')) { // Standard currency pair
        indicatorNameDisplay = `Exchange Rate: ${assetName}`;
        displayValue = rate !== undefined ? rate.toFixed(5) : 'N/A';
        comparisonDisplay = targetCurrency;
    } else { // Commodities/Crypto - fetched USD as base (or EUR)
        indicatorNameDisplay = `${assetName} (Priced in USD)`; // Assumption
        // This is tricky because ExchangeRate-API is for FX.
        // For Gold (XAU/USD), if we fetched base=USD, we get USD vs other currencies.
        // This doesn't directly give XAU price.
        // We'll use a placeholder message for these for now with this API.
        indicatorNameDisplay = `${assetName} - Market Price`;
        displayValue = 'See Market Overview'; // Defer to TwelveData for actual price
        comparisonDisplay = '';
        if (assetId === 'CL') indicatorNameDisplay = "WTI Crude Oil Price";
        else if (assetId === 'XAU/USD') indicatorNameDisplay = "Gold Spot Price";
        else if (assetId === 'XAG/USD') indicatorNameDisplay = "Silver Spot Price";
        else if (assetId === 'BTC/USD') indicatorNameDisplay = "Bitcoin Price";
         return { // For commodities/crypto, this API isn't the right source for their prices
            indicatorName: assetName,
            value: 'Refer to Market Overview',
            source: 'ExchangeRate-API.com (Note: FX API)',
            error: `ExchangeRate-API is for currency exchange, not direct ${assetName} pricing.`,
            lastUpdated: data.time_last_update_utc,
        };
    }


    return {
      indicatorName: indicatorNameDisplay,
      value: displayValue,
      comparisonCurrency: comparisonDisplay,
      source: 'ExchangeRate-API.com',
      lastUpdated: data.time_last_update_utc,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error(`Network or unexpected error in fetchEconomicData for ${assetName}: ${errorMessage}`);
    return {
      indicatorName: `Exchange Rate: ${assetName}`,
      value: 'N/A',
      source: 'ExchangeRate-API.com',
      error: `Network/Client error: ${errorMessage.substring(0, 100)}`,
    };
  }
}

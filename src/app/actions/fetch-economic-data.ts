
'use server';

export interface EconomicData {
  indicatorName: string;
  value: string;
  comparisonCurrency?: string;
  source: string;
  error?: string;
  lastUpdated?: string; // Unix timestamp as string or formatted date string
}

// Helper to extract base and target currencies for OpenExchangeRates
// OpenExchangeRates primarily gives rates against USD.
// For a pair like EUR/USD, we want the EUR rate (which is 1/USD_EUR_rate).
// For XAU/USD, we'd ideally get XAU price in USD. OpenExchangeRates has some commodity rates against USD.
function getSymbolsForOpenExchangeRates(assetId: string): { base: string, target: string, isCommodityOrCrypto: boolean } {
  const parts = assetId.split('/');
  if (assetId === 'CL') return { base: 'USD', target: 'WTI', isCommodityOrCrypto: true }; // WTI is a common ticker for crude
  if (assetId === 'XAU/USD') return { base: 'USD', target: 'XAU', isCommodityOrCrypto: true };
  if (assetId === 'XAG/USD') return { base: 'USD', target: 'XAG', isCommodityOrCrypto: true };
  if (assetId === 'BTC/USD') return { base: 'USD', target: 'BTC', isCommodityOrCrypto: true };

  // For currency pairs like EUR/USD, target is USD, base is EUR
  if (parts.length === 2) {
    return { base: parts[0].toUpperCase(), target: parts[1].toUpperCase(), isCommodityOrCrypto: false };
  }
  // Default fallback (should not happen with current ASSETS)
  return { base: 'USD', target: assetId.toUpperCase(), isCommodityOrCrypto: false};
}


export async function fetchEconomicData(
  assetId: string, 
  assetName: string, 
  apiKey: string | null
): Promise<EconomicData> {
  if (!apiKey) {
    return {
      indicatorName: `Exchange Rate: ${assetName}`,
      value: 'N/A',
      source: 'OpenExchangeRates.org',
      error: 'API key not configured for OpenExchangeRates.org.',
    };
  }

  const { base: apiBaseCurrency, target: apiTargetCurrency, isCommodityOrCrypto } = getSymbolsForOpenExchangeRates(assetId);
  
  // OpenExchangeRates provides all rates against USD by default in the free plan
  // Or against a specified base in paid plans.
  // We will fetch `latest.json` which is USD-based for free tier.
  // Then we will calculate the desired pair rate if it's not USD based.
  const apiUrl = `https://openexchangerates.org/api/latest.json?app_id=${apiKey}`;

  try {
    const response = await fetch(apiUrl, { next: { revalidate: 3600 } }); // Cache for 1 hour
    const data = await response.json();

    if (data.error) {
        let errorMessage = `API Error ${data.status || ''}: ${data.message || 'Unknown error'}. ${data.description || ''}`;
        if (data.message === 'invalid_app_id') {
            errorMessage = 'Invalid OpenExchangeRates.org API Key. Please check the key.';
        } else if (data.message === 'not_allowed') {
            errorMessage = 'OpenExchangeRates.org: Access restricted. Your plan may not support this request or an addon is required.';
        } else if (data.message === 'missing_app_id') {
            errorMessage = 'OpenExchangeRates.org: API key was not provided (missing_app_id).';
        }
        console.error(`Error fetching data from OpenExchangeRates.org for ${assetName}: ${errorMessage}`, data);
        return {
            indicatorName: `Data for ${assetName}`,
            value: 'N/A',
            source: 'OpenExchangeRates.org',
            error: errorMessage.substring(0, 200), // Keep error message concise for UI
        };
    }

    const rates = data.rates;
    const timestamp = data.timestamp; // Unix timestamp
    const defaultBase = data.base; // Usually USD for free tier

    let displayValue: string = 'N/A';
    let indicatorNameDisplay: string = `Exchange Rate: ${assetName}`;
    let comparisonDisplay: string | undefined = apiTargetCurrency;

    if (isCommodityOrCrypto) {
        // For XAU, XAG, BTC, WTI - OpenExchangeRates provides them against USD
        // So if apiTargetCurrency is XAU, rates['XAU'] is XAU per USD. We want USD per XAU.
        // Or if the API directly gives asset per USD (e.g. BTC per USD)
        if (rates[apiTargetCurrency]) { // e.g. rates['XAU'] is how many XAU for 1 USD. We want 1/rates['XAU'] to get USD per XAU.
                                        // rates['BTC'] is how many BTC for 1 USD. We want 1/rates['BTC'] to get USD per BTC.
                                        // However, some APIs might list BTC as USD price directly if USD is not the base.
                                        // Since OpenExchangeRates free tier is USD base:
                                        // rates.BTC = value of 1 USD in BTC. Price of BTC in USD = 1 / rates.BTC
                                        // rates.XAU = value of 1 USD in XAU. Price of XAU in USD = 1 / rates.XAU
            const rate = rates[apiTargetCurrency];
            displayValue = (1 / rate).toFixed(assetId === 'BTC/USD' ? 2 : (assetId.includes('XAU') || assetId.includes('XAG') ? 2 : 5));
            indicatorNameDisplay = `${assetName} vs USD`;
            comparisonDisplay = defaultBase; // Price is in USD
        } else {
            displayValue = 'N/A';
            indicatorNameDisplay = `${assetName} vs USD`;
            comparisonDisplay = defaultBase;
        }
    } else { // FX pair
        if (defaultBase === apiBaseCurrency) { // e.g. USD/CAD, apiBase = USD, apiTarget = CAD
            if (rates[apiTargetCurrency]) {
                displayValue = rates[apiTargetCurrency].toFixed(5);
                comparisonDisplay = apiTargetCurrency;
            }
        } else if (defaultBase === apiTargetCurrency) { // e.g. EUR/USD, apiBase = EUR, apiTarget = USD
                                                     // We have rates relative to USD. We need EUR/USD.
                                                     // So, 1 EUR = rates[EUR] USD.  No, rates[EUR] is how many EUR for 1 USD.
                                                     // We need (1 / rates[apiBaseCurrency]) to get apiBaseCurrency/USD rate
            if (rates[apiBaseCurrency]) {
                displayValue = (1 / rates[apiBaseCurrency]).toFixed(5);
                comparisonDisplay = apiTargetCurrency; // which is USD
            }
        } else { 
            // Cross-currency, e.g. GBP/JPY. Default base is USD.
            // GBP/JPY = (GBP/USD) / (JPY/USD) = (1/rates.GBP) / (1/rates.JPY) = rates.JPY / rates.GBP
            if (rates[apiBaseCurrency] && rates[apiTargetCurrency]) {
                // rates[apiBaseCurrency] is how many apiBaseCurrency for 1 USD
                // rates[apiTargetCurrency] is how many apiTargetCurrency for 1 USD
                // We want: (apiTargetCurrency / USD) / (apiBaseCurrency / USD)
                // This is (1 / rates[apiTargetCurrency]) / (1 / rates[apiBaseCurrency]) = rates[apiBaseCurrency] / rates[apiTargetCurrency]
                // No, this is wrong.
                // We want price of 1 unit of apiBaseCurrency in terms of apiTargetCurrency.
                // Value of 1 USD in apiBaseCurrency = rates[apiBaseCurrency]
                // Value of 1 USD in apiTargetCurrency = rates[apiTargetCurrency]
                // So, apiBaseCurrency / USD = 1 / rates[apiBaseCurrency]
                // And apiTargetCurrency / USD = 1 / rates[apiTargetCurrency]
                // Therefore, (apiBaseCurrency / USD) * (USD / apiTargetCurrency) = (apiBaseCurrency / apiTargetCurrency)
                // = (1 / rates[apiBaseCurrency]) * rates[apiTargetCurrency]
                const rate = rates[apiTargetCurrency] / rates[apiBaseCurrency];
                displayValue = rate.toFixed(5);
            }
        }
    }

    return {
      indicatorName: indicatorNameDisplay,
      value: displayValue,
      comparisonCurrency: comparisonDisplay,
      source: 'OpenExchangeRates.org',
      lastUpdated: timestamp ? new Date(timestamp * 1000).toUTCString() : undefined,
    };

  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error(`Network or unexpected error in fetchEconomicData (OpenExchangeRates) for ${assetName}: ${errorMessage}`);
    return {
      indicatorName: `Data for ${assetName}`,
      value: 'N/A',
      source: 'OpenExchangeRates.org',
      error: `Network/Client error: ${errorMessage.substring(0, 100)}`,
    };
  }
}

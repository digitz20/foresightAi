
'use server';

// This interface is now shared and needs to be consistent with page.tsx
interface AssetEconomicIds {
  openexchangerates?: string; // Base currency (e.g., EUR) or commodity ticker (XAU)
  exchangerateapi?: string;   // Base currency (e.g., EUR)
}

interface Asset {
  name: string;
  type: string;
  economicIds: AssetEconomicIds;
  // marketIds are handled by fetch-market-data.ts
}

export interface EconomicData {
  indicatorName: string;
  value: string;
  comparisonCurrency?: string;
  error?: string;
  lastUpdated?: string; // Unix timestamp as string or formatted date string
  sourceProvider?: 'OpenExchangeRates.org' | 'ExchangeRate-API.com' | 'Unknown';
  providerSpecificError?: boolean;
}

// OpenExchangeRates specific helper (already exists and adapted)
function getSymbolsForOpenExchangeRates(assetEconomicId: string, assetType: string): { base: string, target: string, isCommodityOrCrypto: boolean, originalId: string } {
  const parts = assetEconomicId.split('/'); // e.g. "EUR/USD" might be passed as asset.name if economicId is just "EUR"
                                          // The economicId should ideally be just the base like "EUR" or "XAU"

  // For OpenExchangeRates, the economicId is typically the currency code (EUR, JPY) or commodity (XAU, XAG, WTI, BTC)
  // For FX pairs, OER provides rates against USD. We want to display the rate for the asset.
  // Example: asset.name = "EUR/USD", asset.economicIds.openexchangerates = "EUR"
  // We want to show EUR vs USD. OER gives USD per EUR if EUR is not USD. Or EUR per USD if EUR is USD.
  // OER free tier is USD base. So, rates.EUR = value of 1 USD in EUR. We want 1/rates.EUR for EUR/USD.

  if (assetEconomicId === 'WTI' || assetEconomicId === 'CL') return { base: 'USD', target: 'WTI', isCommodityOrCrypto: true, originalId: assetEconomicId };
  if (assetEconomicId === 'XAU') return { base: 'USD', target: 'XAU', isCommodityOrCrypto: true, originalId: assetEconomicId };
  if (assetEconomicId === 'XAG') return { base: 'USD', target: 'XAG', isCommodityOrCrypto: true, originalId: assetEconomicId };
  if (assetEconomicId === 'BTC') return { base: 'USD', target: 'BTC', isCommodityOrCrypto: true, originalId: assetEconomicId };
  
  // If assetEconomicId is a currency like "EUR", "GBP"
  // And asset.name is "EUR/USD", "GBP/JPY"
  // For EUR/USD (economicId: EUR), base=EUR, target=USD.
  // For GBP/JPY (economicId: GBP), base=GBP, target=JPY.
  const nameParts = assetType === 'currency' && assetEconomicId.length === 3 ? assetEconomicId + "/USD" : assetEconomicId; // fallback for non-pairs
  const pairParts = nameParts.split('/');

  if (pairParts.length === 2) {
    // If economicId is "EUR" and assetName "EUR/USD", base is EUR, target is USD
    // If economicId is "GBP" and assetName "GBP/JPY", base is GBP, target is JPY
    return { base: pairParts[0].toUpperCase(), target: pairParts[1].toUpperCase(), isCommodityOrCrypto: false, originalId: assetEconomicId };
  }

  // Fallback for single ticker if not commodity/crypto recognized above
  return { base: assetEconomicId.toUpperCase(), target: 'USD', isCommodityOrCrypto: assetType !== 'currency', originalId: assetEconomicId };
}


async function fetchFromOpenExchangeRates(
  asset: Asset,
  apiKey: string
): Promise<EconomicData> {
  const result: EconomicData = {
    indicatorName: `Data for ${asset.name}`,
    value: 'N/A',
    sourceProvider: 'OpenExchangeRates.org',
  };

  if (!asset.economicIds.openexchangerates) {
    result.error = "OpenExchangeRates.org: Asset economic ID not configured.";
    result.providerSpecificError = true;
    return result;
  }

  // Use asset.economicIds.openexchangerates (e.g. "EUR", "XAU")
  const { base: apiBaseCurrency, target: apiTargetCurrency, isCommodityOrCrypto, originalId: oerId } = getSymbolsForOpenExchangeRates(asset.economicIds.openexchangerates, asset.type);
  
  const apiUrl = `https://openexchangerates.org/api/latest.json?app_id=${apiKey}`;
  let isKeyOrRateLimitError = false;

  try {
    const response = await fetch(apiUrl, { next: { revalidate: 3600 } });
    const data = await response.json();

    if (data.error) {
        let errorMessage = `API Error ${data.status || ''}: ${data.message || 'Unknown error'}.`;
        if (data.message === 'invalid_app_id') { errorMessage = 'Invalid API Key.'; isKeyOrRateLimitError = true;}
        else if (data.message === 'not_allowed') { errorMessage = 'Access restricted. Plan may not support this request.'; isKeyOrRateLimitError = true;}
        else if (data.message === 'missing_app_id') { errorMessage = 'API key missing.'; isKeyOrRateLimitError = true;}
        result.error = `OpenExchangeRates.org: ${errorMessage.substring(0, 150)}`;
        result.providerSpecificError = isKeyOrRateLimitError;
        return result;
    }

    const rates = data.rates;
    const timestamp = data.timestamp;
    const defaultApiBase = data.base; // Usually USD for free tier

    let displayValue: string = 'N/A';
    let indicatorNameDisplay: string = `Rate: ${asset.name}`;
    let comparisonDisplay: string | undefined = apiTargetCurrency;

    if (isCommodityOrCrypto) {
        // oerId here is XAU, XAG, WTI, BTC
        if (rates[oerId] && defaultApiBase === 'USD') { // e.g. rates['XAU'] = XAU per USD. We want USD per XAU.
            const rate = rates[oerId];
            displayValue = (1 / rate).toFixed(oerId === 'BTC' ? 2 : (oerId.includes('XAU') || oerId.includes('XAG') ? 2 : (oerId === 'WTI' ? 2 : 5)));
            indicatorNameDisplay = `${asset.name} vs USD`;
            comparisonDisplay = defaultApiBase; // Price is in USD
        } else {
             result.error = `OpenExchangeRates.org: Rate for ${oerId} not found in USD base.`;
             result.providerSpecificError = true;
        }
    } else { // FX pair, apiBaseCurrency = "EUR", apiTargetCurrency = "USD" for asset.name "EUR/USD"
        if (defaultApiBase === apiBaseCurrency) { // e.g. OER base is EUR (paid plan), we want EUR/USD. rates[USD] is USD per EUR.
            if (rates[apiTargetCurrency]) {
                displayValue = rates[apiTargetCurrency].toFixed(5);
            }
        } else if (defaultApiBase === 'USD') { // Default free tier scenario
            // We want apiBaseCurrency / apiTargetCurrency (e.g. EUR/USD)
            // rates[apiBaseCurrency] = how many 'apiBaseCurrency' for 1 USD (e.g. EUR for 1 USD)
            // rates[apiTargetCurrency] = how many 'apiTargetCurrency' for 1 USD (e.g. JPY for 1 USD)
            
            const rateOfBaseToUSD = rates[apiBaseCurrency]; // e.g. EUR per USD
            const rateOfTargetToUSD = rates[apiTargetCurrency]; // e.g. USD per USD (is 1), or JPY per USD

            if (apiTargetCurrency === 'USD') { // e.g. EUR/USD. We want 1 EUR in USD. rates[EUR] = EUR for 1 USD. So 1/rates[EUR] = USD for 1 EUR.
                if (rateOfBaseToUSD) {
                    displayValue = (1 / rateOfBaseToUSD).toFixed(5);
                } else {
                    result.error = `OpenExchangeRates.org: Base currency ${apiBaseCurrency} not found in USD rates.`;
                    result.providerSpecificError = true;
                }
            } else { // Cross-currency, e.g. GBP/JPY. base=GBP, target=JPY. OER base=USD.
                     // GBP/JPY = (GBP/USD) / (JPY/USD)
                     // GBP/USD = 1 / rates.GBP (since rates.GBP is GBP for 1 USD)
                     // JPY/USD = 1 / rates.JPY
                     // So, GBP/JPY = (1/rates.GBP) / (1/rates.JPY) = rates.JPY / rates.GBP
                if (rateOfBaseToUSD && rateOfTargetToUSD) {
                    const crossRate = rateOfTargetToUSD / rateOfBaseToUSD;
                    displayValue = crossRate.toFixed(5);
                } else {
                    result.error = `OpenExchangeRates.org: One or both currencies (${apiBaseCurrency}, ${apiTargetCurrency}) not found for cross-rate.`;
                    result.providerSpecificError = true;
                }
            }
        } else {
            result.error = `OpenExchangeRates.org: Base currency mismatch. API base: ${defaultApiBase}, needed: ${apiBaseCurrency} or USD.`;
            result.providerSpecificError = true;
        }
    }
    
    if (displayValue !== 'N/A') {
        result.indicatorName = indicatorNameDisplay;
        result.value = displayValue;
        result.comparisonCurrency = comparisonDisplay;
        result.lastUpdated = timestamp ? new Date(timestamp * 1000).toUTCString() : undefined;
        result.error = undefined; // Clear previous errors if successful
        result.providerSpecificError = undefined;
    }


  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    result.error = `OpenExchangeRates.org: Network/Client error - ${msg.substring(0,100)}`;
    result.providerSpecificError = true;
  }
  return result;
}

async function fetchFromExchangeRateApi(
  asset: Asset,
  apiKey: string
): Promise<EconomicData> {
  const result: EconomicData = {
    indicatorName: `Data for ${asset.name}`,
    value: 'N/A',
    sourceProvider: 'ExchangeRate-API.com',
  };
  
  if (!asset.economicIds.exchangerateapi) {
    result.error = "ExchangeRate-API.com: Asset economic ID not configured.";
    result.providerSpecificError = true;
    return result;
  }
  // ExchangeRate-API.com uses base currency in the path. economicId should be the base currency (e.g. EUR)
  const baseCurrency = asset.economicIds.exchangerateapi.toUpperCase();
  const apiUrl = `https://v6.exchangerate-api.com/v6/${apiKey}/latest/${baseCurrency}`;
  let isKeyOrRateLimitError = false;

  try {
    const response = await fetch(apiUrl, { next: { revalidate: 3600 } });
    const data = await response.json();

    if (data.result === 'error') {
      let errorType = data['error-type'] || 'Unknown error';
      if (errorType === 'invalid-key') { errorType = 'Invalid API Key.'; isKeyOrRateLimitError = true;}
      else if (errorType === 'inactive-account') { errorType = 'Inactive account.'; isKeyOrRateLimitError = true;}
      else if (errorType === 'quota-reached') { errorType = 'Quota reached.'; isKeyOrRateLimitError = true;}
      result.error = `ExchangeRate-API.com: ${errorType}`;
      result.providerSpecificError = isKeyOrRateLimitError;
      return result;
    }
    
    // Determine target currency from asset.name (e.g., for EUR/USD, target is USD)
    // For XAU/USD, this API is FX only, so it won't work well for commodities.
    let targetCurrency = 'USD'; // Default target
    if (asset.type === 'currency' && asset.name.includes('/')) {
        const parts = asset.name.split('/');
        if (parts[0].toUpperCase() === baseCurrency) {
            targetCurrency = parts[1].toUpperCase();
        }
    } else if (asset.type !== 'currency') {
        result.error = `ExchangeRate-API.com: Only supports FX pairs. Cannot fetch ${asset.name}.`;
        result.providerSpecificError = true; // This provider is unsuitable for this asset type
        return result;
    }


    if (data.conversion_rates && data.conversion_rates[targetCurrency]) {
      result.indicatorName = `Rate: ${baseCurrency}/${targetCurrency}`;
      result.value = data.conversion_rates[targetCurrency].toFixed(5);
      result.comparisonCurrency = targetCurrency;
      result.lastUpdated = data.time_last_update_utc || (data.time_last_update_unix ? new Date(data.time_last_update_unix * 1000).toUTCString() : undefined);
      result.error = undefined;
      result.providerSpecificError = undefined;
    } else {
      result.error = `ExchangeRate-API.com: Target currency ${targetCurrency} not found for base ${baseCurrency}.`;
      result.providerSpecificError = true;
    }

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    result.error = `ExchangeRate-API.com: Network/Client error - ${msg.substring(0,100)}`;
    result.providerSpecificError = true;
  }
  return result;
}


export async function fetchEconomicData(
  asset: Asset,
  apiKeys: {
    openExchangeRates?: string | null;
    exchangeRateApi?: string | null;
  }
): Promise<EconomicData> {
  let economicData: EconomicData = { 
    indicatorName: `Economic Data for ${asset.name}`, 
    value: 'N/A', 
    sourceProvider: 'Unknown' 
  };
  let lastError: string | undefined;
  let attemptLog: string[] = [];

  // Provider 1: OpenExchangeRates.org
  if (apiKeys.openExchangeRates && asset.economicIds.openexchangerates) {
    attemptLog.push("Attempting OpenExchangeRates.org...");
    economicData = await fetchFromOpenExchangeRates(asset, apiKeys.openExchangeRates);
    if (!economicData.error && economicData.value !== 'N/A') {
      console.log(`Successfully fetched from OpenExchangeRates.org for ${asset.name}`);
      return economicData;
    }
    lastError = economicData.error;
    attemptLog.push(`OpenExchangeRates.org failed: ${lastError}`);
    if (!economicData.providerSpecificError) {
       console.warn(`OpenExchangeRates.org failed with non-provider specific error for ${asset.name}: ${lastError}. Not falling back further.`);
       return economicData;
    }
  } else {
    attemptLog.push("Skipping OpenExchangeRates.org (no API key or asset ID).");
  }

  // Provider 2: ExchangeRate-API.com
  if (apiKeys.exchangeRateApi && asset.economicIds.exchangerateapi) {
    attemptLog.push("Attempting ExchangeRate-API.com...");
    // Note: ExchangeRate-API is primarily for FX, so commodity/crypto might not work well
    if (asset.type === 'currency') {
        economicData = await fetchFromExchangeRateApi(asset, apiKeys.exchangeRateApi);
        if (!economicData.error && economicData.value !== 'N/A') {
          console.log(`Successfully fetched from ExchangeRate-API.com for ${asset.name}`);
          return economicData;
        }
        lastError = economicData.error; // Update lastError only if attempted
        attemptLog.push(`ExchangeRate-API.com failed: ${lastError}`);
    } else {
        attemptLog.push(`Skipping ExchangeRate-API.com for non-currency asset ${asset.name}.`);
        if (!lastError) { // If OER was also skipped
            lastError = `ExchangeRate-API.com is not suitable for non-currency ${asset.name}.`;
        }
    }
  } else {
    attemptLog.push("Skipping ExchangeRate-API.com (no API key or asset ID).");
  }
  
  console.warn(`All economic data providers failed for ${asset.name}. Last error: ${lastError}. Attempts: ${attemptLog.join(' | ')}`);

  if (!economicData.sourceProvider || economicData.sourceProvider === 'Unknown') {
      economicData.error = lastError || "No API providers configured or all failed for economic data.";
      economicData.sourceProvider = 'Unknown';
  }
  return economicData;
}

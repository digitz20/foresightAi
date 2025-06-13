
'use server';

import { format } from 'date-fns';

export interface InterestRateData {
  rate?: number;
  seriesId?: string;
  lastUpdated?: string;
  error?: string;
  sourceProvider: 'FRED';
}

const FRED_SERIES_MAP: Record<string, string> = {
  USD: 'FEDFUNDS',                // Federal Funds Effective Rate
  EUR: 'ECBDFR',                  // ECB Deposit Facility Rate
  JPY: 'BOJDPBAL',                // Bank of Japan Complementary Deposit Facility Rate
  GBP: 'IUMABEDR',                // Bank of England Official Bank Rate
  AUD: 'RBATCTR',                 // Cash Rate Target, RBA
  CAD: 'V122530',                 // Bank of Canada Overnight Rate Target
  CHF: 'SNBCHFMA',                // SNB Policy Rate
  NZD: 'RBNZOCRHC',               // Official Cash Rate, RBNZ
  // SGD: 'IRSTCB01SGM156N' // Example: OECD Short-term rate for Singapore (monthly, might not be ideal)
  // For SGD, direct daily policy rate from FRED might be tricky. Fallback estimation might be better.
};

export async function fetchInterestRate(
  primaryCurrency: string,
  apiKey: string
): Promise<InterestRateData> {
  const result: InterestRateData = { sourceProvider: 'FRED' };

  if (!apiKey) {
    result.error = 'FRED API key not provided.';
    return result;
  }

  const seriesId = FRED_SERIES_MAP[primaryCurrency.toUpperCase()];
  result.seriesId = seriesId;

  if (!seriesId) {
    result.error = `No FRED series ID mapped for currency: ${primaryCurrency}. Interest rate will be estimated.`;
    return result;
  }

  const apiUrl = `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&api_key=${apiKey}&file_type=json&limit=1&sort_order=desc`;

  try {
    const response = await fetch(apiUrl, { next: { revalidate: 3600 * 6 } }); // Revalidate every 6 hours
    const data = await response.json();

    if (!response.ok || data.error_message || !data.observations || data.observations.length === 0) {
      result.error = `FRED API Error for ${seriesId}: ${data.error_message || response.statusText || 'No observations found.'}`;
      if (response.status === 400 && data.error_message?.includes('API key')) {
        result.error = 'Invalid FRED API Key.';
      }
      return result;
    }

    const latestObservation = data.observations[0];
    const rateValue = parseFloat(latestObservation.value);

    if (isNaN(rateValue) || latestObservation.value === '.') {
      result.error = `FRED: Valid rate not found for ${seriesId}. Last value: '${latestObservation.value}'.`;
    } else {
      result.rate = rateValue;
      result.lastUpdated = latestObservation.date ? format(new Date(latestObservation.date), 'yyyy-MM-dd') : 'N/A';
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    result.error = `FRED: Network/Client error for ${seriesId} - ${msg.substring(0, 100)}`;
  }

  return result;
}

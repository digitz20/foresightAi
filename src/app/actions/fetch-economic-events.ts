
'use server';

// This file is no longer used as the Tradays Economic Calendar is embedded as a widget.
// It can be safely deleted or kept for reference if direct API access is desired in the future.

export interface EconomicEvent {
  id: string;
  releaseTime: string;
  currency: string;
  countryCode: string;
  title: string;
  impact: 'Low' | 'Medium' | 'High' | 'Holiday';
  actual?: string;
  forecast?: string;
  previous?: string;
  timestamp: number;
}

export async function fetchEconomicEvents(
  // date?: Date // Parameter no longer needed
): Promise<{ events: EconomicEvent[]; error?: string }> {
  console.warn(
    'fetchEconomicEvents server action is deprecated. Tradays calendar is now an embedded widget.'
  );
  return {
    events: [],
    error:
      'This data fetching method is deprecated. The economic calendar is now an embedded widget.',
  };
}

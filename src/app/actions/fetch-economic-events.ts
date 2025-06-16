
'use server';

import { format, formatISO, startOfDay, endOfDay } from 'date-fns';

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

interface TradaysApiEvent {
  title: string;
  country: string; 
  currency: string; 
  period_date: string; 
  timestamp: number; 
  impact_id: number; 
  actual_value: string;
  forecast_value: string;
  previous_value: string;
}


function mapImpact(impactId?: number): EconomicEvent['impact'] {
  if (impactId === undefined) return 'Medium'; 
  switch (impactId) {
    case 0: return 'Holiday';
    case 1: return 'Low';
    case 2: return 'Medium';
    case 3: return 'High';
    default: return 'Medium';
  }
}

export async function fetchEconomicEvents(
  date?: Date 
): Promise<{ events: EconomicEvent[]; error?: string }> {

  const targetDate = date || new Date();
  const dateFrom = formatISO(startOfDay(targetDate), { representation: 'date' });
  const dateTo = formatISO(endOfDay(targetDate), { representation: 'date' });
  
  const countries = 'US,EU,GB,JP,CA,AU,NZ,CH,CN'; 

  const apiUrl = `https://tradays.com/api/v1/calendar?countries=${countries}&date_from=${dateFrom}&date_to=${dateTo}`;
  
  let rawEvents: TradaysApiEvent[] = [];

  try {
    const response = await fetch(apiUrl, { next: { revalidate: 3600 } }); 

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({ message: `HTTP error ${response.status}` }));
      let errorMessage = `API Error ${response.status}: ${errorBody.message || response.statusText}`;
      if (response.status === 401 || response.status === 403) {
        errorMessage = 'Tradays.com: Unauthorized or forbidden access. The endpoint might still require some form of authentication or is not publicly accessible as expected.';
      } else if (response.status === 429) {
        errorMessage = 'Tradays.com API rate limit exceeded.';
      }
      return { events: [], error: `Tradays.com: ${errorMessage}` };
    }

    const data = await response.json();

    if (Array.isArray(data)) {
        rawEvents = data as TradaysApiEvent[];
    } else if (data && Array.isArray(data.events)) { 
        rawEvents = data.events as TradaysApiEvent[];
    } else if (data && data.message && typeof data.message === 'string') { 
        return { events: [], error: `Tradays.com: ${data.message}`};
    } else {
        console.warn("Tradays API returned unexpected data structure:", data);
        return { events: [], error: 'Tradays.com: Unexpected data format received.' };
    }

    if (rawEvents.length === 0) {
        // This is not necessarily an error, could be no events for the day.
    }

    const economicEvents: EconomicEvent[] = rawEvents
      .filter(event => event.timestamp) 
      .map((event, index) => ({
        id: `${event.timestamp}-${event.country}-${event.title.substring(0,10)}-${index}`, 
        releaseTime: format(new Date(event.timestamp * 1000), 'HH:mm'), 
        countryCode: event.country.toUpperCase(),
        currency: event.currency.toUpperCase(),
        title: event.title,
        impact: mapImpact(event.impact_id),
        actual: event.actual_value || 'N/A',
        forecast: event.forecast_value || 'N/A',
        previous: event.previous_value || 'N/A',
        timestamp: event.timestamp,
      }))
      .sort((a, b) => a.timestamp - b.timestamp); 

    return { events: economicEvents };

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { events: [], error: `Tradays.com: Network/Client error - ${msg.substring(0, 150)}` };
  }
}


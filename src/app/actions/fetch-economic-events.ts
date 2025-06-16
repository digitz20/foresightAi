
'use server';

import { format, formatISO, startOfDay, endOfDay } from 'date-fns';

export interface EconomicEvent {
  id: string; // Add an ID if API provides one, or generate one
  releaseTime: string; // Formatted time string, e.g., "13:30 UTC"
  currency: string; // e.g., "USD", "EUR"
  countryCode: string; // e.g., "US", "EU"
  title: string; // Event name
  impact: 'Low' | 'Medium' | 'High' | 'Holiday'; // Mapped from impactId or similar
  actual?: string;
  forecast?: string;
  previous?: string;
  timestamp: number; // Unix timestamp for sorting
}

interface TradaysApiEvent {
  title: string;
  country: string; // Country code like "US", "DE"
  currency: string; // Currency code like "USD", "EUR"
  period_date: string; // e.g., "2024-03-01T00:00:00.000+00:00" - the period the data is for
  timestamp: number; // Unix timestamp of the event's release
  impact_id: number; // 0=Holiday, 1=Low, 2=Medium, 3=High
  actual_value: string;
  forecast_value: string;
  previous_value: string;
  // Potentially other fields like 'indicator_id', 'is_preliminary'
}


function mapImpact(impactId?: number): EconomicEvent['impact'] {
  if (impactId === undefined) return 'Medium'; // Default if not provided
  switch (impactId) {
    case 0: return 'Holiday';
    case 1: return 'Low';
    case 2: return 'Medium';
    case 3: return 'High';
    default: return 'Medium';
  }
}

export async function fetchEconomicEvents(
  apiKey: string,
  date?: Date // Optional date, defaults to today
): Promise<{ events: EconomicEvent[]; error?: string }> {
  if (!apiKey || apiKey === 'YOUR_TRADAYS_API_KEY_HERE') {
    return { events: [], error: 'Tradays.com API key not provided or is a placeholder.' };
  }

  const targetDate = date || new Date();
  const dateFrom = formatISO(startOfDay(targetDate), { representation: 'date' });
  const dateTo = formatISO(endOfDay(targetDate), { representation: 'date' });
  
  // A common list of influential countries/regions. User might want to configure this.
  const countries = 'US,EU,GB,JP,CA,AU,NZ,CH,CN'; 

  const apiUrl = `https://tradays.com/api/v1/calendar?key=${apiKey}&countries=${countries}&date_from=${dateFrom}&date_to=${dateTo}`;
  
  let rawEvents: TradaysApiEvent[] = [];

  try {
    const response = await fetch(apiUrl, { next: { revalidate: 3600 } }); // Revalidate every hour

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({ message: `HTTP error ${response.status}` }));
      let errorMessage = `API Error ${response.status}: ${errorBody.message || response.statusText}`;
      if (response.status === 401 || response.status === 403) {
        errorMessage = 'Invalid or unauthorized Tradays.com API Key.';
      } else if (response.status === 429) {
        errorMessage = 'Tradays.com API rate limit exceeded.';
      }
      return { events: [], error: `Tradays.com: ${errorMessage}` };
    }

    const data = await response.json();

    // The API response structure might be an object with a 'data' or 'events' array,
    // or it might be an array directly. Adjust based on actual API.
    // Assuming 'data' is an array of events directly or data.events.
    // Based on some examples, the events are directly in an array if successful.
    if (Array.isArray(data)) {
        rawEvents = data as TradaysApiEvent[];
    } else if (data && Array.isArray(data.events)) { // Common alternative structure
        rawEvents = data.events as TradaysApiEvent[];
    } else if (data && data.message && typeof data.message === 'string') { // API might return error object
        return { events: [], error: `Tradays.com: ${data.message}`};
    } else {
        console.warn("Tradays API returned unexpected data structure:", data);
        return { events: [], error: 'Tradays.com: Unexpected data format received.' };
    }

    if (rawEvents.length === 0) {
        // This is not necessarily an error, could be no events for the day.
        // return { events: [], error: 'Tradays.com: No economic events found for the selected criteria.' };
    }

    const economicEvents: EconomicEvent[] = rawEvents
      .filter(event => event.timestamp) // Ensure there's a timestamp for release
      .map((event, index) => ({
        id: `${event.timestamp}-${event.country}-${event.title.substring(0,10)}-${index}`, // Create a somewhat unique ID
        releaseTime: format(new Date(event.timestamp * 1000), 'HH:mm'), // Format time in HH:mm
        countryCode: event.country.toUpperCase(),
        currency: event.currency.toUpperCase(),
        title: event.title,
        impact: mapImpact(event.impact_id),
        actual: event.actual_value || 'N/A',
        forecast: event.forecast_value || 'N/A',
        previous: event.previous_value || 'N/A',
        timestamp: event.timestamp,
      }))
      .sort((a, b) => a.timestamp - b.timestamp); // Sort by release time

    return { events: economicEvents };

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { events: [], error: `Tradays.com: Network/Client error - ${msg.substring(0, 150)}` };
  }
}


'use server';

// Define Asset type similar to how it's used in page.tsx for searchKeywords
interface AssetForNews {
  name: string;
  type: 'currency' | 'commodity' | 'crypto';
  searchKeywords: string[];
}

export interface NewsHeadlinesResult {
  headlines?: string[];
  error?: string;
  sourceProvider: 'NewsAPI.org';
}

function constructNewsApiQuery(asset: AssetForNews): string {
  const assetName = asset.name.toLowerCase();
  let queryParts: string[] = [...asset.searchKeywords];


  if (asset.type === 'currency') {
    const pair = asset.name.split('/');
    if (pair.length === 2) {
      queryParts.push(`${pair[0]} AND ${pair[1]}`);
      queryParts.push(`"${asset.name}"`); // Exact match for the pair
    }
    queryParts.push('forex');
    queryParts.push('currency market');
  } else if (asset.type === 'commodity') {
     queryParts.push('commodity market');
     if (assetName.includes('gold')) queryParts.push('XAU');
     if (assetName.includes('silver')) queryParts.push('XAG');
     if (assetName.includes('oil')) queryParts.push('WTI OR Brent');
  } else if (asset.type === 'crypto') {
    queryParts.push('cryptocurrency');
    if (assetName.includes('bitcoin')) queryParts.push('BTC');
  }
  
  // Add general financial terms to broaden the search if needed
  queryParts.push('finance');
  queryParts.push('economic outlook');
  
  // Join keywords with OR, ensure distinct terms, and wrap phrases in quotes if they are multi-word from keywords array
  const processedKeywords = asset.searchKeywords.map(kw => kw.includes(' ') ? `"${kw}"` : kw);
  const baseQuery = processedKeywords.join(' OR ');
  
  // Combine base query with more specific terms based on asset type
  let finalQuery = baseQuery;
  if (asset.type === 'currency' ) {
    finalQuery = `(${baseQuery}) AND (forex OR currency OR "interest rate" OR "central bank")`;
  } else if (asset.type === 'commodity') {
    finalQuery = `(${baseQuery}) AND (commodity OR "supply chain" OR demand)`;
  } else if (asset.type === 'crypto') {
    finalQuery = `(${baseQuery}) AND (crypto OR blockchain OR regulation)`;
  }


  // Limit query length to something reasonable for NewsAPI (e.g. 500 chars)
  return finalQuery.substring(0, 450);
}


export async function fetchNewsHeadlines(
  asset: AssetForNews, // Use the more detailed asset type
  apiKey: string
): Promise<NewsHeadlinesResult> {
  if (!apiKey) {
    return { error: 'NewsAPI.org API key not provided.', sourceProvider: 'NewsAPI.org' };
  }

  const query = constructNewsApiQuery(asset);
  const pageSize = 7; // Fetch a few headlines
  const language = 'en';
  const sortBy = 'relevancy'; // 'publishedAt' or 'relevancy' or 'popularity'

  const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(
    query
  )}&apiKey=${apiKey}&language=${language}&sortBy=${sortBy}&pageSize=${pageSize}`;

  const result: NewsHeadlinesResult = { sourceProvider: 'NewsAPI.org' };

  try {
    const response = await fetch(url, { next: { revalidate: 3600 } }); // Cache for 1 hour

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      let errorMessage = `API Error ${response.status}.`;
      if (errorData && errorData.message) {
        errorMessage = errorData.message;
      }
      if (response.status === 401) errorMessage = 'Invalid NewsAPI.org API Key.';
      if (response.status === 429) errorMessage = 'NewsAPI.org rate limit exceeded.';
      result.error = `NewsAPI.org: ${errorMessage}`;
      return result;
    }

    const data = await response.json();

    if (data.status === 'error') {
      result.error = `NewsAPI.org: ${data.message || 'Unknown API error'}`;
      return result;
    }

    if (!data.articles || data.articles.length === 0) {
      result.error = `NewsAPI.org: No relevant headlines found for "${asset.name}" with query "${query}".`;
      result.headlines = []; // Send empty array rather than undefined
      return result;
    }

    result.headlines = data.articles
        .map((article: any) => article.title)
        .filter((title: string | null): title is string => title !== null && title.trim() !== '');

    if (result.headlines.length === 0) {
         result.error = `NewsAPI.org: No usable headlines found after filtering for "${asset.name}".`;
    }


  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    result.error = `NewsAPI.org: Network/Client error - ${msg.substring(0, 100)}`;
  }
  return result;
}


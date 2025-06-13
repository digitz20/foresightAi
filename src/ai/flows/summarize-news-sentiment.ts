// Summarizes the sentiment of multiple news headlines related to a currency pair.

'use server';

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const SummarizeNewsSentimentInputSchema = z.object({
  currencyPair: z.string().describe('The currency pair to analyze news sentiment for (e.g., EUR/USD).'),
  newsHeadlines: z.array(z.string()).describe('An array of news headlines related to the currency pair.'),
});

export type SummarizeNewsSentimentInput = z.infer<typeof SummarizeNewsSentimentInputSchema>;

const SummarizeNewsSentimentOutputSchema = z.object({
  overallSentiment: z
    .string()
    .describe(
      'A summary of the overall sentiment (positive, negative, neutral, or mixed) derived from the provided news headlines.'
    ),
  summary: z
    .string()
    .describe('A concise summary of the news headlines and their potential impact on the currency pair.'),
});

export type SummarizeNewsSentimentOutput = z.infer<typeof SummarizeNewsSentimentOutputSchema>;

export async function summarizeNewsSentiment(input: SummarizeNewsSentimentInput): Promise<SummarizeNewsSentimentOutput> {
  return summarizeNewsSentimentFlow(input);
}

const summarizeNewsSentimentPrompt = ai.definePrompt({
  name: 'summarizeNewsSentimentPrompt',
  input: {
    schema: SummarizeNewsSentimentInputSchema,
  },
  output: {
    schema: SummarizeNewsSentimentOutputSchema,
  },
  prompt: `You are an AI assistant that analyzes news headlines related to a specific currency pair and summarizes the overall market sentiment.

  Currency Pair: {{{currencyPair}}}
  News Headlines:
  {{#each newsHeadlines}}
  - {{{this}}}
  {{/each}}

  Provide a summary of the overall sentiment (positive, negative, neutral, or mixed) and a concise explanation of the potential impact on the currency pair.
  Be direct and to the point. Limit the summary to two sentences.
  `,
});

const summarizeNewsSentimentFlow = ai.defineFlow(
  {
    name: 'summarizeNewsSentimentFlow',
    inputSchema: SummarizeNewsSentimentInputSchema,
    outputSchema: SummarizeNewsSentimentOutputSchema,
  },
  async input => {
    const {output} = await summarizeNewsSentimentPrompt(input);
    return output!;
  }
);

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
  sentimentScore: z
    .number()
    .describe('A numerical sentiment score from -1.0 (very negative) to 1.0 (very positive) reflecting the intensity of the sentiment. 0.0 is neutral.'),
  error: z.string().optional().describe('An error message if the generation failed.'),
});

export type SummarizeNewsSentimentOutput = z.infer<typeof SummarizeNewsSentimentOutputSchema>;

export async function summarizeNewsSentiment(input: SummarizeNewsSentimentInput): Promise<SummarizeNewsSentimentOutput> {
  return summarizeNewsSentimentFlow(input);
}

const sentimentPrompt = ai.definePrompt({
  name: 'summarizeNewsSentimentPrompt',
  input: {
    schema: SummarizeNewsSentimentInputSchema,
  },
  output: {
    schema: SummarizeNewsSentimentOutputSchema.omit({ error: true }),
  },
  prompt: `You are an AI assistant that analyzes news headlines related to a specific currency pair and summarizes the overall market sentiment.

  Currency Pair: {{{currencyPair}}}
  News Headlines:
  {{#each newsHeadlines}}
  - {{{this}}}
  {{/each}}

  Provide the following in JSON format:
  1.  "overallSentiment": A summary of the overall sentiment (e.g., "Positive", "Negative", "Neutral", "Mixed").
  2.  "summary": A concise explanation of the potential impact on the currency pair (1-2 sentences).
  3.  "sentimentScore": A numerical sentiment score from -1.0 (very negative) to 1.0 (very positive) reflecting the intensity of the sentiment. 0.0 is neutral.

  Be direct and to the point. Limit the summary to two sentences.
  If headlines are very generic or uninformative, sentiment should be "Neutral" and score 0.0.
  Example output:
  {
    "overallSentiment": "Positive",
    "summary": "Recent positive economic data and dovish central bank commentary are likely to support the base currency.",
    "sentimentScore": 0.7
  }
  `,
});

const summarizeNewsSentimentFlow = ai.defineFlow(
  {
    name: 'summarizeNewsSentimentFlow',
    inputSchema: SummarizeNewsSentimentInputSchema,
    outputSchema: SummarizeNewsSentimentOutputSchema,
  },
  async (input): Promise<SummarizeNewsSentimentOutput> => {
    try {
      // Ensure there are some headlines, even if just a default one.
      if (!input.newsHeadlines || input.newsHeadlines.length === 0) {
        input.newsHeadlines = [`General market conditions for ${input.currencyPair}`];
      }
      const {output} = await sentimentPrompt(input);
      if (!output || !output.overallSentiment || !output.summary || output.sentimentScore === undefined) {
        console.error('summarizeNewsSentimentPrompt returned invalid or incomplete output:', output);
        return {
          overallSentiment: 'Neutral',
          summary: 'Sentiment analysis failed due to incomplete data from the model.',
          sentimentScore: 0.0,
          error: 'AI prompt failed to return valid sentiment structure.',
        };
      }
      return {...output, error: undefined};
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      console.error(`Error in summarizeNewsSentimentFlow: ${errorMessage}`);
      let displayError = 'An unexpected error occurred during sentiment analysis.';
       if (errorMessage.includes('429') || errorMessage.toLowerCase().includes('quota') || errorMessage.toLowerCase().includes('rate limit')) {
        displayError = 'AI rate limit exceeded for sentiment analysis. Please try again later.';
      }
      return {
        overallSentiment: 'Unknown',
        summary: `Sentiment analysis failed: ${displayError}`,
        sentimentScore: 0.0,
        error: displayError,
      };
    }
  }
);

// src/ai/flows/generate-trade-recommendation.ts
'use server';

/**
 * @fileOverview Generates a trade recommendation (BUY, SELL, or HOLD) based on market data, sentiment, and indicators.
 *
 * - generateTradeRecommendation - A function that generates a trade recommendation.
 * - GenerateTradeRecommendationInput - The input type for the generateTradeRecommendation function.
 * - GenerateTradeRecommendationOutput - The return type for the generateTradeRecommendation function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const GenerateTradeRecommendationInputSchema = z.object({
  rsi: z.number().describe('Relative Strength Index (RSI) value.'),
  macd: z.number().describe('Moving Average Convergence Divergence (MACD) value.'),
  sentimentScore: z
    .number()
    .describe('Sentiment score derived from news headlines (-1 to 1).'),
  interestRate: z
    .number()
    .describe('The current interest rate for the currency.'),
  price: z.number().describe('Current price of the currency pair.'),
});

export type GenerateTradeRecommendationInput = z.infer<
  typeof GenerateTradeRecommendationInputSchema
>;

const GenerateTradeRecommendationOutputSchema = z.object({
  recommendation: z.enum(['BUY', 'SELL', 'HOLD']).describe('Trade recommendation.'),
  reason: z.string().describe('Reasoning behind the recommendation.'),
  error: z.string().optional().describe('An error message if the generation failed.'),
});

export type GenerateTradeRecommendationOutput = z.infer<
  typeof GenerateTradeRecommendationOutputSchema
>;

export async function generateTradeRecommendation(
  input: GenerateTradeRecommendationInput
): Promise<GenerateTradeRecommendationOutput> {
  return generateTradeRecommendationFlow(input);
}

const recommendationPrompt = ai.definePrompt({
  name: 'generateTradeRecommendationPrompt',
  input: {schema: GenerateTradeRecommendationInputSchema},
  // The prompt's output schema remains focused on what the LLM should ideally produce.
  // The flow will handle adding the error field if necessary.
  output: {schema: GenerateTradeRecommendationOutputSchema.omit({ error: true })},
  prompt: `You are an AI-powered Forex trading assistant. Based on the provided market data, sentiment analysis, and economic indicators, provide a concise trade recommendation (BUY, SELL, or HOLD) and the reasoning behind it.

  Market Data:
  - RSI: {{rsi}}
  - MACD: {{macd}}
  - Sentiment Score: {{sentimentScore}}
  - Interest Rate: {{interestRate}}
  - Price: {{price}}

  Consider the following rules:
  - If RSI is low (oversold, e.g., < 30) AND Sentiment is positive (e.g., > 0.2) AND MACD shows uptrend (positive) AND Interest rates are stable, then BUY.
  - Else if RSI is high (overbought, e.g., > 70) AND Sentiment is negative (e.g., < -0.2) AND MACD is falling (negative) AND Interest rates are unstable, then SELL.
  - Otherwise, HOLD.

  Output should be concise and in the format:
  {
    "recommendation": "BUY"|"SELL"|"HOLD",
    "reason": "Short explanation of the recommendation"
  }
`,
});

const generateTradeRecommendationFlow = ai.defineFlow(
  {
    name: 'generateTradeRecommendationFlow',
    inputSchema: GenerateTradeRecommendationInputSchema,
    outputSchema: GenerateTradeRecommendationOutputSchema, // Flow guarantees this schema, including error field
  },
  async (input): Promise<GenerateTradeRecommendationOutput> => {
    try {
      const {output} = await recommendationPrompt(input);
      if (!output || !output.recommendation || !output.reason) {
         console.error('generateTradeRecommendationPrompt returned invalid or incomplete output.');
         return {
           recommendation: 'HOLD',
           reason: 'AI analysis failed due to incomplete data from the model. Defaulting to HOLD.',
           error: 'AI prompt failed to return valid output structure.',
         };
      }
      return {...output, error: undefined }; // Successfully generated, no error
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      console.error(`Error in generateTradeRecommendationFlow: ${errorMessage}`);
      let displayError = 'An unexpected error occurred during AI analysis.';
      if (errorMessage.includes('429') || errorMessage.toLowerCase().includes('quota') || errorMessage.toLowerCase().includes('rate limit')) {
        displayError = 'AI rate limit exceeded. Please try again in a few moments.';
      }
      return {
        recommendation: 'HOLD', // Default recommendation on error
        reason: `AI analysis failed: ${displayError}. Defaulting to HOLD.`,
        error: displayError,
      };
    }
  }
);

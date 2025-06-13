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
});

export type GenerateTradeRecommendationOutput = z.infer<
  typeof GenerateTradeRecommendationOutputSchema
>;

export async function generateTradeRecommendation(
  input: GenerateTradeRecommendationInput
): Promise<GenerateTradeRecommendationOutput> {
  return generateTradeRecommendationFlow(input);
}

const prompt = ai.definePrompt({
  name: 'generateTradeRecommendationPrompt',
  input: {schema: GenerateTradeRecommendationInputSchema},
  output: {schema: GenerateTradeRecommendationOutputSchema},
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
    outputSchema: GenerateTradeRecommendationOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);

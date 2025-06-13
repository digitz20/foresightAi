
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
  rsi: z.number().describe('Relative Strength Index (RSI) value, typically between 0 and 100.'),
  macd: z.number().describe('Moving Average Convergence Divergence (MACD) value. Positive suggests uptrend, negative suggests downtrend relative to signal line/zero.'),
  sentimentScore: z
    .number()
    .describe('Sentiment score derived from news headlines (e.g., -1 for very negative, 0 for neutral, 1 for very positive).'),
  interestRate: z
    .number()
    .describe('The current benchmark annual interest rate for the primary currency in the pair (e.g., for EUR/USD, the ECB rate for EUR). Presented as a percentage, e.g., 1.5 for 1.5%.'),
  price: z.number().describe('Current market price of the currency pair or asset.'),
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
  output: {schema: GenerateTradeRecommendationOutputSchema.omit({ error: true })},
  prompt: `You are an AI-powered Forex and Assets trading assistant. Based on the provided market data, sentiment analysis, and economic indicators, provide a concise trade recommendation (BUY, SELL, or HOLD) and the reasoning behind it.

  Market Data & Indicators:
  - Current Price: {{price}}
  - RSI (Relative Strength Index): {{rsi}}
  - MACD (Value - indicative of trend strength/direction): {{macd}}
  - News Sentiment Score: {{sentimentScore}} (Range: -1 to 1, positive is good for asset, negative is bad)
  - Benchmark Interest Rate (for primary currency/asset's economy): {{interestRate}}%

  General Trading Principles to Consider:
  - RSI: <30 often indicates oversold (potential BUY), >70 often indicates overbought (potential SELL). Mid-range (30-70) is neutral.
  - MACD: Positive MACD and/or MACD crossing above its signal line (not provided, use MACD value itself as proxy for momentum) can indicate bullish momentum. Negative MACD or crossing below signal can indicate bearish momentum.
  - Sentiment: Positive sentiment generally supports BUY, negative supports SELL.
  - Interest Rates: Higher interest rates (or expectations of hikes) for a currency can make it more attractive (potential BUY), assuming other factors are stable. Lower rates can make it less attractive (potential SELL). For assets like Gold, lower real interest rates can be supportive.

  Simplified Rule-Based Logic (Apply with nuance):
  - Strong BUY conditions: RSI is low (e.g., < 35) AND Sentiment is positive (e.g., > 0.3) AND MACD indicates uptrend (e.g., positive and rising, or just strongly positive) AND Interest rates are favorable or stable.
  - Strong SELL conditions: RSI is high (e.g., > 65) AND Sentiment is negative (e.g., < -0.3) AND MACD indicates downtrend (e.g., negative and falling, or just strongly negative) AND Interest rates are unfavorable or unstable for the asset.
  - Otherwise, if conditions are mixed, unclear, or indicators are neutral, recommend HOLD.

  Your Output (JSON format):
  Provide only a JSON object with "recommendation" and "reason".
  The "reason" should be a brief, clear explanation (1-2 sentences) incorporating the key factors influencing your decision.
  Example:
  {
    "recommendation": "BUY",
    "reason": "RSI is oversold at {{rsi}}, sentiment remains positive, and MACD shows potential for an upward move. Current interest rates are supportive."
  }
`,
});

const generateTradeRecommendationFlow = ai.defineFlow(
  {
    name: 'generateTradeRecommendationFlow',
    inputSchema: GenerateTradeRecommendationInputSchema,
    outputSchema: GenerateTradeRecommendationOutputSchema, 
  },
  async (input): Promise<GenerateTradeRecommendationOutput> => {
    try {
      // Validate inputs to prevent issues with the prompt
      if (input.rsi === undefined || input.macd === undefined || input.sentimentScore === undefined || input.interestRate === undefined || input.price === undefined) {
        console.error('generateTradeRecommendationFlow received incomplete input:', input);
        return {
          recommendation: 'HOLD',
          reason: 'AI analysis could not be performed due to missing market data inputs. Defaulting to HOLD.',
          error: 'Incomplete input data for AI recommendation.',
        };
      }

      const {output} = await recommendationPrompt(input);
      if (!output || !output.recommendation || !output.reason) {
         console.error('generateTradeRecommendationPrompt returned invalid or incomplete output.');
         return {
           recommendation: 'HOLD',
           reason: 'AI analysis failed due to incomplete data from the model. Defaulting to HOLD.',
           error: 'AI prompt failed to return valid output structure.',
         };
      }
      return {...output, error: undefined }; 
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      console.error(`Error in generateTradeRecommendationFlow: ${errorMessage}`);
      let displayError = 'An unexpected error occurred during AI analysis.';
      if (errorMessage.includes('429') || errorMessage.toLowerCase().includes('quota') || errorMessage.toLowerCase().includes('rate limit')) {
        displayError = 'AI rate limit exceeded. Please try again in a few moments.';
      } else if (errorMessage.toLowerCase().includes('api key') || errorMessage.toLowerCase().includes('permission denied')) {
        displayError = 'AI service API key issue or permission denied.';
      }
      return {
        recommendation: 'HOLD', 
        reason: `AI analysis failed: ${displayError}. Defaulting to HOLD.`,
        error: displayError,
      };
    }
  }
);


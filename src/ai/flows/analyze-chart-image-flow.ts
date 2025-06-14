// src/ai/flows/analyze-chart-image-flow.ts
'use server';
/**
 * @fileOverview Analyzes an uploaded trading chart image, optionally incorporating live market data, to provide a trading signal.
 *
 * - analyzeChartImage - A function that analyzes a chart image and live data.
 * - AnalyzeChartImageInput - The input type for the analyzeChartImage function.
 * - AnalyzeChartImageOutput - The return type for the analyzeChartImage function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const AnalyzeChartImageInputSchema = z.object({
  imageDataUri: z
    .string()
    .describe(
      "A base64 encoded data URI of the chart image. Expected format: 'data:<mimetype>;base64,<encoded_data>'."
    ),
  assetName: z.string().optional().describe('The name of the asset depicted in the chart (e.g., EUR/USD, BTC/USD).'),
  timeframe: z.string().optional().describe('The timeframe of the chart (e.g., 1H, 4H, 1D).'),
  price: z.number().optional().describe('Current market price of the asset.'),
  rsi: z.number().optional().describe('Current RSI value of the asset.'),
  macdValue: z.number().optional().describe('Current MACD value of the asset.'),
  sentimentScore: z.number().optional().describe('Current news sentiment score (ranging from -1.0 to +1.0).'),
  interestRate: z.number().optional().describe('Current benchmark interest rate relevant to the asset (e.g., primary currency interest rate).'),
  marketStatus: z.string().optional().describe('Current market status (e.g., "open", "closed").'),
});

export type AnalyzeChartImageInput = z.infer<typeof AnalyzeChartImageInputSchema>;

const AnalyzeChartImageOutputSchema = z.object({
  recommendation: z
    .enum(['BUY', 'SELL', 'HOLD', 'UNCLEAR'])
    .describe('The trading recommendation based on the chart analysis and any provided live data.'),
  reason: z
    .string()
    .describe('Detailed reasoning behind the recommendation, explaining the patterns, indicators, and data points considered from both the image and live inputs.'),
  confidence: z
    .enum(['High', 'Medium', 'Low'])
    .optional()
    .describe('Confidence level in the recommendation.'),
  identifiedPatterns: z
    .array(z.string())
    .optional()
    .describe('List of any specific chart patterns identified (e.g., "Head and Shoulders", "Double Top", "Triangle").'),
  keyLevels: z
    .object({
      support: z.array(z.string()).optional().describe('Identified support levels.'),
      resistance: z.array(z.string()).optional().describe('Identified resistance levels.'),
    })
    .optional()
    .describe('Key support and resistance levels identified from the chart.'),
  error: z.string().optional().describe('An error message if the analysis failed.'),
});

export type AnalyzeChartImageOutput = z.infer<typeof AnalyzeChartImageOutputSchema>;

export async function analyzeChartImage(
  input: AnalyzeChartImageInput
): Promise<AnalyzeChartImageOutput> {
  return analyzeChartImageFlow(input);
}

const chartAnalysisPrompt = ai.definePrompt({
  name: 'analyzeChartImagePrompt',
  input: {schema: AnalyzeChartImageInputSchema},
  output: {schema: AnalyzeChartImageOutputSchema.omit({ error: true })},
  prompt: `You are an expert AI technical chart analyst. Analyze the provided trading chart image.
If available, also consider the supplementary live market data provided to refine your analysis.
Your primary analysis should be from the visual chart. Use live data to confirm, adjust, or highlight current conditions relative to what's seen on the chart.

Image to Analyze:
{{media url=imageDataUri}}

Asset Context (if provided):
- Asset Name: {{#if assetName}}{{assetName}}{{else}}Not specified{{/if}}
- Timeframe: {{#if timeframe}}{{timeframe}}{{else}}Not specified{{/if}}

Supplementary Live Market Data (if provided, use to contextualize chart analysis):
{{#if price}}- Current Price: {{price}}{{/if}}
{{#if rsi}}- Current RSI: {{rsi}}{{/if}}
{{#if macdValue}}- Current MACD Value: {{macdValue}}{{/if}}
{{#if sentimentScore}}- Current News Sentiment Score: {{sentimentScore}} (from -1 very negative to +1 very positive){{/if}}
{{#if interestRate}}- Current Benchmark Interest Rate: {{interestRate}}%{{/if}}
{{#if marketStatus}}- Current Market Status: {{marketStatus}}{{/if}}

Analysis Task:
1.  **Visual Chart Analysis**:
    *   Identify key chart patterns (e.g., head and shoulders, triangles, flags, channels, double tops/bottoms).
    *   Identify major support and resistance levels.
    *   Assess the state of any visible indicators (e.g., Moving Averages, RSI, MACD, Bollinger Bands). Note their readings or signals if discernible.
    *   Determine the overall price action, trend (uptrend, downtrend, sideways), and momentum.
2.  **Integration with Live Data (if provided)**:
    *   How does the current price relate to key levels identified on the chart?
    *   Does the live RSI/MACD confirm or contradict what's suggested by patterns or indicator drawings on the chart?
    *   Does the news sentiment align with the technical outlook?
    *   Does the interest rate environment favor the potential move?
    *   If the market status is 'closed', note that the analysis is based on the chart's state and recent live data, but immediate action may not be possible.
3.  **Synthesize and Recommend**:
    *   Based on both visual chart analysis and any supplementary live data, provide a trading recommendation: BUY, SELL, HOLD, or UNCLEAR.
    *   State your confidence level: High, Medium, or Low.
    *   Provide a detailed reasoning (2-4 sentences) explaining the key factors from both the chart and live data that led to your recommendation. Explicitly mention how live data influenced your decision if it was provided and relevant.
    *   List any specific chart patterns identified.
    *   List key support and resistance levels.

Output ONLY a JSON object with the following structure: "recommendation", "reason", "confidence", "identifiedPatterns", "keyLevels" (with "support" and "resistance" arrays).
If the image is not a trading chart or is unanalyzable, set recommendation to "UNCLEAR" and explain why in the reason.
Example reasoning if live data is used: "The chart shows a clear bullish flag pattern breaking upwards, with price above a key resistance level now acting as support. This is further supported by the live RSI ({{rsi}}) being in neutral territory but rising, and a positive news sentiment score ({{sentimentScore}}), suggesting continued upward momentum."
Example reasoning if only chart is used or live data is not significant: "The chart displays a head and shoulders top pattern with the neckline recently broken. Visible MACD on the chart (if any) appears to be crossing bearishly. This suggests a potential downward move."
`,
});


const analyzeChartImageFlow = ai.defineFlow(
  {
    name: 'analyzeChartImageFlow',
    inputSchema: AnalyzeChartImageInputSchema,
    outputSchema: AnalyzeChartImageOutputSchema,
  },
  async (input): Promise<AnalyzeChartImageOutput> => {
    if (!input.imageDataUri || !input.imageDataUri.startsWith('data:image')) {
      return {
        recommendation: 'UNCLEAR',
        reason: 'Invalid or missing image data. Please upload a valid chart image.',
        error: 'Invalid image data URI.',
      };
    }

    try {
      const {output} = await chartAnalysisPrompt(input);
      if (!output) {
        throw new Error('AI model returned no output.');
      }
      return {...output, error: undefined};
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      console.error(`Error in analyzeChartImageFlow: ${errorMessage}`);
      let displayError = 'An unexpected error occurred during AI chart analysis.';
      if (errorMessage.includes('429') || errorMessage.toLowerCase().includes('quota') || errorMessage.toLowerCase().includes('rate limit')) {
        displayError = 'AI rate limit exceeded for chart analysis. Please try again later.';
      } else if (errorMessage.toLowerCase().includes('api key') || errorMessage.toLowerCase().includes('permission denied')) {
        displayError = 'AI service API key issue or permission denied for chart analysis.';
      } else if (errorMessage.toLowerCase().includes('billing') || errorMessage.toLowerCase().includes('account')) {
        displayError = 'AI service billing or account issue for chart analysis.';
      }
      return {
        recommendation: 'UNCLEAR',
        reason: `AI chart analysis failed: ${displayError}.`,
        error: displayError,
      };
    }
  }
);

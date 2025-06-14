
// src/components/dashboard/ChartAnalyzerCard.tsx
'use client';

import { useState, useRef, ChangeEvent } from 'react';
import { UploadCloud, Bot, AlertTriangle, Loader2, Sparkles, BarChart, FileImage, ShieldAlert, XCircle } from 'lucide-react';
import DashboardCard from './DashboardCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import Image from 'next/image';

// Types for the AI flow (should match analyze-chart-image-flow.ts)
import type { AnalyzeChartImageInput, AnalyzeChartImageOutput } from '@/ai/flows/analyze-chart-image-flow.ts'; 

// Type for the Asset, matching what's in page.tsx
interface Asset {
  name: string;
  type: 'currency' | 'commodity' | 'crypto';
  // other fields if needed by this card, but generally assetName is enough for the flow
}
// Type for the Timeframe, matching what's in page.tsx
interface Timeframe {
    id: string;
    name: string;
}

export interface LiveDataForChartAnalysis {
    price?: number;
    rsi?: number;
    macdValue?: number;
    sentimentScore?: number;
    interestRate?: number;
    marketStatus?: MarketStatus;
}
type MarketStatus = 'open' | 'closed' | 'extended-hours' | 'pre-market' | 'post-market' | 'unknown';


type ChartAnalyzerCardProps = {
  selectedAsset: Asset;
  selectedTimeframe: Timeframe;
  liveData?: LiveDataForChartAnalysis;
  onAnalyzeChart: (input: AnalyzeChartImageInput) => Promise<AnalyzeChartImageOutput>;
};

export default function ChartAnalyzerCard({ selectedAsset, selectedTimeframe, liveData, onAnalyzeChart }: ChartAnalyzerCardProps) {
  const [imageDataUri, setImageDataUri] = useState<string | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState<AnalyzeChartImageOutput | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.size > 4 * 1024 * 1024) { // 4MB limit
        setError('File size exceeds 4MB. Please upload a smaller image.');
        toast({
            variant: "destructive",
            title: "Upload Error",
            description: "File size exceeds 4MB.",
        });
        return;
      }
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
        setError('Invalid file type. Please upload a JPG, PNG, or WEBP image.');
        toast({
            variant: "destructive",
            title: "Upload Error",
            description: "Invalid file type. Only JPG, PNG, WEBP allowed.",
        });
        return;
      }

      const reader = new FileReader();
      reader.onloadend = () => {
        setImageDataUri(reader.result as string);
        setImagePreviewUrl(URL.createObjectURL(file));
        setError(null);
        setAnalysisResult(null); // Clear previous results
      };
      reader.onerror = () => {
        setError('Failed to read file.');
        toast({
            variant: "destructive",
            title: "Upload Error",
            description: "Could not read the selected file.",
        });
      }
      reader.readAsDataURL(file);
    }
  };

  const handleAnalyzeChart = async () => {
    if (!imageDataUri) {
      setError('Please upload a chart image first.');
      return;
    }
    setIsLoading(true);
    setError(null);
    setAnalysisResult(null);

    try {
      const input: AnalyzeChartImageInput = {
        imageDataUri,
        assetName: selectedAsset.name,
        timeframe: selectedTimeframe.name,
        ...(liveData?.price !== undefined && { price: liveData.price }),
        ...(liveData?.rsi !== undefined && { rsi: liveData.rsi }),
        ...(liveData?.macdValue !== undefined && { macdValue: liveData.macdValue }),
        ...(liveData?.sentimentScore !== undefined && { sentimentScore: liveData.sentimentScore }),
        ...(liveData?.interestRate !== undefined && { interestRate: liveData.interestRate }),
        ...(liveData?.marketStatus && { marketStatus: liveData.marketStatus }),
      };
      const result = await onAnalyzeChart(input);
      setAnalysisResult(result);
      if (result.error) {
        setError(result.error);
        toast({
            variant: "destructive",
            title: "AI Analysis Error",
            description: result.error,
        });
      } else {
        toast({
            title: "Analysis Complete",
            description: `AI recommends: ${result.recommendation}`,
        });
      }
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      setError(`Analysis failed: ${errorMessage}`);
      toast({
        variant: "destructive",
        title: "Analysis Failed",
        description: errorMessage,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleClear = () => {
    setImageDataUri(null);
    if (imagePreviewUrl) {
      URL.revokeObjectURL(imagePreviewUrl);
    }
    setImagePreviewUrl(null);
    setAnalysisResult(null);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = ''; // Reset file input
    }
    toast({
        title: "Chart Analyzer Cleared",
        description: "Ready for a new chart image.",
    });
  };
  
  const getSignalBadgeClasses = (recommendation?: 'BUY' | 'SELL' | 'HOLD' | 'UNCLEAR') => {
    switch (recommendation) {
      case 'BUY':
        return 'bg-accent/20 border-accent text-accent-foreground';
      case 'SELL':
        return 'bg-destructive/20 border-destructive text-destructive-foreground';
      case 'HOLD':
        return 'bg-muted/30 border-muted text-muted-foreground';
      case 'UNCLEAR':
      default:
        return 'border-dashed text-muted-foreground';
    }
  };


  return (
    <DashboardCard title="AI Chart Analyzer (Visual + Live Data)" icon={FileImage} className="lg:col-span-2">
      <div className="space-y-4">
        <p className="text-xs text-muted-foreground">
            Upload a trading chart image. The AI will analyze its visual patterns and integrate current live market data for {selectedAsset.name} ({selectedTimeframe.name}) to provide a signal.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 items-center">
            <Button onClick={() => fileInputRef.current?.click()} variant="outline" className="w-full sm:w-auto" disabled={isLoading}>
                <UploadCloud className="mr-2 h-4 w-4" />
                Upload Chart Image
            </Button>
            <Input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                disabled={isLoading}
            />
            {imagePreviewUrl && (
                <>
                    <Button onClick={handleAnalyzeChart} disabled={isLoading || !imageDataUri} className="w-full sm:w-auto">
                        {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                        Analyze Chart
                    </Button>
                    <Button onClick={handleClear} variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive w-full sm:w-auto sm:ml-auto" disabled={isLoading} aria-label="Clear chart and analysis">
                        <XCircle className="h-5 w-5"/>
                    </Button>
                </>
            )}
        </div>

        {error && !analysisResult?.error && ( // Display general errors if not part of analysis result
          <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-md text-sm text-destructive flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {imagePreviewUrl && (
          <div className="mt-4 p-2 border border-border rounded-md bg-card/50">
            <Image
              src={imagePreviewUrl}
              alt="Chart preview"
              width={600}
              height={400}
              className="rounded-md w-full max-w-xl mx-auto h-auto object-contain"
              data-ai-hint="chart financial graph"
            />
          </div>
        )}

        {isLoading && (
          <div className="flex items-center justify-center p-6 text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin mr-3" />
            <p>AI is analyzing the chart with live data...</p>
          </div>
        )}

        {analysisResult && (
          <div className="mt-6 p-4 border border-primary/20 rounded-lg bg-card/80 shadow-md space-y-4">
            <div className="flex items-center gap-3 mb-3">
              <Bot className="h-7 w-7 text-primary" />
              <h3 className="text-xl font-semibold text-primary">AI Analysis Result:</h3>
            </div>

            {analysisResult.error && (
                 <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-md text-sm text-destructive flex items-start gap-2">
                    <ShieldAlert className="h-5 w-5 mt-0.5 shrink-0" />
                    <div>
                        <p className="font-medium">Analysis Error:</p>
                        <p>{analysisResult.reason || analysisResult.error}</p>
                    </div>
                </div>
            )}

            {!analysisResult.error && (
                <>
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                        <p className="text-lg font-medium">Recommendation:</p>
                        <Badge className={cn("text-xl px-4 py-1.5", getSignalBadgeClasses(analysisResult.recommendation))}>
                            {analysisResult.recommendation}
                        </Badge>
                    </div>

                    {analysisResult.confidence && (
                        <div className="flex items-center gap-2">
                            <p className="text-sm text-muted-foreground">Confidence:</p>
                            <Badge variant={
                                analysisResult.confidence === 'High' ? 'default' :
                                analysisResult.confidence === 'Medium' ? 'secondary' : 'outline'
                            } className={cn(
                                analysisResult.confidence === 'High' && 'bg-accent/80 text-accent-foreground border-accent',
                            )}>
                                {analysisResult.confidence}
                            </Badge>
                        </div>
                    )}
                </>
            )}

            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-1">Reasoning:</h4>
              <p className="text-sm bg-muted/30 p-3 rounded-md leading-relaxed">{analysisResult.reason}</p>
            </div>

            {analysisResult.identifiedPatterns && analysisResult.identifiedPatterns.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-muted-foreground mb-1">Identified Patterns:</h4>
                <div className="flex flex-wrap gap-2">
                  {analysisResult.identifiedPatterns.map((pattern, index) => (
                    <Badge key={index} variant="outline" className="text-xs">{pattern}</Badge>
                  ))}
                </div>
              </div>
            )}

            {analysisResult.keyLevels && (analysisResult.keyLevels.support?.length || analysisResult.keyLevels.resistance?.length) && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {analysisResult.keyLevels.support && analysisResult.keyLevels.support.length > 0 && (
                  <div>
                    <h5 className="text-xs font-medium text-muted-foreground mb-1">Support Levels:</h5>
                    <ul className="list-disc list-inside pl-1 space-y-0.5">
                      {analysisResult.keyLevels.support.map((level, index) => (
                        <li key={`sup-${index}`} className="text-xs text-foreground">{level}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {analysisResult.keyLevels.resistance && analysisResult.keyLevels.resistance.length > 0 && (
                  <div>
                    <h5 className="text-xs font-medium text-muted-foreground mb-1">Resistance Levels:</h5>
                    <ul className="list-disc list-inside pl-1 space-y-0.5">
                      {analysisResult.keyLevels.resistance.map((level, index) => (
                        <li key={`res-${index}`} className="text-xs text-foreground">{level}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </DashboardCard>
  );
}

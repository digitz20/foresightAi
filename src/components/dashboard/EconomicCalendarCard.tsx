
'use client';

import { CalendarClock, AlertTriangle, ChevronUp, ChevronDown, ChevronRight, InfoIcon } from 'lucide-react';
import DashboardCard from './DashboardCard';
import type { EconomicEvent } from '@/app/actions/fetch-economic-events';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type EconomicCalendarCardProps = {
  events: EconomicEvent[];
  isLoading: boolean;
  error?: string;
};

const ImpactIcon = ({ impact }: { impact: EconomicEvent['impact'] }) => {
  switch (impact) {
    case 'High':
      return <ChevronUp className="h-4 w-4 text-destructive animate-pulse" />;
    case 'Medium':
      return <ChevronRight className="h-4 w-4 text-yellow-500" />;
    case 'Low':
      return <ChevronDown className="h-4 w-4 text-green-500" />;
    case 'Holiday':
      return <CalendarClock className="h-4 w-4 text-muted-foreground" />; // Or a different icon for Holiday
    default:
      return null;
  }
};

const getImpactBadgeVariant = (impact: EconomicEvent['impact']): "default" | "destructive" | "secondary" | "outline" => {
    switch (impact) {
        case 'High': return 'destructive';
        case 'Medium': return 'default'; // Using primary for medium
        case 'Low': return 'secondary';
        case 'Holiday': return 'outline';
        default: return 'outline';
    }
};


export default function EconomicCalendarCard({ events, isLoading, error }: EconomicCalendarCardProps) {
  
  if (isLoading) {
    return (
      <DashboardCard title="Today's Economic Calendar" icon={CalendarClock}>
        <div className="flex items-center justify-center h-40">
          <p className="text-muted-foreground">Loading economic events...</p>
        </div>
      </DashboardCard>
    );
  }

  if (error) {
    return (
      <DashboardCard title="Today's Economic Calendar" icon={CalendarClock}>
        <div className="flex flex-col items-center justify-center text-destructive p-4 gap-2 h-40">
          <AlertTriangle className="h-8 w-8" />
          <p className="font-semibold text-center">Calendar Error</p>
          <p className="text-sm text-center">{error}</p>
        </div>
      </DashboardCard>
    );
  }
  
  if (!events || events.length === 0) {
    return (
      <DashboardCard title="Today's Economic Calendar" icon={CalendarClock}>
        <div className="flex flex-col items-center justify-center text-muted-foreground p-4 gap-2 h-40">
            <InfoIcon className="h-8 w-8" />
            <p className="text-sm text-center">No major economic events scheduled for today from monitored countries, or data is currently unavailable.</p>
        </div>
      </DashboardCard>
    );
  }


  return (
    <DashboardCard title="Today's Economic Calendar" icon={CalendarClock} className="lg:col-span-3" contentClassName="max-h-[400px] overflow-y-auto">
      <ScrollArea className="h-[350px]">
        <Table>
          <TableHeader className="sticky top-0 bg-card z-10">
            <TableRow>
              <TableHead className="w-[80px]">Time (UTC)</TableHead>
              <TableHead className="w-[60px]">Currency</TableHead>
              <TableHead className="w-[100px]">Impact</TableHead>
              <TableHead>Event</TableHead>
              <TableHead className="text-right w-[90px]">Actual</TableHead>
              <TableHead className="text-right w-[90px]">Forecast</TableHead>
              <TableHead className="text-right w-[90px]">Previous</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {events.map((event) => (
              <TableRow key={event.id} className="text-xs hover:bg-muted/20">
                <TableCell className="font-medium">{event.releaseTime}</TableCell>
                <TableCell>{event.currency}</TableCell>
                <TableCell>
                    <Badge variant={getImpactBadgeVariant(event.impact)} className="flex items-center gap-1 w-full justify-center text-xxs sm:text-xs px-1.5 sm:px-2 py-0.5">
                        <ImpactIcon impact={event.impact} /> 
                        {event.impact}
                    </Badge>
                </TableCell>
                <TableCell className="truncate max-w-[200px] sm:max-w-xs md:max-w-sm lg:max-w-md" title={event.title}>{event.title}</TableCell>
                <TableCell className={cn("text-right", parseFloat(event.actual || '') > parseFloat(event.forecast || '') ? 'text-accent' : parseFloat(event.actual || '') < parseFloat(event.forecast || '') ? 'text-destructive' : 'text-foreground')}>
                    {event.actual}
                </TableCell>
                <TableCell className="text-right">{event.forecast}</TableCell>
                <TableCell className="text-right text-muted-foreground">{event.previous}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </ScrollArea>
       <p className="text-xs text-muted-foreground text-center pt-2">Data from Tradays.com for major economies.</p>
    </DashboardCard>
  );
}

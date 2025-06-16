
'use client';

import { useEffect, useRef } from 'react';
import { CalendarClock, AlertTriangle } from 'lucide-react';
import DashboardCard from './DashboardCard';

export default function EconomicCalendarCard() {
  const scriptContainerRef = useRef<HTMLDivElement>(null);
  const widgetLoadedRef = useRef(false);

  useEffect(() => {
    if (widgetLoadedRef.current || !scriptContainerRef.current) {
      return;
    }

    // Ensure the container div exists
    let widgetDiv = document.getElementById('economicCalendarWidget');
    if (!widgetDiv) {
      widgetDiv = document.createElement('div');
      widgetDiv.id = 'economicCalendarWidget';
      // Set initial styles for the container if needed, the widget might override them.
      // widgetDiv.style.width = "100%";
      // widgetDiv.style.height = "400px"; // Adjust height as needed
      scriptContainerRef.current.appendChild(widgetDiv);
    }
    
    const script = document.createElement('script');
    script.async = true;
    script.type = 'text/javascript';
    script.setAttribute('data-type', 'calendar-widget');
    script.src = 'https://www.tradays.com/c/js/widgets/calendar/widget.js?v=13';
    
    // Configuration for the widget
    const config = {
      width: '100%',
      height: '450px', // You might want to adjust this height
      mode: '2', // 1 for "Important events", 2 for "All events"
      // You can add more configuration options here as per Tradays documentation
      // Example: "importance": "3" for only high impact events
      // "lang": "en"
    };
    script.innerHTML = JSON.stringify(config);

    scriptContainerRef.current.appendChild(script);
    widgetLoadedRef.current = true;

    return () => {
      // Clean up the script and widget div if the component unmounts
      // This is important to prevent issues if the component re-renders often
      if (scriptContainerRef.current) {
        // scriptContainerRef.current.innerHTML = ''; // Clear the container
      }
      // It's tricky to fully "remove" a widget that manipulates the DOM externally.
      // Setting widgetLoadedRef to false might help if re-initialization is needed on remount.
      // widgetLoadedRef.current = false; 
    };
  }, []);

  return (
    <DashboardCard 
      title="Today's Economic Calendar" 
      icon={CalendarClock} 
      className="lg:col-span-3"
      contentClassName="p-0" // Remove padding from card content if widget handles it
    >
      {/* Container for the script and the widget's div */}
      <div ref={scriptContainerRef}>
         {/* The widget script will create and populate this div, or you can create it here directly. */}
         {/* If the script expects the div to exist, create it: */}
         {/* <div id="economicCalendarWidget" style={{width: "100%", height: "450px"}}></div> */}
      </div>
      <p className="text-xs text-muted-foreground text-center p-2 border-t border-border">
        Economic calendar widget powered by Tradays.com.
      </p>
    </DashboardCard>
  );
}

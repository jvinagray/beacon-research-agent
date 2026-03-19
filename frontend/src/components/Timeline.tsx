import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import type { TimelineEvent } from "@/types/research";

interface TimelineProps {
  events: TimelineEvent[];
}

const significanceStyles = {
  high: "shadow-[0_0_12px_hsl(var(--primary)/0.15)]",
  medium: "",
  low: "opacity-75",
};

const badgeStyles = {
  high: "bg-primary shadow-[0_0_8px_hsl(var(--primary))]",
  medium: "bg-muted",
  low: "bg-muted/50",
};

const Timeline = ({ events }: TimelineProps) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const items = containerRef.current.querySelectorAll("[data-timeline-card]");
    if (items.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const el = entry.target as HTMLElement;
            el.style.opacity = "1";
            el.style.transform = "translateY(0)";
            observer.unobserve(el);
          }
        });
      },
      { threshold: 0.1 }
    );

    items.forEach((item) => observer.observe(item));

    return () => observer.disconnect();
  }, [events]);

  if (events.length === 0) return null;

  return (
    <div ref={containerRef} className="relative py-8" role="list" aria-label="Timeline of events">
      {/* Vertical center line */}
      <div className="absolute left-4 md:left-1/2 md:-translate-x-1/2 top-0 bottom-0 w-0.5 bg-glass-border" />

      <div className="space-y-8">
        {events.map((event, index) => {
          const isLeft = index % 2 === 0;

          return (
            <div
              key={`${event.date}-${index}`}
              data-testid="timeline-event"
              role="listitem"
              className="relative"
            >
              {/* Date badge on the line */}
              <div
                className={cn(
                  "absolute left-4 md:left-1/2 -translate-x-1/2 z-10",
                  "px-3 py-1 rounded-full text-xs font-medium text-white",
                  badgeStyles[event.significance]
                )}
              >
                {event.date}
              </div>

              {/* Event card */}
              <div
                data-timeline-card
                className={cn(
                  "pl-12 md:pl-0 pt-8",
                  isLeft ? "md:pr-[52%]" : "md:pl-[52%]"
                )}
                style={{
                  opacity: 0,
                  transform: "translateY(1.25rem)",
                  transition: "opacity 0.5s ease, transform 0.5s ease",
                  transitionDelay: `${index * 100}ms`,
                }}
              >
                <div
                  className={cn(
                    "glass rounded-xl p-4 border border-glass-border",
                    significanceStyles[event.significance]
                  )}
                >
                  <h3 className="font-bold text-foreground">{event.title}</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    {event.description}
                  </p>
                  <span className="inline-block mt-2 px-2 py-0.5 rounded text-xs bg-muted/30 text-muted-foreground">
                    {event.source_title}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default Timeline;

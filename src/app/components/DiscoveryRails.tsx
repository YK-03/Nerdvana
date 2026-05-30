import React from "react";
import { DiscoveryRail, DiscoveryItem } from "../../lib/experience/discoveryEngine";
import { motion } from "motion/react";

interface DiscoveryRailsProps {
  rails: DiscoveryRail[];
  onSelect: (query: string, lens?: string) => void;
}

export function DiscoveryRails({ rails, onSelect }: DiscoveryRailsProps) {
  const safeRails = rails ?? [];
  if (safeRails.length === 0) return null;

  return (
    <div className="w-full flex flex-col gap-10 mt-12 mb-8 border-t border-nerdvana-border/30 pt-10">
      {safeRails.map((rail, railIndex) => (
        <motion.div 
          key={rail.id}
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: railIndex * 0.15 + 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="flex flex-col gap-5"
        >
          {/* Header */}
          <div className="flex flex-col gap-1">
            <h3 className="font-sora text-nerdvana-text text-lg font-medium tracking-tight">
              {rail.label}
            </h3>
            {rail.editorial && (
              <p className="font-times text-nerdvana-text/70 italic text-base">
                {rail.editorial}
              </p>
            )}
          </div>

          {/* Cards Grid / Flex wrap */}
          <div className="flex flex-wrap gap-4">
            {rail.items.map((item: DiscoveryItem, itemIndex) => (
              <button
                key={`${item.title}-${itemIndex}`}
                onClick={() => onSelect(item.query, item.mediaLens)}
                className="group relative flex flex-col items-start text-left px-5 py-4 bg-nerdvana-surface border border-nerdvana-border/40 hover:border-nerdvana-accent/60 transition-all duration-300 overflow-hidden w-full sm:w-[280px]"
              >
                {/* Subtle hover accent line */}
                <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-nerdvana-accent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                
                <span className="font-sora font-medium text-nerdvana-text text-[15px] leading-snug group-hover:text-nerdvana-accent transition-colors duration-200">
                  {item.title}
                </span>
                
                {item.subtitle && (
                  <span className="font-courier text-xs tracking-wider text-nerdvana-text/50 uppercase mt-2">
                    {item.subtitle}
                  </span>
                )}
              </button>
            ))}
          </div>
        </motion.div>
      ))}
    </div>
  );
}

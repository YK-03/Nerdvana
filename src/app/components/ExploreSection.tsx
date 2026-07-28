import React from "react";

interface ExploreSectionProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}

export default function ExploreSection({
  title,
  description,
  action,
  children
}: ExploreSectionProps) {
  return (
    <div className="mt-14 mb-8">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-5 pb-3 border-b border-[rgba(255,255,255,0.08)] gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-[0.75rem] uppercase tracking-[0.16em] font-semibold text-[var(--nerdvana-text)] opacity-80 font-mono">
              {title}
            </h3>
          </div>
          {description && (
            <p className="mt-2 text-[0.8rem] text-gray-400 font-sans leading-relaxed">
              {description}
            </p>
          )}
        </div>
        {action && (
          <div className="flex-shrink-0">
            {action}
          </div>
        )}
      </div>
      
      <div className="relative">
        {children}
      </div>
    </div>
  );
}

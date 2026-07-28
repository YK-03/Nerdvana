import React from "react";

interface ResultLayoutProps {
  main: React.ReactNode;
  sidebar?: React.ReactNode;
}

export default function ResultLayout({ main, sidebar }: ResultLayoutProps) {
  return (
    <div className="flex flex-col-reverse lg:flex-row gap-8 items-start relative w-full">
      {/* Main Content Area */}
      <div className="flex-1 min-w-0 w-full">
        {main}
      </div>

      {/* Sidebar (Visual Panel / Recommendations) */}
      {sidebar && (
        <div className="w-full max-w-md mx-auto lg:mx-0 lg:w-72 flex-shrink-0 sticky top-24">
          {sidebar}
        </div>
      )}

      {/* Future AI Panel Placeholder (Docked Right Sidebar) */}
      {/* Currently empty, reserved for future docked AI assistant feature to avoid layout thrashing */}
      <div id="ai-panel-placeholder" className="hidden" />
    </div>
  );
}

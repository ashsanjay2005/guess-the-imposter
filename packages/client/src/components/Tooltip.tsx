import React from 'react';

export const Tooltip: React.FC<{ text: string }> = ({ text }) => {
  return (
    <span className="relative inline-flex items-center group select-none">
      <span className="ml-1 inline-flex items-center justify-center w-5 h-5 rounded-full bg-slate-700 text-slate-300 text-xs cursor-help">?</span>
      <div className="hidden group-hover:block absolute z-50 bottom-full right-0 mb-2 w-64 p-2 rounded-xl bg-slate-800 border border-slate-600 text-[12px] text-slate-200 shadow-soft">
        {text}
      </div>
    </span>
  );
};



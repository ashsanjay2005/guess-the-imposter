import React from 'react';
import { Toasts } from './components/Toasts';

export const AppLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <>
      {children}
      <Toasts />
      {/* Sticky mobile action bar placeholder (buttons rendered in pages as needed) */}
      <div className="fixed bottom-0 left-0 right-0 md:hidden p-3 pointer-events-none">
        <div id="mobile-actions" className="pointer-events-auto flex justify-center gap-2"></div>
      </div>
    </>
  );
};



import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

export const MobileActions: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const container = document.getElementById('mobile-actions');
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!container) return;
    // Mark that mobile actions are visible; expose height for scroll-margin adjustments
    document.body.classList.add('has-mobile-actions');
    const update = () => {
      const h = wrapperRef.current?.offsetHeight ?? 80;
      document.documentElement.style.setProperty('--mobile-actions-h', `${h}px`);
    };
    update();
    const ro = new ResizeObserver(update);
    if (wrapperRef.current) ro.observe(wrapperRef.current);
    return () => {
      ro.disconnect();
      document.body.classList.remove('has-mobile-actions');
      document.documentElement.style.removeProperty('--mobile-actions-h');
    };
  }, [container]);
  if (!container) return null;
  return createPortal(
    <div ref={wrapperRef} className="w-full">
      {children}
    </div>,
    container,
  );
};



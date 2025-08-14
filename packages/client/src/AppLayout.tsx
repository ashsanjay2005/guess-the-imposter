import React from 'react';
import { Toasts } from './components/Toasts';
import { useMafiaSocket } from './pages/mafia/MafiaSocketProvider';

export const AppLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Keep the bottom actions above the iOS keyboard and home indicator
  React.useEffect(() => {
    const wrapper = document.getElementById('mobile-actions')?.parentElement as HTMLElement | null;
    const container = document.getElementById('mobile-actions') as HTMLElement | null;
    if (!wrapper || !container) return;

    const setCssVars = () => {
      const h = container.childElementCount ? container.getBoundingClientRect().height : 0;
      document.documentElement.style.setProperty('--mobile-actions-h', `${Math.ceil(h + 12)}px`); // include spacing
    };

    // Track height changes of actions (shows/hides per phase)
    const ro = new ResizeObserver(() => setCssVars());
    ro.observe(container);

    // iOS keyboard handling: move wrapper above keyboard
    const onViewportChange = () => {
      const vv = (window as any).visualViewport as VisualViewport | undefined;
      if (!vv) return setCssVars();
      const bottomInset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      wrapper.style.bottom = `${bottomInset}px`;
      setCssVars();
    };
    if ('visualViewport' in window) {
      const vv = (window as any).visualViewport as VisualViewport;
      vv.addEventListener('resize', onViewportChange);
      vv.addEventListener('scroll', onViewportChange);
      onViewportChange();
    } else {
      setCssVars();
    }

    return () => {
      ro.disconnect();
      if ('visualViewport' in window) {
        const vv = (window as any).visualViewport as VisualViewport;
        vv.removeEventListener('resize', onViewportChange);
        vv.removeEventListener('scroll', onViewportChange);
      }
    };
  }, []);
  return (
    <>
      {/* Page components render their own back buttons contextually */}
      {children}
      {/* Prefer Mafia toasts if Mafia provider is active, else Guess Who toasts */}
      {(() => {
        try { const { toasts } = useMafiaSocket(); return <div className="fixed left-1/2 -translate-x-1/2 z-50 top-3 md:bottom-4 md:top-auto">{toasts.slice(-1).map((t) => (<div key={t.id} className={`px-5 py-3 rounded-2xl border shadow-soft transition-all duration-200 anim-fade-in ${t.type === 'error' ? 'bg-red-600/90 border-red-500 text-white' : t.type === 'success' ? 'bg-emerald-600/90 border-emerald-500 text-white' : 'bg-slate-800/90 border-slate-700 text-slate-100'}`}>{t.message}</div>))}</div>; } catch { return <Toasts />; }
      })()}
      {/* Sticky mobile action bar placeholder (buttons rendered in pages as needed) */}
      <div className="fixed bottom-0 left-0 right-0 md:hidden p-3 mobile-safe pointer-events-none z-40">
        <div id="mobile-actions" className="pointer-events-auto flex justify-center gap-2 w-full">
          {/* children are portaled here */}
        </div>
      </div>
    </>
  );
};



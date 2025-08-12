import React from 'react';

type Props = { open: boolean; onClose: () => void; manualModeNote?: boolean };

export const HowToModal: React.FC<Props> = ({ open, onClose, manualModeNote }) => {
  const [step, setStep] = React.useState(0);
  const dialogRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') setStep((s) => Math.min(s + 1, slides.length - 1));
      if (e.key === 'ArrowLeft') setStep((s) => Math.max(s - 1, 0));
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, [open, onClose]);

  const slides = React.useMemo(() => {
    const base = [
      { title: 'Goal', body: 'Find the Imposter. The majority sees the same question; the Imposter sees a related one.' },
      { title: 'Flow', body: 'Answer → Reveal Answers (+ Majority Question) → Discuss → Vote → Results.' },
      { title: 'Scoring', body: 'Majority win: each non‑imposter +1. Imposter win: the imposter +3.' },
      { title: 'Host tools', body: 'Start/Next round, Manual Mode, Lock Seats, Timers, Question Bank (Save/Load/Import/Export).' },
      { title: 'Tips & Shortcuts', body: '1–8 to vote, Enter submits, R toggles ready. Chat & reactions during Discuss/Vote.' },
    ];
    if (manualModeNote) {
      base[1].body += ' In Manual Mode, the host advances from Reveal Answers and Discuss; Answering/Voting end when all respond.';
    }
    return base;
  }, [manualModeNote]);

  if (!open) return null;

  return (
    <div aria-modal role="dialog" className="fixed inset-0 z-50 grid place-items-center bg-black/60">
      <div ref={dialogRef} tabIndex={-1} className="card p-6 max-w-xl w-[92%] outline-none">
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs text-slate-400">{step + 1}/{slides.length}</div>
          <button className="secondary" onClick={onClose}>Close</button>
        </div>
        <h3 className="text-xl font-bold mb-2">{slides[step].title}</h3>
        <p className="text-slate-200 mb-4">{slides[step].body}</p>
        <div className="flex items-center justify-between">
          <button className="secondary" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>Back</button>
          <div className="flex gap-2">
            <button className="secondary" onClick={() => { localStorage.setItem('howto_seen', '1'); onClose(); }}>Skip</button>
            <button className="primary" onClick={() => {
              if (step < slides.length - 1) setStep((s) => s + 1);
              else { localStorage.setItem('howto_seen', '1'); onClose(); }
            }}>{step < slides.length - 1 ? 'Next' : 'Done'}</button>
          </div>
        </div>
      </div>
    </div>
  );
};



import React, { useState } from 'react';

export const AnswerPanel: React.FC<{ question?: string; onSubmit: (text: string) => void }>= ({ question, onSubmit }) => {
  const [text, setText] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const isEmpty = text.trim().length === 0;
  // Enter to submit
  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && !isEmpty && !submitted) {
      onSubmit(text);
      setSubmitted(true);
    }
  }
  return (
    <div className="card p-4 space-y-3 anim-fade-in">
      <div className="text-slate-300 text-sm">Your question</div>
      <div className="text-xl font-semibold">{question ?? 'Waiting...'}</div>
      <input
        className={`text ${isEmpty ? 'ring-1 ring-red-500/50 focus:ring-red-500/70' : ''}`}
        placeholder="Type your answer…"
        value={text}
        aria-invalid={isEmpty}
        required
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={(e) => { setTimeout(() => e.currentTarget.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100); }}
      />
      {isEmpty && (
        <div className="text-xs text-red-400">Enter an answer to submit.</div>
      )}
      {/* Desktop inline actions */}
      <div className="hidden md:flex items-center gap-3">
        <button
          className="primary active:scale-[.98] disabled:opacity-60 disabled:cursor-not-allowed"
          onClick={() => { onSubmit(text); setSubmitted(true); }}
          disabled={isEmpty || submitted}
          title={isEmpty ? 'Answer cannot be empty' : undefined}
        >
          {submitted ? 'Submitted' : 'Submit Answer'}
        </button>
        {submitted && <span className="text-sm text-emerald-400">✓ Received</span>}
      </div>
      {/* Mobile full-width action (no floating bar to avoid overlay issues) */}
      <div className="md:hidden pt-1">
        <button
          className="primary w-full rounded-2xl py-3 text-base shadow-soft disabled:opacity-60 disabled:cursor-not-allowed"
          onClick={() => { onSubmit(text); setSubmitted(true); if (navigator.vibrate) navigator.vibrate(20); }}
          disabled={isEmpty || submitted}
          title={isEmpty ? 'Answer cannot be empty' : undefined}
        >
          {submitted ? 'Submitted' : 'Submit'}
        </button>
      </div>
    </div>
  );
};



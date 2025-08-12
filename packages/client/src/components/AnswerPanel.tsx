import React, { useState } from 'react';

export const AnswerPanel: React.FC<{ question?: string; onSubmit: (text: string) => void }>= ({ question, onSubmit }) => {
  const [text, setText] = useState('');
  const [submitted, setSubmitted] = useState(false);
  // Enter to submit
  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && text.trim() && !submitted) {
      onSubmit(text);
      setSubmitted(true);
    }
  }
  return (
    <div className="card p-4 space-y-3 anim-fade-in">
      <div className="text-slate-300 text-sm">Your question</div>
      <div className="text-xl font-semibold">{question ?? 'Waiting...'}</div>
      <input className="text" placeholder="Type your answer…" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={handleKeyDown} onFocus={(e) => { setTimeout(() => e.currentTarget.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100); }} />
      <div className="flex items-center gap-3">
        <button className="primary active:scale-[.98]" onClick={() => { onSubmit(text); setSubmitted(true); }} disabled={!text.trim() || submitted}>{submitted ? 'Submitted' : 'Submit Answer'}</button>
        {submitted && <span className="text-sm text-emerald-400">✓ Received</span>}
      </div>
    </div>
  );
};



import React, { useState } from 'react';

export const AnswerPanel: React.FC<{ question?: string; onSubmit: (text: string) => void }>= ({ question, onSubmit }) => {
  const [text, setText] = useState('');
  const [submitted, setSubmitted] = useState(false);
  return (
    <div className="card p-4 space-y-3">
      <div className="text-slate-300 text-sm">Your question</div>
      <div className="text-xl font-semibold">{question ?? 'Waiting...'}</div>
      <input className="text" placeholder="Type your answer…" value={text} onChange={(e) => setText(e.target.value)} />
      <div className="flex items-center gap-3">
        <button className="primary" onClick={() => { onSubmit(text); setSubmitted(true); }} disabled={!text.trim() || submitted}>{submitted ? 'Submitted' : 'Submit Answer'}</button>
        {submitted && <span className="text-sm text-emerald-400">✓ Received</span>}
      </div>
    </div>
  );
};



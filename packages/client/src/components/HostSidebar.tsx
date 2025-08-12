import React, { useMemo, useState } from 'react';
import type { QuestionPair, Room } from '../lib/types';
import { useSocket } from '../socket/SocketProvider';

export const HostSidebar: React.FC<{ room: Room }> = ({ room }) => {
  const { updateSettings, upsertQuestionPair, deleteQuestionPair } = useSocket();
  const [pair, setPair] = useState<QuestionPair>({ id: '', majorityQuestion: '', imposterQuestion: '' });

  function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const data = JSON.parse(String(reader.result));
        if (Array.isArray(data)) {
          for (const p of data) await upsertQuestionPair(p);
        }
      } catch {}
    };
    reader.readAsText(file);
  }

  function handleExport() {
    const blob = new Blob([JSON.stringify(room.questionBank, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'questionBank.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="card p-4 space-y-4">
      <h3 className="font-semibold">Host Controls</h3>
      <div className="grid grid-cols-2 gap-3">
        <label className="label">Answer (s)</label>
        <input className="text" type="number" value={room.settings.answerSeconds} onChange={(e) => updateSettings({ answerSeconds: Number(e.target.value) })} />
        <label className="label">Discuss (s)</label>
        <input className="text" type="number" value={room.settings.discussSeconds} onChange={(e) => updateSettings({ discussSeconds: Number(e.target.value) })} />
        <label className="label">Voting (s)</label>
        <input className="text" type="number" value={room.settings.votingSeconds} onChange={(e) => updateSettings({ votingSeconds: Number(e.target.value) })} />
        <label className="label">Names with answers</label>
        <input type="checkbox" className="mt-2" checked={room.settings.showNamesWithAnswers} onChange={(e) => updateSettings({ showNamesWithAnswers: e.target.checked })} />
        <label className="label">Randomize answers</label>
        <input type="checkbox" className="mt-2" checked={room.settings.randomizeAnswerOrder} onChange={(e) => updateSettings({ randomizeAnswerOrder: e.target.checked })} />
      </div>

      <div className="space-y-2">
        <h4 className="font-medium">Question Bank</h4>
        <div className="grid gap-2">
          <input className="text" placeholder="id (unique)" value={pair.id} onChange={(e) => setPair({ ...pair, id: e.target.value })} />
          <input className="text" placeholder="Majority question" value={pair.majorityQuestion} onChange={(e) => setPair({ ...pair, majorityQuestion: e.target.value })} />
          <input className="text" placeholder="Imposter question" value={pair.imposterQuestion} onChange={(e) => setPair({ ...pair, imposterQuestion: e.target.value })} />
          <button className="primary" onClick={async () => { await upsertQuestionPair(pair); setPair({ id: '', majorityQuestion: '', imposterQuestion: '' }); }}>Add / Update</button>
        </div>
        <div className="flex gap-2 items-center">
          <input type="file" accept="application/json" onChange={handleImport} />
          <button className="secondary" onClick={handleExport}>Export JSON</button>
        </div>
        <div className="max-h-48 overflow-auto text-sm divide-y divide-slate-700">
          {room.questionBank.map((q) => (
            <div key={q.id} className="py-2 flex items-start gap-2">
              <div className="flex-1">
                <div className="font-medium">{q.id}</div>
                <div className="text-slate-300">M: {q.majorityQuestion}</div>
                <div className="text-slate-400">I: {q.imposterQuestion}</div>
              </div>
              <button className="secondary" onClick={() => deleteQuestionPair(q.id)}>Delete</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};



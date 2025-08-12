import React, { useEffect, useRef, useState } from 'react';
import { useSocket } from '../socket/SocketProvider';

export const ChatPanel: React.FC = () => {
  const { room, sendChat, sendReaction } = useSocket();
  const [text, setText] = useState('');
  const endRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [room?.chat?.length]);
  return (
    <div className="card p-4 space-y-3">
      <div className="text-slate-300 text-sm">Chat</div>
      <div className="max-h-48 overflow-auto space-y-2">
        {room?.chat?.slice(-100).map((m) => (
          <div key={m.id} className="text-sm"><span className="text-slate-400 mr-1">{m.name}:</span>{m.type === 'reaction' ? <span className="text-xl">{m.text}</span> : m.text}</div>
        ))}
        <div ref={endRef} />
      </div>
      <div className="flex items-center gap-2">
        <input className="text flex-1" placeholder="Say something…" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { sendChat(text); setText(''); } }} />
        <button className="secondary" onClick={() => { sendChat(text); setText(''); }}>Send</button>
      </div>
      <div className="flex gap-2">
        {['👍','😂','🤔','👏','🔥','❓'].map((e) => (
          <button key={e} className="secondary" onClick={() => sendReaction(e)}>{e}</button>
        ))}
      </div>
    </div>
  );
};



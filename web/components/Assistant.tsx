'use client';

import { useState } from 'react';
import { apiFetch } from '@/lib/api';

export default function Assistant() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [log, setLog] = useState<{ role: 'me' | 'assistant'; text: string }[]>([]);
  const [busy, setBusy] = useState(false);

  async function send() {
    if (!message.trim() || busy) return;
    const text = message.trim();
    setLog((items) => [...items, { role: 'me', text }]);
    setMessage('');
    setBusy(true);
    try {
      const { reply } = await apiFetch<{ reply: string }>('/api/assistant', {
        method: 'POST',
        body: JSON.stringify({ message: text })
      });
      setLog((items) => [...items, { role: 'assistant', text: reply }]);
    } catch {
      setLog((items) => [...items, { role: 'assistant', text: 'Sorry, something went wrong.' }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside className="assistant">
      {open ? (
        <div className="assistant-panel">
          <header>
            <strong>Assistant</strong>
            <button type="button" onClick={() => setOpen(false)}>Close</button>
          </header>
          <div className="assistant-log">
            {log.length === 0 && <p className="muted">Ask about sessions, bookings or credits.</p>}
            {log.map((item, index) => (
              <p key={index} className={item.role === 'me' ? 'bubble mine' : 'bubble'}>{item.text}</p>
            ))}
            {busy && <p className="muted">Thinking...</p>}
          </div>
          <div className="assistant-form">
            <input
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') send();
              }}
              placeholder="Ask Atrium"
            />
            <button type="button" onClick={send}>Send</button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setOpen(true)}>Ask</button>
      )}
    </aside>
  );
}

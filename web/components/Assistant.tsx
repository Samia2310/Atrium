'use client';

import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api';

export default function Assistant() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [log, setLog] = useState<{ role: 'me' | 'assistant'; text: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' });
  }, [log, busy]);

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
    } catch (err) {
      const detail = err instanceof Error ? err.message : '';
      setLog((items) => [
        ...items,
        {
          role: 'assistant',
          text: detail
            ? `I could not reach the Atrium API. ${detail}`
            : 'I could not reach the Atrium API. Please check that the API server is running.'
        }
      ]);
    } finally {
      setBusy(false);
    }
  }

  function askSuggestion(text: string) {
    if (busy) return;
    setMessage(text);
  }

  return (
    <aside className="assistant">
      {open ? (
        <div className="assistant-panel" role="dialog" aria-label="Atrium assistant">
          <header>
            <div>
              <strong>Assistant</strong>
              <span>Ask about sessions, credits and bookings.</span>
            </div>
            <button type="button" className="button ghost" onClick={() => setOpen(false)}>Close</button>
          </header>
          <div className="assistant-log" ref={logRef}>
            {log.length === 0 && (
              <div className="assistant-empty">
                <strong>How can I help?</strong>
                <p className="muted">Try one of these or type your own question.</p>
                <div className="assistant-suggestions">
                  <button type="button" onClick={() => askSuggestion('Show me fitness sessions')}>Fitness sessions</button>
                  <button type="button" onClick={() => askSuggestion('What is my credit balance?')}>Credit balance</button>
                  <button type="button" onClick={() => askSuggestion('What are my bookings?')}>My bookings</button>
                </div>
              </div>
            )}
            {log.map((item, index) => (
              <p key={index} className={item.role === 'me' ? 'bubble mine' : 'bubble'}>
                {item.text}
              </p>
            ))}
            {busy && <p className="bubble thinking">Thinking...</p>}
          </div>
          <form
            className="assistant-form"
            onSubmit={(event) => {
              event.preventDefault();
              send();
            }}
          >
            <input
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Ask Atrium"
              disabled={busy}
            />
            <button type="submit" disabled={busy}>{busy ? 'Sending' : 'Send'}</button>
          </form>
        </div>
      ) : (
        <button type="button" className="assistant-launcher" onClick={() => setOpen(true)}>
          Ask Atrium
        </button>
      )}
    </aside>
  );
}

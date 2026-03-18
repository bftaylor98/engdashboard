import { useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';

type SSEEvent =
  | 'work-order:created'
  | 'work-order:updated'
  | 'work-order:deleted'
  | 'import:completed'
  | 'version:restored'
  | 'connected';

/**
 * Hook that opens an EventSource to /api/events and calls `onEvent`
 * whenever the server pushes a relevant SSE event.
 *
 * The connection auto-reconnects with a 3 s back-off.
 * It tears down cleanly when the component unmounts or the token changes.
 */
export function useSSE(onEvent: (eventName: SSEEvent, data: any) => void) {
  const { token } = useAuth();
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  const connect = useCallback(() => {
    if (!token) return null;

    const url = `/api/events?token=${encodeURIComponent(token)}`;
    const es = new EventSource(url);

    const EVENTS: SSEEvent[] = [
      'work-order:created',
      'work-order:updated',
      'work-order:deleted',
      'import:completed',
      'version:restored',
      'connected',
    ];

    for (const evt of EVENTS) {
      es.addEventListener(evt, (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data);
          onEventRef.current(evt, data);
        } catch {
          // ignore parse errors
        }
      });
    }

    return es;
  }, [token]);

  useEffect(() => {
    let es = connect();
    let retryTimeout: ReturnType<typeof setTimeout>;

    if (es) {
      es.onerror = () => {
        es?.close();
        // Reconnect after 3 seconds
        retryTimeout = setTimeout(() => {
          es = connect();
          if (es) {
            es.onerror = () => {
              es?.close();
            };
          }
        }, 3000);
      };
    }

    return () => {
      clearTimeout(retryTimeout);
      es?.close();
    };
  }, [connect]);
}




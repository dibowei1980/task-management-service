import { useEffect, useRef, useCallback } from 'react';
import { TASK_SERVICE_URL } from '../utils/constants';

interface SseTaskChangeEvent {
  event: string;
  action: string;
  taskId: string;
  timestamp: number;
}

export function useSseNotification(onTaskChange: (e: SseTaskChangeEvent) => void) {
  const callbackRef = useRef(onTaskChange);
  callbackRef.current = onTaskChange;
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortedRef = useRef(false);

  const connect = useCallback(() => {
    abortedRef.current = false;
    const token = localStorage.getItem('token');
    const sessionId = localStorage.getItem('session_id');

    const params = new URLSearchParams();
    if (token) {
      params.set('token', token);
    }
    if (sessionId) {
      params.set('sessionId', sessionId);
    }

    const qs = params.toString();
    const url = `${TASK_SERVICE_URL}/api/sse/subscribe${qs ? '?' + qs : ''}`;

    console.log('[SSE] Connecting to', url.replace(/token=[^&]+/, 'token=***'));
    const source = new EventSource(url);

    source.addEventListener('connected', () => {
      console.log('[SSE] Connected');
    });

    source.addEventListener('heartbeat', () => {
      // heartbeat received, connection alive
    });

    source.addEventListener('task-change', (evt: MessageEvent) => {
      try {
        const data: SseTaskChangeEvent = JSON.parse(evt.data);
        console.log('[SSE] Task change:', data.action, data.taskId);
        callbackRef.current(data);
      } catch {
        // ignore parse errors
      }
    });

    source.onerror = () => {
      console.warn('[SSE] Connection error, reconnecting in 5s...');
      source.close();
      if (!abortedRef.current) {
        reconnectTimerRef.current = setTimeout(connect, 5000);
      }
    };

    return source;
  }, []);

  useEffect(() => {
    const source = connect();

    return () => {
      abortedRef.current = true;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      source.close();
    };
  }, [connect]);
}

import { useEffect, useState } from 'react';
import { CheckCircle2, X, AlertCircle, Info } from 'lucide-react';

export type ToastKind = 'success' | 'error' | 'info';

export interface ToastMessage {
  id: number;
  kind: ToastKind;
  text: string;
}

interface ToastProps {
  message: ToastMessage;
  onClose: (id: number) => void;
}

function ToastItem({ message, onClose }: ToastProps) {
  useEffect(() => {
    const t = setTimeout(() => onClose(message.id), 4000);
    return () => clearTimeout(t);
  }, [message.id, onClose]);

  const palette =
    message.kind === 'success'
      ? 'bg-green-50 border-green-200 text-green-800'
      : message.kind === 'error'
        ? 'bg-red-50 border-red-200 text-red-800'
        : 'bg-blue-50 border-blue-200 text-blue-800';

  const Icon =
    message.kind === 'success' ? CheckCircle2 : message.kind === 'error' ? AlertCircle : Info;

  return (
    <div
      role="status"
      className={`flex items-start gap-2 px-4 py-3 rounded-xl border shadow-md min-w-[260px] max-w-[400px] ${palette}`}
    >
      <Icon className="w-5 h-5 flex-shrink-0 mt-0.5" />
      <span className="flex-1 text-sm font-medium">{message.text}</span>
      <button
        onClick={() => onClose(message.id)}
        className="text-current opacity-60 hover:opacity-100"
        aria-label="Закрыть уведомление"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

export function ToastStack({
  messages,
  onClose,
}: {
  messages: ToastMessage[];
  onClose: (id: number) => void;
}) {
  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2">
      {messages.map((m) => (
        <ToastItem key={m.id} message={m} onClose={onClose} />
      ))}
    </div>
  );
}

/** Hook for managing a toast stack within a page. */
export function useToasts() {
  const [messages, setMessages] = useState<ToastMessage[]>([]);

  const push = (text: string, kind: ToastKind = 'success') => {
    setMessages((cur) => [...cur, { id: Date.now() + Math.random(), kind, text }]);
  };

  const close = (id: number) => {
    setMessages((cur) => cur.filter((m) => m.id !== id));
  };

  return { messages, push, close };
}

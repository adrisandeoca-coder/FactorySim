import { useAppStore } from '../../stores/appStore';
import { Check, X, AlertTriangle, Info } from 'lucide-react';

export function ToastContainer() {
  const { toasts, removeToast } = useAppStore();

  return (
    <div className="fixed bottom-4 right-4 z-50 space-y-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`toast toast-${toast.type} flex items-center space-x-3 animate-slide-in`}
        >
          <ToastIcon type={toast.type} />
          <span>{toast.message}</span>
          <button
            onClick={() => removeToast(toast.id)}
            className="ml-2 hover:opacity-80"
          >
            <X className="w-4 h-4" strokeWidth={1.75} />
          </button>
        </div>
      ))}
    </div>
  );
}

function ToastIcon({ type }: { type: string }) {
  const sw = 1.75;
  switch (type) {
    case 'success':
      return <Check className="w-5 h-5" strokeWidth={sw} />;
    case 'error':
      return <X className="w-5 h-5" strokeWidth={sw} />;
    case 'warning':
      return <AlertTriangle className="w-5 h-5" strokeWidth={sw} />;
    default:
      return <Info className="w-5 h-5" strokeWidth={sw} />;
  }
}

import React, { useEffect } from 'react';
import { CheckCircle, XCircle, AlertTriangle, Info } from 'lucide-react';

const icons = {
  success: <CheckCircle className="text-green-500 w-5 h-5" />,
  error: <XCircle className="text-red-500 w-5 h-5" />,
  warning: <AlertTriangle className="text-yellow-500 w-5 h-5" />,
  info: <Info className="text-blue-500 w-5 h-5" />,
};

const Toast = ({ message, type = 'info', onClose, duration = 4000 }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, duration);
    return () => clearTimeout(timer);
  }, [onClose, duration]);

  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg text-sm animate-slideUp 
      bg-white dark:bg-gray-900 border-l-4 ${
        type === 'success'
          ? 'border-green-500'
          : type === 'error'
          ? 'border-red-500'
          : type === 'warning'
          ? 'border-yellow-500'
          : 'border-blue-500'
      }`}
    >
      {icons[type]}
      <span className="text-gray-700 dark:text-gray-200">{message}</span>
    </div>
  );
};

export default Toast;

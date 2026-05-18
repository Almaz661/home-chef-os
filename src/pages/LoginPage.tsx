import { useState } from 'react';
import { ChefHat } from 'lucide-react';
import { trpc } from '../utils/trpc';

interface LoginPageProps {
  onLogin: (userId: number, name: string) => void;
}

export default function LoginPage({ onLogin }: LoginPageProps) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const loginMutation = trpc.auth.login.useMutation({
    onSuccess: (data) => {
      onLogin(data.userId, data.name);
    },
    onError: (err) => {
      setError('Неверный PIN-код');
      setPin('');
      setIsLoading(false);
    },
  });

  const handlePinInput = (digit: string) => {
    if (pin.length >= 4) return;
    const newPin = pin + digit;
    setPin(newPin);
    setError('');
    
    if (newPin.length === 4) {
      setIsLoading(true);
      loginMutation.mutate({ pin: newPin });
    }
  };

  const handleBackspace = () => {
    setPin(pin.slice(0, -1));
    setError('');
  };

  return (
    <div className="min-h-screen bg-[var(--color-kitchen-bg)] flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-primary-100 rounded-full mb-4">
            <ChefHat className="w-10 h-10 text-primary-600" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900">ШефДом</h1>
          <p className="text-gray-500 mt-2">Управление домашней кухней</p>
        </div>

        {/* PIN dots */}
        <div className="flex justify-center gap-4 mb-6">
          {[0, 1, 2, 3].map(i => (
            <div
              key={i}
              className={`w-4 h-4 rounded-full transition-all ${
                i < pin.length 
                  ? 'bg-primary-600 scale-110' 
                  : 'bg-gray-300'
              }`}
            />
          ))}
        </div>

        {/* Error */}
        {error && (
          <p className="text-center text-red-500 text-sm mb-4">{error}</p>
        )}

        {/* PIN pad */}
        <div className="grid grid-cols-3 gap-3 max-w-[280px] mx-auto">
          {['1','2','3','4','5','6','7','8','9','','0','⌫'].map((key, idx) => {
            if (key === '') return <div key={idx} />;
            if (key === '⌫') {
              return (
                <button
                  key={idx}
                  onClick={handleBackspace}
                  className="h-16 rounded-xl bg-gray-100 text-gray-700 text-xl font-medium hover:bg-gray-200 active:bg-gray-300 transition-colors flex items-center justify-center"
                >
                  ⌫
                </button>
              );
            }
            return (
              <button
                key={idx}
                onClick={() => handlePinInput(key)}
                disabled={isLoading}
                className="h-16 rounded-xl bg-white border border-gray-200 text-gray-900 text-2xl font-medium hover:bg-primary-50 active:bg-primary-100 transition-colors shadow-sm disabled:opacity-50"
              >
                {key}
              </button>
            );
          })}
        </div>

        <p className="text-center text-gray-400 text-xs mt-8">
          PIN по умолчанию: 1234
        </p>
      </div>
    </div>
  );
}

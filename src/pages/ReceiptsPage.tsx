import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Camera, FileText, ArrowRight, Trash2, Image as ImageIcon, Loader2 } from 'lucide-react';
import { trpc } from '../utils/trpc';
import { ToastStack, useToasts } from '../components/Toast';

/** Read a File into a base64 string (without the data: prefix). */
function fileToBase64(file: File): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const [header, base64] = dataUrl.split(',');
      const mime = header.match(/data:([^;]+);/)?.[1] ?? file.type ?? 'image/jpeg';
      resolve({ base64, mimeType: mime });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function ReceiptsPage() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const toasts = useToasts();

  const list = trpc.receipts.list.useQuery();
  const capabilities = trpc.receipts.capabilities.useQuery();
  const fxQuery = trpc.currency.getRate.useQuery({ base: 'EUR', quote: 'RUB' });

  const scanMutation = trpc.receipts.scan.useMutation({
    onSuccess: (data) => {
      list.refetch();
      if (!data.ocrAvailable) {
        toasts.push(data.warning || 'OCR не настроен — введите позиции вручную', 'info');
      } else if (data.itemsCount === 0) {
        toasts.push('Чек загружен, но позиции не распознаны — отредактируйте вручную', 'info');
      } else {
        toasts.push(`Распознано ${data.itemsCount} позиций`, 'success');
      }
      navigate(`/receipts/${data.receiptId}`);
    },
    onError: (err) => {
      toasts.push(err.message || 'Ошибка обработки чека', 'error');
    },
    onSettled: () => setUploading(false),
  });

  const deleteMutation = trpc.receipts.delete.useMutation({
    onSuccess: () => list.refetch(),
  });

  const handleFile = async (file: File | null | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      const { base64, mimeType } = await fileToBase64(file);
      scanMutation.mutate({ imageBase64: base64, mimeType });
    } catch (err) {
      console.error(err);
      toasts.push('Не удалось прочитать файл', 'error');
      setUploading(false);
    }
  };

  return (
    <div>
      <ToastStack messages={toasts.messages} onClose={toasts.close} />

      <div className="flex items-center justify-between mb-6 gap-2">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Чеки</h1>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-2 px-4 py-2.5 bg-primary-600 rounded-xl text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50 transition-colors"
        >
          {uploading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Camera className="w-4 h-4" />
          )}
          <span>{uploading ? 'Обработка...' : 'Сканировать чек'}</span>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
      </div>

      {/* Capability banner */}
      {capabilities.data && !capabilities.data.ocr && (
        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
          <strong>OCR не настроен.</strong> Сканирование чека создаст пустую запись —
          позиции нужно будет ввести вручную. Чтобы включить автоматическое распознавание,
          добавьте <code>OCR_SPACE_API_KEY</code> в переменные окружения.
        </div>
      )}
      {capabilities.data?.ocr && !capabilities.data.translation && (
        <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-xl text-sm text-blue-800">
          <strong>Переводчик не настроен.</strong> Названия будут на голландском —
          переведите вручную при необходимости. Чтобы включить автоперевод,
          добавьте <code>DEEPL_API_KEY</code>.
        </div>
      )}

      {/* FX banner */}
      {fxQuery.data && (
        <div className="mb-6 p-3 bg-white border border-gray-100 rounded-xl text-sm text-gray-600 flex items-center justify-between">
          <span>
            Курс: 1 EUR = <strong className="text-gray-900">{fxQuery.data.rate.toFixed(2)} RUB</strong>
          </span>
          <span className="text-xs text-gray-400">
            обновлено {new Date(fxQuery.data.fetchedAt + (fxQuery.data.fetchedAt.endsWith('Z') ? '' : 'Z')).toLocaleString('ru-RU')}
          </span>
        </div>
      )}

      {/* Receipts list */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        {list.data && list.data.length > 0 ? (
          <div className="divide-y divide-gray-50">
            {list.data.map((r) => (
              <div
                key={r.id}
                className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors"
              >
                <Link to={`/receipts/${r.id}`} className="flex-1 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center">
                    <FileText className="w-5 h-5 text-primary-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-900 truncate">
                      {r.storeName || 'Без названия магазина'}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5">
                      {r.date && <span>{r.date}</span>}
                      {r.totalAmount != null && (
                        <span>
                          {r.totalAmount.toFixed(2)} {r.currency || 'EUR'}
                          {fxQuery.data && r.currency === 'EUR' && (
                            <span className="text-gray-400">
                              {' '}≈ {(r.totalAmount * fxQuery.data.rate).toFixed(0)} ₽
                            </span>
                          )}
                        </span>
                      )}
                      <StatusBadge status={r.status} />
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-gray-300" />
                </Link>
                <button
                  onClick={() => {
                    if (confirm('Удалить чек?')) deleteMutation.mutate({ id: r.id });
                  }}
                  className="p-2 text-gray-300 hover:text-red-500"
                  aria-label="Удалить"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12 px-4">
            <ImageIcon className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">Чеков пока нет</p>
            <p className="text-gray-400 text-sm mt-1">
              Сфотографируйте чек, чтобы добавить покупки в инвентарь
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string | null }) {
  if (!status || status === 'parsed') {
    return (
      <span className="px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded text-[10px] uppercase">
        новый
      </span>
    );
  }
  if (status === 'imported') {
    return (
      <span className="px-1.5 py-0.5 bg-green-50 text-green-700 rounded text-[10px] uppercase">
        в инвентаре
      </span>
    );
  }
  if (status === 'pending') {
    return (
      <span className="px-1.5 py-0.5 bg-amber-50 text-amber-700 rounded text-[10px] uppercase">
        требует ввода
      </span>
    );
  }
  return (
    <span className="px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded text-[10px] uppercase">
      {status}
    </span>
  );
}

import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Trash2, Package, Save } from 'lucide-react';
import { trpc } from '../utils/trpc';
import { ToastStack, useToasts } from '../components/Toast';

const STORAGES = [
  { id: 'fridge', label: 'Холодильник' },
  { id: 'freezer', label: 'Морозилка' },
  { id: 'pantry', label: 'Кладовая' },
] as const;

export default function ReceiptDetailPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const receiptId = Number(id);
  const toasts = useToasts();
  const [storage, setStorage] = useState<'fridge' | 'freezer' | 'pantry'>('pantry');

  const receipt = trpc.receipts.getById.useQuery({ id: receiptId });
  const fx = trpc.currency.getRate.useQuery({ base: 'EUR', quote: 'RUB' });

  const updateItem = trpc.receipts.updateItem.useMutation({
    onSuccess: () => receipt.refetch(),
  });
  const deleteItem = trpc.receipts.deleteItem.useMutation({
    onSuccess: () => receipt.refetch(),
  });
  const importToInventory = trpc.receipts.importToInventory.useMutation({
    onSuccess: (data) => {
      toasts.push(
        data.added === 0
          ? 'Все позиции уже добавлены в инвентарь'
          : `В инвентарь добавлено ${data.added} позиций`,
        data.added === 0 ? 'info' : 'success',
      );
      receipt.refetch();
    },
    onError: (err) => {
      toasts.push(err.message || 'Ошибка при добавлении в инвентарь', 'error');
    },
  });

  if (receipt.isLoading) {
    return <div className="text-center py-12 text-gray-500">Загрузка...</div>;
  }
  if (!receipt.data) {
    return <div className="text-center py-12 text-gray-500">Чек не найден</div>;
  }

  const r = receipt.data;
  const totalEur = r.totalAmount ?? 0;
  const totalRub = fx.data ? totalEur * fx.data.rate : null;

  return (
    <div>
      <ToastStack messages={toasts.messages} onClose={toasts.close} />

      <div className="flex items-center justify-between mb-6 gap-2">
        <Link
          to="/receipts"
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft className="w-5 h-5" />
          <span>Назад к чекам</span>
        </Link>
      </div>

      {/* Header card */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4 md:p-6 mb-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-gray-900">
              {r.storeName || 'Без названия'}
            </h1>
            {r.date && <p className="text-sm text-gray-500 mt-1">{r.date}</p>}
          </div>
          <div className="text-right">
            <div className="text-xl font-bold text-gray-900">
              {totalEur.toFixed(2)} EUR
            </div>
            {totalRub != null && (
              <div className="text-sm text-gray-500">≈ {totalRub.toFixed(0)} ₽</div>
            )}
          </div>
        </div>
      </div>

      {/* Items table */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden mb-4">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">
            Позиции ({r.items.length})
          </h2>
        </div>

        {r.items.length === 0 ? (
          <div className="p-6 text-center text-sm text-gray-500">
            Позиции не распознаны.
            {/* Inline manual-add form would go here in a future iteration */}
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {r.items.map((item) => (
              <ReceiptItemRow
                key={item.id}
                item={item}
                rate={fx.data?.rate ?? null}
                onSave={(patch) => updateItem.mutate({ id: item.id, ...patch })}
                onDelete={() => deleteItem.mutate({ id: item.id })}
              />
            ))}
          </div>
        )}
      </div>

      {/* Import-to-inventory action */}
      {r.items.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <h3 className="font-semibold text-gray-900 mb-3">Добавить в инвентарь</h3>
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span className="text-sm text-gray-600 mr-2">Куда:</span>
            {STORAGES.map((s) => (
              <button
                key={s.id}
                onClick={() => setStorage(s.id)}
                className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                  storage === s.id
                    ? 'bg-primary-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => importToInventory.mutate({ receiptId, storageType: storage })}
            disabled={importToInventory.isPending}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 bg-green-600 text-white rounded-xl text-sm font-medium hover:bg-green-700 disabled:opacity-50"
          >
            <Package className="w-4 h-4" />
            {importToInventory.isPending ? 'Добавление...' : 'Положить в инвентарь'}
          </button>
        </div>
      )}
    </div>
  );
}

interface ItemRowProps {
  item: {
    id: number;
    productName: string;
    originalName: string | null;
    quantity: number | null;
    unit: string | null;
    price: number | null;
    matchedProductId: number | null;
    wasAddedToInventory: boolean;
  };
  rate: number | null;
  onSave: (patch: { productName?: string; quantity?: number | null; unit?: string | null; price?: number | null }) => void;
  onDelete: () => void;
}

function ReceiptItemRow({ item, rate, onSave, onDelete }: ItemRowProps) {
  const [name, setName] = useState(item.productName);
  const [qty, setQty] = useState(item.quantity != null ? String(item.quantity) : '');
  const [unit, setUnit] = useState(item.unit ?? '');
  const [price, setPrice] = useState(item.price != null ? String(item.price) : '');
  const dirty =
    name !== item.productName ||
    qty !== (item.quantity != null ? String(item.quantity) : '') ||
    unit !== (item.unit ?? '') ||
    price !== (item.price != null ? String(item.price) : '');

  const eur = parseFloat(price) || 0;
  const rub = rate ? eur * rate : null;

  return (
    <div className={`p-3 ${item.wasAddedToInventory ? 'bg-green-50/40' : ''}`}>
      <div className="flex flex-wrap items-start gap-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="flex-1 min-w-[160px] px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
        <input
          type="number"
          step="0.01"
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          placeholder="кол-во"
          className="w-20 px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
        <input
          type="text"
          value={unit}
          onChange={(e) => setUnit(e.target.value)}
          placeholder="ед."
          className="w-16 px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
        <input
          type="number"
          step="0.01"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder="€"
          className="w-20 px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
        <button
          onClick={() =>
            onSave({
              productName: name,
              quantity: qty === '' ? null : parseFloat(qty),
              unit: unit || null,
              price: price === '' ? null : parseFloat(price),
            })
          }
          disabled={!dirty}
          className="p-1.5 text-gray-400 hover:text-green-600 disabled:opacity-30"
          aria-label="Сохранить"
        >
          <Save className="w-4 h-4" />
        </button>
        <button
          onClick={onDelete}
          className="p-1.5 text-gray-300 hover:text-red-500"
          aria-label="Удалить"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
      <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
        {item.originalName && item.originalName !== item.productName && (
          <span className="italic">оригинал: {item.originalName}</span>
        )}
        {rub != null && eur > 0 && (
          <span>≈ {rub.toFixed(0)} ₽</span>
        )}
        {item.matchedProductId && (
          <span className="px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded">сопоставлен</span>
        )}
        {item.wasAddedToInventory && (
          <span className="px-1.5 py-0.5 bg-green-50 text-green-700 rounded">в инвентаре</span>
        )}
      </div>
    </div>
  );
}

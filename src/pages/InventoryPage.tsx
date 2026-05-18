import { useState } from 'react';
import { Plus, Trash2, Edit2, X, Thermometer, Snowflake, Archive } from 'lucide-react';
import { trpc } from '../utils/trpc';

const STORAGE_TABS = [
  { key: 'fridge', label: 'Холодильник', icon: Thermometer, color: 'text-blue-600 bg-blue-50' },
  { key: 'freezer', label: 'Морозилка', icon: Snowflake, color: 'text-purple-600 bg-purple-50' },
  { key: 'pantry', label: 'Кладовая', icon: Archive, color: 'text-amber-600 bg-amber-50' },
] as const;

export default function InventoryPage() {
  const [activeTab, setActiveTab] = useState<'fridge' | 'freezer' | 'pantry'>('fridge');
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({
    productName: '',
    quantity: '',
    unit: '',
    expiryDate: '',
    minQuantity: '',
    category: '',
  });

  const items = trpc.inventory.list.useQuery({ storageType: activeTab });
  const addMutation = trpc.inventory.add.useMutation({ onSuccess: () => { items.refetch(); resetForm(); } });
  const updateMutation = trpc.inventory.update.useMutation({ onSuccess: () => { items.refetch(); resetForm(); } });
  const removeMutation = trpc.inventory.remove.useMutation({ onSuccess: () => items.refetch() });

  const resetForm = () => {
    setForm({ productName: '', quantity: '', unit: '', expiryDate: '', minQuantity: '', category: '' });
    setShowAdd(false);
    setEditingId(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.productName.trim()) return;

    if (editingId) {
      updateMutation.mutate({
        id: editingId,
        productName: form.productName,
        quantity: form.quantity ? parseFloat(form.quantity) : undefined,
        unit: form.unit || undefined,
        storageType: activeTab,
        expiryDate: form.expiryDate || null,
        minQuantity: form.minQuantity ? parseFloat(form.minQuantity) : null,
        category: form.category || undefined,
      });
    } else {
      addMutation.mutate({
        productName: form.productName,
        quantity: form.quantity ? parseFloat(form.quantity) : undefined,
        unit: form.unit || undefined,
        storageType: activeTab,
        expiryDate: form.expiryDate || undefined,
        minQuantity: form.minQuantity ? parseFloat(form.minQuantity) : undefined,
        category: form.category || undefined,
      });
    }
  };

  const startEdit = (item: any) => {
    setEditingId(item.id);
    setForm({
      productName: item.productName,
      quantity: item.quantity?.toString() || '',
      unit: item.unit || '',
      expiryDate: item.expiryDate || '',
      minQuantity: item.minQuantity?.toString() || '',
      category: item.category || '',
    });
    setShowAdd(true);
  };

  const getExpiryStatus = (expiryDate: string | null) => {
    if (!expiryDate) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expiry = new Date(expiryDate);
    const diff = Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (diff < 0) return 'expired';
    if (diff <= 3) return 'warning';
    return 'ok';
  };

  const getStockStatus = (quantity: number | null, minQuantity: number | null) => {
    if (!minQuantity || !quantity) return null;
    if (quantity <= 0) return 'empty';
    if (quantity <= minQuantity) return 'low';
    return 'ok';
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Инвентарь</h1>
        <button
          onClick={() => { setShowAdd(!showAdd); if (showAdd) resetForm(); }}
          className="flex items-center gap-2 px-4 py-2.5 bg-primary-600 rounded-xl text-sm font-medium text-white hover:bg-primary-700"
        >
          {showAdd ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          <span className="hidden sm:inline">{showAdd ? 'Закрыть' : 'Добавить'}</span>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        {STORAGE_TABS.map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium transition-colors flex-1 justify-center ${
                activeTab === tab.key
                  ? `${tab.color} border-2 border-current`
                  : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Add/Edit form */}
      {showAdd && (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-100 p-4 mb-6">
          <h3 className="font-medium mb-3">{editingId ? 'Редактировать продукт' : 'Добавить продукт'}</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <input
              type="text"
              value={form.productName}
              onChange={(e) => setForm({ ...form, productName: e.target.value })}
              placeholder="Название *"
              required
              className="col-span-2 md:col-span-1 px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
            <input
              type="number"
              step="any"
              value={form.quantity}
              onChange={(e) => setForm({ ...form, quantity: e.target.value })}
              placeholder="Количество"
              className="px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
            <input
              type="text"
              value={form.unit}
              onChange={(e) => setForm({ ...form, unit: e.target.value })}
              placeholder="Единица (г, шт, л)"
              className="px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
            <input
              type="date"
              value={form.expiryDate}
              onChange={(e) => setForm({ ...form, expiryDate: e.target.value })}
              className="px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              title="Срок годности"
            />
            <input
              type="number"
              step="any"
              value={form.minQuantity}
              onChange={(e) => setForm({ ...form, minQuantity: e.target.value })}
              placeholder="Мин. запас"
              className="px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
            <input
              type="text"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              placeholder="Категория"
              className="px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div className="flex gap-2 mt-3">
            <button type="button" onClick={resetForm}
              className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">
              Отмена
            </button>
            <button type="submit"
              className="px-4 py-2.5 bg-primary-600 rounded-xl text-sm font-medium text-white hover:bg-primary-700">
              {editingId ? 'Сохранить' : 'Добавить'}
            </button>
          </div>
        </form>
      )}

      {/* Items list */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        {items.data && items.data.length > 0 ? (
          <div className="divide-y divide-gray-50">
            {items.data.map(item => {
              const expiryStatus = getExpiryStatus(item.expiryDate);
              const stockStatus = getStockStatus(item.quantity, item.minQuantity);
              return (
                <div key={item.id} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50">
                  {/* Status indicator */}
                  <div className={`w-3 h-3 rounded-full flex-shrink-0 ${
                    expiryStatus === 'expired' ? 'bg-red-500' :
                    expiryStatus === 'warning' || stockStatus === 'low' ? 'bg-yellow-500' :
                    stockStatus === 'empty' ? 'bg-red-500' :
                    'bg-green-500'
                  }`} />
                  
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-900 truncate">{item.productName}</div>
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      {item.quantity && <span>{item.quantity} {item.unit}</span>}
                      {item.category && <span className="px-1.5 py-0.5 bg-gray-100 rounded">{item.category}</span>}
                      {item.expiryDate && (
                        <span className={`px-1.5 py-0.5 rounded ${
                          expiryStatus === 'expired' ? 'bg-red-100 text-red-700' :
                          expiryStatus === 'warning' ? 'bg-yellow-100 text-yellow-700' :
                          'bg-gray-100 text-gray-600'
                        }`}>
                          до {new Date(item.expiryDate).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
                        </span>
                      )}
                    </div>
                  </div>

                  <button onClick={() => startEdit(item)}
                    className="p-2 text-gray-400 hover:text-blue-600 rounded-lg">
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button onClick={() => removeMutation.mutate({ id: item.id })}
                    className="p-2 text-gray-400 hover:text-red-600 rounded-lg">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-12">
            <p className="text-gray-500">Пусто</p>
            <p className="text-gray-400 text-sm mt-1">Добавьте продукты в {
              activeTab === 'fridge' ? 'холодильник' :
              activeTab === 'freezer' ? 'морозилку' : 'кладовую'
            }</p>
          </div>
        )}
      </div>
    </div>
  );
}

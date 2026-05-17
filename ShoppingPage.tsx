import { useState, useMemo } from 'react';
import { Plus, Trash2, CheckCircle2, Circle, X } from 'lucide-react';
import { trpc } from '../utils/trpc';

export default function ShoppingPage() {
  const [newProduct, setNewProduct] = useState('');
  const [newQuantity, setNewQuantity] = useState('');
  const [newUnit, setNewUnit] = useState('');
  const [showAdd, setShowAdd] = useState(false);

  const items = trpc.shopping.list.useQuery();
  const addMutation = trpc.shopping.add.useMutation({ onSuccess: () => { items.refetch(); setNewProduct(''); setNewQuantity(''); setNewUnit(''); setShowAdd(false); } });
  const toggleMutation = trpc.shopping.toggleChecked.useMutation({ onSuccess: () => items.refetch() });
  const removeMutation = trpc.shopping.remove.useMutation({ onSuccess: () => items.refetch() });
  const clearCheckedMutation = trpc.shopping.clearChecked.useMutation({ onSuccess: () => items.refetch() });

  const groupedItems = useMemo(() => {
    if (!items.data) return {};
    const groups: Record<string, typeof items.data> = {};
    for (const item of items.data) {
      const cat = item.category || 'Другое';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(item);
    }
    return groups;
  }, [items.data]);

  const checkedCount = items.data?.filter(i => i.isChecked).length || 0;
  const totalCount = items.data?.length || 0;

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProduct.trim()) return;
    addMutation.mutate({
      productName: newProduct.trim(),
      quantity: newQuantity ? parseFloat(newQuantity) : undefined,
      unit: newUnit || undefined,
    });
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Список покупок</h1>
          {totalCount > 0 && (
            <p className="text-sm text-gray-500 mt-1">
              {checkedCount} из {totalCount} куплено
            </p>
          )}
        </div>
        <div className="flex gap-2">
          {checkedCount > 0 && (
            <button
              onClick={() => clearCheckedMutation.mutate()}
              className="flex items-center gap-2 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50"
            >
              <Trash2 className="w-4 h-4" />
              <span className="hidden sm:inline">Очистить купленные</span>
            </button>
          )}
          <button
            onClick={() => setShowAdd(!showAdd)}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary-600 rounded-xl text-sm font-medium text-white hover:bg-primary-700"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Добавить</span>
          </button>
        </div>
      </div>

      {/* Add form */}
      {showAdd && (
        <form onSubmit={handleAdd} className="bg-white rounded-xl border border-gray-100 p-4 mb-6">
          <div className="flex gap-2">
            <input
              type="text"
              value={newProduct}
              onChange={(e) => setNewProduct(e.target.value)}
              placeholder="Название продукта"
              className="flex-1 px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              autoFocus
            />
            <input
              type="number"
              value={newQuantity}
              onChange={(e) => setNewQuantity(e.target.value)}
              placeholder="Кол-во"
              className="w-24 px-3 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
            <input
              type="text"
              value={newUnit}
              onChange={(e) => setNewUnit(e.target.value)}
              placeholder="Ед."
              className="w-20 px-3 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
            <button type="submit" className="px-4 py-3 bg-primary-600 text-white rounded-xl hover:bg-primary-700">
              <Plus className="w-5 h-5" />
            </button>
          </div>
        </form>
      )}

      {/* Progress bar */}
      {totalCount > 0 && (
        <div className="mb-6">
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-green-500 rounded-full transition-all duration-300"
              style={{ width: `${(checkedCount / totalCount) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Grouped items */}
      <div className="space-y-4">
        {Object.entries(groupedItems).map(([category, categoryItems]) => (
          <div key={category} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-700">{category}</h3>
            </div>
            <div className="divide-y divide-gray-50">
              {categoryItems.map(item => (
                <div
                  key={item.id}
                  className={`flex items-center gap-3 px-4 py-3 transition-colors ${item.isChecked ? 'bg-green-50/50' : ''}`}
                >
                  <button
                    onClick={() => toggleMutation.mutate({ id: item.id })}
                    className="flex-shrink-0"
                  >
                    {item.isChecked ? (
                      <CheckCircle2 className="w-6 h-6 text-green-500" />
                    ) : (
                      <Circle className="w-6 h-6 text-gray-300" />
                    )}
                  </button>
                  <div className={`flex-1 ${item.isChecked ? 'line-through text-gray-400' : 'text-gray-900'}`}>
                    <span className="font-medium">{item.productName}</span>
                    {item.quantity && item.quantity > 0 && (
                      <span className="text-sm text-gray-500 ml-2">
                        {item.quantity} {item.unit}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => removeMutation.mutate({ id: item.id })}
                    className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {totalCount === 0 && (
        <div className="text-center py-12">
          <p className="text-gray-500 text-lg">Список покупок пуст</p>
          <p className="text-gray-400 text-sm mt-1">
            Сформируйте список из меню или добавьте продукты вручную
          </p>
        </div>
      )}
    </div>
  );
}

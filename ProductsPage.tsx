import { useState, useMemo } from 'react';
import { Plus, Trash2, Edit2, Search, X } from 'lucide-react';
import { trpc } from '../utils/trpc';

export default function ProductsPage() {
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ name: '', defaultUnit: '', category: '' });

  const products = trpc.products.list.useQuery({ search: search || undefined });
  const categories = trpc.products.getCategories.useQuery();
  const addMutation = trpc.products.add.useMutation({ onSuccess: () => { products.refetch(); resetForm(); } });
  const updateMutation = trpc.products.update.useMutation({ onSuccess: () => { products.refetch(); resetForm(); } });
  const removeMutation = trpc.products.remove.useMutation({ onSuccess: () => products.refetch() });

  const resetForm = () => {
    setForm({ name: '', defaultUnit: '', category: '' });
    setShowAdd(false);
    setEditingId(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    if (editingId) {
      updateMutation.mutate({ id: editingId, ...form });
    } else {
      addMutation.mutate(form);
    }
  };

  const startEdit = (item: any) => {
    setEditingId(item.id);
    setForm({ name: item.name, defaultUnit: item.defaultUnit || '', category: item.category || '' });
    setShowAdd(true);
  };

  const grouped = useMemo(() => {
    if (!products.data) return {};
    const groups: Record<string, typeof products.data> = {};
    for (const p of products.data) {
      const cat = p.category || 'Другое';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(p);
    }
    return groups;
  }, [products.data]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Справочник продуктов</h1>
        <button
          onClick={() => { setShowAdd(!showAdd); if (showAdd) resetForm(); }}
          className="flex items-center gap-2 px-4 py-2.5 bg-primary-600 rounded-xl text-sm font-medium text-white hover:bg-primary-700"
        >
          {showAdd ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          <span className="hidden sm:inline">{showAdd ? 'Закрыть' : 'Добавить'}</span>
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          type="text"
          placeholder="Поиск продуктов..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-3 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
      </div>

      {/* Add/Edit form */}
      {showAdd && (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-100 p-4 mb-6">
          <div className="flex gap-3">
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Название продукта *"
              required
              className="flex-1 px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
            <input
              type="text"
              value={form.defaultUnit}
              onChange={(e) => setForm({ ...form, defaultUnit: e.target.value })}
              placeholder="Ед. изм."
              className="w-24 px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
            <input
              type="text"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              placeholder="Категория"
              className="w-32 px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
            <button type="submit"
              className="px-4 py-3 bg-primary-600 rounded-xl text-sm font-medium text-white hover:bg-primary-700">
              {editingId ? 'Сохранить' : 'Добавить'}
            </button>
          </div>
        </form>
      )}

      {/* Products grouped by category */}
      <div className="space-y-4">
        {Object.entries(grouped).map(([category, categoryProducts]) => (
          <div key={category} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-700">{category} ({categoryProducts.length})</h3>
            </div>
            <div className="divide-y divide-gray-50">
              {categoryProducts.map(product => (
                <div key={product.id} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50">
                  <div className="flex-1">
                    <span className="font-medium text-gray-900">{product.name}</span>
                    {product.defaultUnit && (
                      <span className="text-sm text-gray-500 ml-2">({product.defaultUnit})</span>
                    )}
                  </div>
                  <button onClick={() => startEdit(product)}
                    className="p-2 text-gray-400 hover:text-blue-600 rounded-lg">
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button onClick={() => removeMutation.mutate({ id: product.id })}
                    className="p-2 text-gray-400 hover:text-red-600 rounded-lg">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {products.data?.length === 0 && (
        <div className="text-center py-12">
          <p className="text-gray-500">Продукты не найдены</p>
        </div>
      )}
    </div>
  );
}

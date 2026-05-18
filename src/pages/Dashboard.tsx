import { Link } from 'react-router-dom';
import { BookOpen, Calendar, ShoppingCart, Package, Plus, ArrowRight, Clock, Camera } from 'lucide-react';
import { trpc } from '../utils/trpc';

export default function Dashboard() {
  const recipeStats = trpc.recipes.getStats.useQuery();
  const shoppingStats = trpc.shopping.getStats.useQuery();
  const inventoryStats = trpc.inventory.getStats.useQuery();
  const productStats = trpc.products.getStats.useQuery();

  const recentRecipes = trpc.recipes.list.useQuery({});

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Главная</h1>
        <p className="text-gray-500 mt-1">Добро пожаловать в ШефДом</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-8">
        <Link
          to="/recipes"
          className="bg-white rounded-2xl border border-gray-100 p-4 hover:shadow-md transition-shadow"
        >
          <div className="flex items-center justify-between mb-2">
            <BookOpen className="w-6 h-6 text-primary-600" />
            <ArrowRight className="w-4 h-4 text-gray-300" />
          </div>
          <div className="text-2xl font-bold text-gray-900">{recipeStats.data?.total ?? '—'}</div>
          <div className="text-xs text-gray-500 mt-1">Рецептов</div>
        </Link>

        <Link
          to="/shopping"
          className="bg-white rounded-2xl border border-gray-100 p-4 hover:shadow-md transition-shadow"
        >
          <div className="flex items-center justify-between mb-2">
            <ShoppingCart className="w-6 h-6 text-green-600" />
            <ArrowRight className="w-4 h-4 text-gray-300" />
          </div>
          <div className="text-2xl font-bold text-gray-900">
            {shoppingStats.data?.unchecked ?? '—'}
          </div>
          <div className="text-xs text-gray-500 mt-1">К покупке</div>
        </Link>

        <Link
          to="/inventory"
          className="bg-white rounded-2xl border border-gray-100 p-4 hover:shadow-md transition-shadow"
        >
          <div className="flex items-center justify-between mb-2">
            <Package className="w-6 h-6 text-blue-600" />
            <ArrowRight className="w-4 h-4 text-gray-300" />
          </div>
          <div className="text-2xl font-bold text-gray-900">
            {inventoryStats.data?.total ?? '—'}
          </div>
          <div className="text-xs text-gray-500 mt-1">
            В запасах
            {inventoryStats.data?.expiringSoon ? (
              <span className="ml-1 text-red-600">
                ({inventoryStats.data.expiringSoon} скоро истекают)
              </span>
            ) : null}
          </div>
        </Link>

        <Link
          to="/products"
          className="bg-white rounded-2xl border border-gray-100 p-4 hover:shadow-md transition-shadow"
        >
          <div className="flex items-center justify-between mb-2">
            <Package className="w-6 h-6 text-amber-600" />
            <ArrowRight className="w-4 h-4 text-gray-300" />
          </div>
          <div className="text-2xl font-bold text-gray-900">{productStats.data?.total ?? '—'}</div>
          <div className="text-xs text-gray-500 mt-1">Продуктов</div>
        </Link>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <Link
          to="/recipes/add"
          className="flex items-center gap-3 p-4 bg-primary-50 hover:bg-primary-100 rounded-2xl transition-colors"
        >
          <div className="w-10 h-10 bg-primary-600 text-white rounded-xl flex items-center justify-center">
            <Plus className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="font-medium text-primary-900">Новый рецепт</div>
            <div className="text-xs text-primary-700 truncate">Создать или импортировать</div>
          </div>
        </Link>

        <Link
          to="/menu"
          className="flex items-center gap-3 p-4 bg-blue-50 hover:bg-blue-100 rounded-2xl transition-colors"
        >
          <div className="w-10 h-10 bg-blue-600 text-white rounded-xl flex items-center justify-center">
            <Calendar className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="font-medium text-blue-900">Меню недели</div>
            <div className="text-xs text-blue-700 truncate">Спланировать питание</div>
          </div>
        </Link>

        <Link
          to="/shopping"
          className="flex items-center gap-3 p-4 bg-green-50 hover:bg-green-100 rounded-2xl transition-colors"
        >
          <div className="w-10 h-10 bg-green-600 text-white rounded-xl flex items-center justify-center">
            <ShoppingCart className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="font-medium text-green-900">Покупки</div>
            <div className="text-xs text-green-700 truncate">Список на сегодня</div>
          </div>
        </Link>

        <Link
          to="/receipts"
          className="flex items-center gap-3 p-4 bg-purple-50 hover:bg-purple-100 rounded-2xl transition-colors"
        >
          <div className="w-10 h-10 bg-purple-600 text-white rounded-xl flex items-center justify-center">
            <Camera className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="font-medium text-purple-900">Сканер чеков</div>
            <div className="text-xs text-purple-700 truncate">Фото → инвентарь</div>
          </div>
        </Link>
      </div>

      {/* Recipe of the day — featured card */}
      {recentRecipes.data && recentRecipes.data.length > 0 && recentRecipes.data[0].imageUrl && (
        <Link
          to={`/recipes/${recentRecipes.data[0].id}`}
          className="group relative block mb-8 rounded-2xl overflow-hidden border border-gray-100 bg-white hover:shadow-lg transition-shadow"
        >
          <div className="aspect-[21/9] bg-gradient-to-br from-primary-100 to-primary-50 relative">
            <img
              src={recentRecipes.data[0].imageUrl}
              alt={recentRecipes.data[0].title}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 p-4 md:p-6 text-white">
              <div className="text-xs uppercase tracking-wide opacity-80 mb-1">
                Рецепт дня
              </div>
              <div className="text-xl md:text-2xl font-bold">
                {recentRecipes.data[0].title}
              </div>
              {recentRecipes.data[0].totalTime && (
                <div className="flex items-center gap-1 text-sm mt-1 opacity-90">
                  <Clock className="w-3.5 h-3.5" />
                  {recentRecipes.data[0].totalTime} мин
                </div>
              )}
            </div>
          </div>
        </Link>
      )}

      {/* Recent recipes */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Последние рецепты</h2>
          <Link
            to="/recipes"
            className="text-sm text-primary-600 hover:text-primary-700"
          >
            Все
          </Link>
        </div>

        {recentRecipes.data && recentRecipes.data.length > 0 ? (
          <div className="divide-y divide-gray-50">
            {recentRecipes.data.slice(0, 5).map((r) => (
              <Link
                key={r.id}
                to={`/recipes/${r.id}`}
                className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors"
              >
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary-100 to-primary-50 flex-shrink-0 overflow-hidden">
                  {r.imageUrl ? (
                    <img src={r.imageUrl} alt={r.title} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-xl">🍽️</div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-900 truncate">{r.title}</div>
                  <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5">
                    {r.totalTime && (
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {r.totalTime} мин
                      </span>
                    )}
                    {r.category && (
                      <span className="px-1.5 py-0.5 bg-gray-100 rounded text-xs">
                        {r.category}
                      </span>
                    )}
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-gray-300" />
              </Link>
            ))}
          </div>
        ) : (
          <div className="text-center py-12 px-4">
            <BookOpen className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">Рецептов пока нет</p>
            <Link
              to="/recipes/add"
              className="inline-flex items-center gap-1 mt-3 text-sm text-primary-600 hover:text-primary-700"
            >
              <Plus className="w-4 h-4" />
              Добавить первый
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

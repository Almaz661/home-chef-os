import { useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, X, ShoppingCart, Search } from 'lucide-react';
import { trpc } from '../utils/trpc';

const DAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const DAYS_FULL = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];
const MEALS = ['Завтрак', 'Обед', 'Ужин'];

function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

export default function MenuPage() {
  const [currentWeek, setCurrentWeek] = useState(() => getMonday(new Date()));
  const [showRecipeModal, setShowRecipeModal] = useState(false);
  const [selectedCell, setSelectedCell] = useState<{ day: number; meal: string } | null>(null);
  const [recipeSearch, setRecipeSearch] = useState('');

  const weekStartDate = formatDate(currentWeek);
  const weekData = trpc.menu.getWeek.useQuery({ weekStartDate });
  const recipes = trpc.recipes.list.useQuery({ search: recipeSearch });
  const addItemMutation = trpc.menu.addItem.useMutation({
    onSuccess: () => {
      weekData.refetch();
      setShowRecipeModal(false);
      setSelectedCell(null);
    },
  });
  const removeItemMutation = trpc.menu.removeItem.useMutation({
    onSuccess: () => weekData.refetch(),
  });
  const generateShoppingMutation = trpc.menu.generateShoppingList.useMutation({
    onSuccess: (data) => {
      alert(`Список покупок сформирован: ${data.count} позиций`);
    },
  });

  const prevWeek = () => {
    const d = new Date(currentWeek);
    d.setDate(d.getDate() - 7);
    setCurrentWeek(d);
  };

  const nextWeek = () => {
    const d = new Date(currentWeek);
    d.setDate(d.getDate() + 7);
    setCurrentWeek(d);
  };

  const getItemsForCell = (day: number, meal: string) => {
    return weekData.data?.items.filter(i => i.dayOfWeek === day && i.mealType === meal) || [];
  };

  const handleCellClick = (day: number, meal: string) => {
    setSelectedCell({ day, meal });
    setShowRecipeModal(true);
    setRecipeSearch('');
  };

  const handleSelectRecipe = (recipeId: number) => {
    if (!weekData.data?.menu || !selectedCell) return;
    addItemMutation.mutate({
      menuId: weekData.data.menu.id,
      dayOfWeek: selectedCell.day,
      mealType: selectedCell.meal,
      recipeId,
    });
  };

  const weekEnd = new Date(currentWeek);
  weekEnd.setDate(weekEnd.getDate() + 6);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Планирование меню</h1>
        <button
          onClick={() => weekData.data?.menu && generateShoppingMutation.mutate({ menuId: weekData.data.menu.id })}
          disabled={!weekData.data?.menu || generateShoppingMutation.isPending}
          className="flex items-center gap-2 px-4 py-2.5 bg-green-600 rounded-xl text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
        >
          <ShoppingCart className="w-4 h-4" />
          <span className="hidden sm:inline">Список покупок</span>
        </button>
      </div>

      {/* Week navigation */}
      <div className="flex items-center justify-between mb-6 bg-white rounded-xl border border-gray-100 p-3">
        <button onClick={prevWeek} className="p-2 hover:bg-gray-100 rounded-lg">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="text-center">
          <span className="font-medium text-gray-900">
            {currentWeek.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })} — {weekEnd.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })}
          </span>
        </div>
        <button onClick={nextWeek} className="p-2 hover:bg-gray-100 rounded-lg">
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* Menu grid */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px]">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="p-3 text-left text-sm font-medium text-gray-500 w-24"></th>
                {DAYS.map((day, idx) => (
                  <th key={idx} className="p-3 text-center text-sm font-medium text-gray-700">
                    <div>{day}</div>
                    <div className="text-xs text-gray-400 font-normal">
                      {new Date(currentWeek.getTime() + idx * 86400000).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MEALS.map(meal => (
                <tr key={meal} className="border-b border-gray-50 last:border-0">
                  <td className="p-3 text-sm font-medium text-gray-600 align-top">{meal}</td>
                  {DAYS.map((_, dayIdx) => {
                    const items = getItemsForCell(dayIdx, meal);
                    return (
                      <td key={dayIdx} className="p-2 align-top min-w-[100px]">
                        <div className="space-y-1">
                          {items.map(item => (
                            <div key={item.id} className="group relative bg-primary-50 rounded-lg p-2 text-xs">
                              <span className="text-primary-800 font-medium line-clamp-2">
                                {item.recipe?.title || 'Рецепт'}
                              </span>
                              <button
                                onClick={() => removeItemMutation.mutate({ id: item.id })}
                                className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full items-center justify-center text-xs hidden group-hover:flex"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ))}
                          <button
                            onClick={() => handleCellClick(dayIdx, meal)}
                            className="w-full p-2 border border-dashed border-gray-200 rounded-lg text-gray-400 hover:border-primary-300 hover:text-primary-500 hover:bg-primary-50/50 transition-colors"
                          >
                            <Plus className="w-4 h-4 mx-auto" />
                          </button>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recipe selection modal */}
      {showRecipeModal && selectedCell && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowRecipeModal(false)}>
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-gray-100">
              <h2 className="text-lg font-bold mb-1">Выберите рецепт</h2>
              <p className="text-sm text-gray-500">
                {DAYS_FULL[selectedCell.day]}, {selectedCell.meal}
              </p>
              <div className="relative mt-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Поиск рецептов..."
                  value={recipeSearch}
                  onChange={(e) => setRecipeSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  autoFocus
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <div className="space-y-2">
                {recipes.data?.map(recipe => (
                  <button
                    key={recipe.id}
                    onClick={() => handleSelectRecipe(recipe.id)}
                    className="w-full text-left p-3 rounded-xl hover:bg-primary-50 transition-colors border border-gray-100"
                  >
                    <span className="font-medium text-gray-900">{recipe.title}</span>
                    {recipe.totalTime && (
                      <span className="text-xs text-gray-500 ml-2">{recipe.totalTime} мин</span>
                    )}
                  </button>
                ))}
                {recipes.data?.length === 0 && (
                  <p className="text-center text-gray-500 py-4">Рецепты не найдены</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

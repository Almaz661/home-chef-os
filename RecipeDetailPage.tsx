import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Clock, Users, Trash2, ExternalLink, Minus, Plus } from 'lucide-react';
import { trpc } from '../utils/trpc';

export default function RecipeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [servingsMultiplier, setServingsMultiplier] = useState(1);

  const recipe = trpc.recipes.getById.useQuery({ id: Number(id) });
  const deleteMutation = trpc.recipes.delete.useMutation({
    onSuccess: () => navigate('/recipes'),
  });

  if (recipe.isLoading) {
    return <div className="text-center py-12 text-gray-500">Загрузка...</div>;
  }

  if (!recipe.data) {
    return <div className="text-center py-12 text-gray-500">Рецепт не найден</div>;
  }

  const r = recipe.data;
  const currentServings = (r.servings || 4) * servingsMultiplier;

  const scaleAmount = (amount: number | null) => {
    if (!amount) return null;
    const scaled = amount * servingsMultiplier;
    return Math.round(scaled * 100) / 100;
  };

  const formatAmount = (amount: number | null) => {
    if (!amount) return '';
    if (amount === Math.floor(amount)) return String(amount);
    return amount.toFixed(1).replace(/\.0$/, '');
  };

  return (
    <div>
      {/* Back button */}
      <div className="flex items-center justify-between mb-6">
        <Link
          to="/recipes"
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          <span>Назад к рецептам</span>
        </Link>
        <button
          onClick={() => {
            if (confirm('Удалить рецепт?')) {
              deleteMutation.mutate({ id: Number(id) });
            }
          }}
          className="p-2 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors"
        >
          <Trash2 className="w-5 h-5" />
        </button>
      </div>

      {/* Hero */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden mb-6">
        {r.imageUrl && (
          <div className="aspect-[21/9] bg-gray-100">
            <img src={r.imageUrl} alt={r.title} className="w-full h-full object-cover" />
          </div>
        )}
        <div className="p-6 md:p-8">
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2">{r.title}</h1>
          {r.description && <p className="text-gray-600 mb-4">{r.description}</p>}
          
          <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600">
            {r.prepTime && (
              <span className="flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-gray-400" />
                Подготовка: {r.prepTime} мин
              </span>
            )}
            {r.cookTime && (
              <span className="flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-gray-400" />
                Готовка: {r.cookTime} мин
              </span>
            )}
            {r.totalTime && (
              <span className="flex items-center gap-1.5 font-medium">
                <Clock className="w-4 h-4 text-primary-500" />
                Всего: {r.totalTime} мин
              </span>
            )}
            {r.calories && (
              <span className="px-2 py-1 bg-green-50 text-green-700 rounded-lg text-xs font-medium">
                {r.calories} ккал
              </span>
            )}
            {r.category && (
              <span className="px-2 py-1 bg-primary-50 text-primary-700 rounded-lg text-xs font-medium">
                {r.category}
              </span>
            )}
            {r.cuisine && (
              <span className="px-2 py-1 bg-blue-50 text-blue-700 rounded-lg text-xs font-medium">
                {r.cuisine}
              </span>
            )}
          </div>

          {r.sourceUrl && (
            <a
              href={r.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 mt-3 text-sm text-primary-600 hover:text-primary-700"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Источник: {r.source || 'ссылка'}
            </a>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Ingredients */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-2xl border border-gray-100 p-6 sticky top-20">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900">Ингредиенты</h2>
            </div>
            
            {/* Servings scaler */}
            <div className="flex items-center gap-3 mb-4 p-3 bg-gray-50 rounded-xl">
              <Users className="w-5 h-5 text-gray-500" />
              <button
                onClick={() => setServingsMultiplier(Math.max(0.5, servingsMultiplier - 0.5))}
                className="w-8 h-8 flex items-center justify-center rounded-lg bg-white border border-gray-200 text-gray-600 hover:bg-gray-100"
              >
                <Minus className="w-4 h-4" />
              </button>
              <span className="font-medium text-gray-900 min-w-[80px] text-center">
                {currentServings} порц.
              </span>
              <button
                onClick={() => setServingsMultiplier(servingsMultiplier + 0.5)}
                className="w-8 h-8 flex items-center justify-center rounded-lg bg-white border border-gray-200 text-gray-600 hover:bg-gray-100"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>

            <ul className="space-y-2">
              {r.ingredients.map((ing, idx) => (
                <li key={idx} className="flex items-start gap-2 py-1.5 border-b border-gray-50 last:border-0">
                  <span className="w-2 h-2 rounded-full bg-primary-400 mt-2 flex-shrink-0" />
                  <span className="text-sm text-gray-700">
                    {ing.amount && (
                      <span className="font-medium">{formatAmount(scaleAmount(ing.amount))} </span>
                    )}
                    {ing.unit && <span className="text-gray-500">{ing.unit} </span>}
                    {ing.name}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Steps */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Приготовление</h2>
            <div className="space-y-4">
              {r.steps.map((step, idx) => (
                <div key={idx} className="flex gap-4 p-4 rounded-xl hover:bg-gray-50 transition-colors">
                  <div className="flex-shrink-0 w-8 h-8 bg-primary-100 text-primary-700 rounded-full flex items-center justify-center font-bold text-sm">
                    {step.stepNumber}
                  </div>
                  <div className="flex-1">
                    <p className="text-gray-700 leading-relaxed">{step.instruction}</p>
                    {step.timerMinutes && (
                      <span className="inline-flex items-center gap-1 mt-2 px-3 py-1 bg-blue-50 text-blue-700 rounded-lg text-xs font-medium">
                        <Clock className="w-3.5 h-3.5" />
                        Таймер: {step.timerMinutes} мин
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

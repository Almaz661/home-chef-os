import { useState, useEffect } from 'react';
import { useNavigate, Link, useParams } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, ImageIcon } from 'lucide-react';
import { trpc } from '../utils/trpc';

interface Ingredient {
  name: string;
  amount: string;
  unit: string;
}

interface Step {
  instruction: string;
  timerMinutes: string;
}

/**
 * Add or edit a recipe. Mode is determined by `:id` in the route:
 *   /recipes/add        -> create
 *   /recipes/:id/edit   -> edit
 */
export default function AddRecipePage() {
  const navigate = useNavigate();
  const params = useParams<{ id?: string }>();
  const editingId = params.id ? Number(params.id) : null;
  const isEditing = editingId !== null;

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [servings, setServings] = useState('4');
  const [prepTime, setPrepTime] = useState('');
  const [cookTime, setCookTime] = useState('');
  const [category, setCategory] = useState('');
  const [cuisine, setCuisine] = useState('');
  const [difficulty, setDifficulty] = useState('medium');
  const [calories, setCalories] = useState('');
  const [ingredients, setIngredients] = useState<Ingredient[]>([{ name: '', amount: '', unit: '' }]);
  const [steps, setSteps] = useState<Step[]>([{ instruction: '', timerMinutes: '' }]);
  const [hydrated, setHydrated] = useState(false);

  // In edit mode, fetch existing recipe and prefill the form.
  const existing = trpc.recipes.getById.useQuery(
    { id: editingId! },
    { enabled: isEditing },
  );

  useEffect(() => {
    if (!isEditing || !existing.data || hydrated) return;
    const r = existing.data;
    setTitle(r.title);
    setDescription(r.description ?? '');
    setImageUrl(r.imageUrl ?? '');
    setServings(String(r.servings ?? 4));
    setPrepTime(r.prepTime ? String(r.prepTime) : '');
    setCookTime(r.cookTime ? String(r.cookTime) : '');
    setCategory(r.category ?? '');
    setCuisine(r.cuisine ?? '');
    setDifficulty(r.difficulty ?? 'medium');
    setCalories(r.calories ? String(r.calories) : '');
    setIngredients(
      r.ingredients.length > 0
        ? r.ingredients.map((i) => ({
            name: i.name,
            amount: i.amount != null ? String(i.amount) : '',
            unit: i.unit ?? '',
          }))
        : [{ name: '', amount: '', unit: '' }],
    );
    setSteps(
      r.steps.length > 0
        ? r.steps.map((s) => ({
            instruction: s.instruction,
            timerMinutes: s.timerMinutes != null ? String(s.timerMinutes) : '',
          }))
        : [{ instruction: '', timerMinutes: '' }],
    );
    setHydrated(true);
  }, [isEditing, existing.data, hydrated]);

  const createMutation = trpc.recipes.create.useMutation({
    onSuccess: (data) => navigate(`/recipes/${data.id}`),
  });
  const updateMutation = trpc.recipes.update.useMutation({
    onSuccess: () => navigate(`/recipes/${editingId}`),
  });
  const isPending = createMutation.isPending || updateMutation.isPending;
  const errorMessage = createMutation.error?.message || updateMutation.error?.message;

  const addIngredient = () => setIngredients([...ingredients, { name: '', amount: '', unit: '' }]);
  const removeIngredient = (idx: number) => setIngredients(ingredients.filter((_, i) => i !== idx));
  const updateIngredient = (idx: number, field: keyof Ingredient, value: string) => {
    const updated = [...ingredients];
    updated[idx] = { ...updated[idx], [field]: value };
    setIngredients(updated);
  };

  const addStep = () => setSteps([...steps, { instruction: '', timerMinutes: '' }]);
  const removeStep = (idx: number) => setSteps(steps.filter((_, i) => i !== idx));
  const updateStep = (idx: number, field: keyof Step, value: string) => {
    const updated = [...steps];
    updated[idx] = { ...updated[idx], [field]: value };
    setSteps(updated);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const totalTime = (parseInt(prepTime) || 0) + (parseInt(cookTime) || 0);

    const payload = {
      title,
      description: description || undefined,
      imageUrl: imageUrl || undefined,
      servings: parseInt(servings) || 4,
      prepTime: parseInt(prepTime) || undefined,
      cookTime: parseInt(cookTime) || undefined,
      totalTime: totalTime || undefined,
      category: category || undefined,
      cuisine: cuisine || undefined,
      difficulty,
      calories: parseInt(calories) || undefined,
      ingredients: ingredients
        .filter((i) => i.name.trim())
        .map((i, idx) => ({
          name: i.name.trim(),
          amount: i.amount ? parseFloat(i.amount) : null,
          unit: i.unit || null,
          sortOrder: idx + 1,
        })),
      steps: steps
        .filter((s) => s.instruction.trim())
        .map((s, idx) => ({
          stepNumber: idx + 1,
          instruction: s.instruction.trim(),
          timerMinutes: s.timerMinutes ? parseInt(s.timerMinutes) : undefined,
        })),
    };

    if (isEditing) {
      updateMutation.mutate({ id: editingId!, ...payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  // Loading state for edit mode
  if (isEditing && existing.isLoading) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Загрузка рецепта...</p>
      </div>
    );
  }

  if (isEditing && existing.data === null) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Рецепт не найден</p>
        <Link to="/recipes" className="text-primary-600 mt-2 inline-block">
          Вернуться к списку
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <Link to={isEditing ? `/recipes/${editingId}` : '/recipes'}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">
          {isEditing ? 'Редактировать рецепт' : 'Новый рецепт'}
        </h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6 max-w-3xl">
        {/* Basic info */}
        <div className="bg-white rounded-2xl border border-gray-100 p-6">
          <h2 className="text-lg font-bold mb-4">Основная информация</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Название *</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="Например: Борщ классический"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Описание</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
                placeholder="Краткое описание рецепта"
              />
            </div>

            {/* Photo URL with preview */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Фото (URL картинки)
              </label>
              <div className="flex gap-3 items-start">
                <input
                  type="url"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  className="flex-1 px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="https://..."
                />
                <div className="w-20 h-20 rounded-xl bg-gradient-to-br from-primary-100 to-primary-50 flex items-center justify-center overflow-hidden flex-shrink-0">
                  {imageUrl ? (
                    <img
                      src={imageUrl}
                      alt="Превью"
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  ) : (
                    <ImageIcon className="w-6 h-6 text-primary-300" />
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Порции</label>
                <input type="number" value={servings} onChange={(e) => setServings(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Подготовка (мин)</label>
                <input type="number" value={prepTime} onChange={(e) => setPrepTime(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Готовка (мин)</label>
                <input type="number" value={cookTime} onChange={(e) => setCookTime(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Калории</label>
                <input type="number" value={calories} onChange={(e) => setCalories(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Категория</label>
                <input type="text" value={category} onChange={(e) => setCategory(e.target.value)}
                  placeholder="Супы, Основные блюда..."
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Кухня</label>
                <input type="text" value={cuisine} onChange={(e) => setCuisine(e.target.value)}
                  placeholder="Русская, Итальянская..."
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Сложность</label>
                <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
                  <option value="easy">Легко</option>
                  <option value="medium">Средне</option>
                  <option value="hard">Сложно</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Ingredients */}
        <div className="bg-white rounded-2xl border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold">Ингредиенты</h2>
            <button type="button" onClick={addIngredient}
              className="flex items-center gap-1 px-3 py-1.5 text-sm text-primary-600 hover:bg-primary-50 rounded-lg">
              <Plus className="w-4 h-4" /> Добавить
            </button>
          </div>
          <div className="space-y-2">
            {ingredients.map((ing, idx) => (
              <div key={idx} className="flex gap-2 items-center">
                <input
                  type="text"
                  value={ing.amount}
                  onChange={(e) => updateIngredient(idx, 'amount', e.target.value)}
                  placeholder="Кол-во"
                  className="w-20 px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
                <input
                  type="text"
                  value={ing.unit}
                  onChange={(e) => updateIngredient(idx, 'unit', e.target.value)}
                  placeholder="Ед."
                  className="w-20 px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
                <input
                  type="text"
                  value={ing.name}
                  onChange={(e) => updateIngredient(idx, 'name', e.target.value)}
                  placeholder="Название ингредиента"
                  className="flex-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
                <button type="button" onClick={() => removeIngredient(idx)}
                  className="p-2 text-gray-400 hover:text-red-500">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Steps */}
        <div className="bg-white rounded-2xl border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold">Шаги приготовления</h2>
            <button type="button" onClick={addStep}
              className="flex items-center gap-1 px-3 py-1.5 text-sm text-primary-600 hover:bg-primary-50 rounded-lg">
              <Plus className="w-4 h-4" /> Добавить шаг
            </button>
          </div>
          <div className="space-y-3">
            {steps.map((step, idx) => (
              <div key={idx} className="flex gap-3 items-start">
                <span className="flex-shrink-0 w-8 h-8 bg-primary-100 text-primary-700 rounded-full flex items-center justify-center font-bold text-sm mt-2">
                  {idx + 1}
                </span>
                <div className="flex-1 space-y-2">
                  <textarea
                    value={step.instruction}
                    onChange={(e) => updateStep(idx, 'instruction', e.target.value)}
                    placeholder="Опишите шаг..."
                    rows={2}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
                  />
                  <input
                    type="number"
                    value={step.timerMinutes}
                    onChange={(e) => updateStep(idx, 'timerMinutes', e.target.value)}
                    placeholder="Таймер (мин, необязательно)"
                    className="w-48 px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <button type="button" onClick={() => removeStep(idx)}
                  className="p-2 text-gray-400 hover:text-red-500 mt-2">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {errorMessage && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">
            {errorMessage}
          </div>
        )}

        {/* Submit */}
        <div className="flex gap-3">
          <Link to={isEditing ? `/recipes/${editingId}` : '/recipes'}
            className="px-6 py-3 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50">
            Отмена
          </Link>
          <button
            type="submit"
            disabled={!title.trim() || isPending}
            className="px-6 py-3 bg-primary-600 rounded-xl text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
          >
            {isPending ? 'Сохранение...' : isEditing ? 'Сохранить изменения' : 'Сохранить рецепт'}
          </button>
        </div>
      </form>
    </div>
  );
}

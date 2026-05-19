import { useState, useEffect } from 'react';
import { useNavigate, Link, useParams } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, ImageIcon, Link2, Loader2 } from 'lucide-react';
import { trpc } from '../utils/trpc';
import { ToastStack, useToasts } from '../components/Toast';

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
  const [importUrl, setImportUrl] = useState('');
  const toasts = useToasts();
  const utils = trpc.useUtils();

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
    onSuccess: (data) => {
      utils.recipes.list.invalidate();
      utils.recipes.getStats.invalidate();
      toasts.push('Рецепт сохранён', 'success');
      navigate(`/recipes/${data.id}`);
    },
    onError: (err) => {
      toasts.push(err.message || 'Не удалось сохранить рецепт', 'error');
    },
  });
  const updateMutation = trpc.recipes.update.useMutation({
    onSuccess: () => {
      utils.recipes.list.invalidate();
      utils.recipes.getById.invalidate({ id: editingId! });
      toasts.push('Изменения сохранены', 'success');
      navigate(`/recipes/${editingId}`);
    },
    onError: (err) => {
      toasts.push(err.message || 'Не удалось сохранить изменения', 'error');
    },
  });
  const importMutation = trpc.recipes.importFromUrl.useMutation({
    onSuccess: (data) => {
      const ing = data.ingredientsCount ?? 0;
      const steps = data.stepsCount ?? 0;
      const summary =
        ing === 0 && steps === 0
          ? `Импортирован "${data.title}", но ингредиенты/шаги не распознаны — заполните вручную`
          : `Импортирован: "${data.title}" (${ing} ингредиентов, ${steps} шагов)`;
      toasts.push(summary, ing === 0 && steps === 0 ? 'info' : 'success');
      navigate(`/recipes/${data.id}/edit`);
    },
    onError: (err) => {
      toasts.push(err.message || 'Не удалось импортировать рецепт', 'error');
    },
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

    // Sanity-check: trim everything and drop empty rows so the server
    // doesn't reject on `name: z.string().min(1)` etc.
    const cleanIngredients = ingredients
      .map((i) => ({
        name: i.name.trim(),
        amount: i.amount ? parseFloat(i.amount) : null,
        unit: i.unit.trim() || null,
      }))
      .filter((i) => i.name)
      .map((i, idx) => ({ ...i, sortOrder: idx + 1 }));

    const cleanSteps = steps
      .map((s) => ({
        instruction: s.instruction.trim(),
        timerMinutes: s.timerMinutes ? parseInt(s.timerMinutes) : undefined,
      }))
      .filter((s) => s.instruction)
      .map((s, idx) => ({ ...s, stepNumber: idx + 1 }));

    const payload = {
      title: title.trim(),
      description: description.trim() || undefined,
      imageUrl: imageUrl.trim() || undefined,
      servings: parseInt(servings) || 4,
      prepTime: parseInt(prepTime) || undefined,
      cookTime: parseInt(cookTime) || undefined,
      totalTime: totalTime || undefined,
      category: category || undefined,
      cuisine: cuisine || undefined,
      difficulty,
      calories: parseInt(calories) || undefined,
      ingredients: cleanIngredients,
      steps: cleanSteps,
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
      <ToastStack messages={toasts.messages} onClose={toasts.close} />

      <div className="flex items-center gap-4 mb-6">
        <Link to={isEditing ? `/recipes/${editingId}` : '/recipes'}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">
          {isEditing ? 'Редактировать рецепт' : 'Новый рецепт'}
        </h1>
      </div>

      {/* Импорт по ссылке (только в режиме создания) */}
      {!isEditing && (
        <div className="bg-gradient-to-br from-primary-50 to-amber-50 rounded-2xl border border-primary-100 p-5 mb-6 max-w-3xl">
          <div className="flex items-center gap-2 mb-2">
            <Link2 className="w-5 h-5 text-primary-600" />
            <h2 className="text-lg font-bold text-primary-900">Импортировать из интернета</h2>
          </div>
          <p className="text-sm text-primary-800/80 mb-3">
            Вставьте ссылку на рецепт с любого кулинарного сайта — мы скачаем
            название, ингредиенты, шаги и фото автоматически.
          </p>
          <form
            className="flex flex-col sm:flex-row gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (importUrl.trim()) {
                importMutation.mutate({ url: importUrl.trim() });
              }
            }}
          >
            <input
              type="url"
              value={importUrl}
              onChange={(e) => setImportUrl(e.target.value)}
              placeholder="https://example.com/recipe/..."
              className="flex-1 px-4 py-3 border border-primary-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-500"
              disabled={importMutation.isPending}
            />
            <button
              type="submit"
              disabled={!importUrl.trim() || importMutation.isPending}
              className="flex items-center justify-center gap-2 px-5 py-3 bg-primary-600 rounded-xl text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
            >
              {importMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Загружаем...
                </>
              ) : (
                <>
                  <Link2 className="w-4 h-4" />
                  Импортировать
                </>
              )}
            </button>
          </form>
          <p className="text-xs text-primary-700/70 mt-3">
            Или заполните форму ниже вручную ↓
          </p>
        </div>
      )}

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

            {/* Photo URL with preview.
               In edit mode (or whenever a URL is set), show a large hero
               preview above the input so the user sees what photo is
               currently attached without squinting at a thumbnail. */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Фото (URL картинки)
              </label>

              {imageUrl && (
                <div className="mb-3 aspect-[16/9] w-full rounded-xl overflow-hidden bg-gradient-to-br from-primary-100 to-primary-50 border border-gray-100 relative">
                  <img
                    src={imageUrl}
                    alt="Текущее фото рецепта"
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      // Picture didn't load — hide it but keep the URL
                      // input so the user can fix the link.
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                  {isEditing && (
                    <div className="absolute top-2 left-2 px-2 py-0.5 bg-black/60 text-white text-xs rounded">
                      Текущее фото
                    </div>
                  )}
                </div>
              )}

              <div className="flex gap-3 items-start">
                <input
                  type="text"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  className="flex-1 px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="https://..."
                />
                {!imageUrl && (
                  <div className="w-20 h-20 rounded-xl bg-gradient-to-br from-primary-100 to-primary-50 flex items-center justify-center overflow-hidden flex-shrink-0">
                    <ImageIcon className="w-6 h-6 text-primary-300" />
                  </div>
                )}
              </div>
              {imageUrl && (
                <p className="text-xs text-gray-500 mt-1">
                  Чтобы заменить фото — отредактируйте ссылку выше или удалите её
                </p>
              )}
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
                <select value={category} onChange={(e) => setCategory(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white">
                  <option value="">— выберите —</option>
                  <option value="Завтраки">Завтраки</option>
                  <option value="Закуски">Закуски</option>
                  <option value="Супы">Супы</option>
                  <option value="Основные блюда">Основные блюда</option>
                  <option value="Салаты">Салаты</option>
                  <option value="Выпечка">Выпечка</option>
                  <option value="Десерты">Десерты</option>
                  <option value="Напитки">Напитки</option>
                  <option value="Соусы">Соусы</option>
                  <option value="Заготовки">Заготовки</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Кухня</label>
                <select value={cuisine} onChange={(e) => setCuisine(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white">
                  <option value="">— выберите —</option>
                  <option value="Русская">Русская</option>
                  <option value="Итальянская">Итальянская</option>
                  <option value="Французская">Французская</option>
                  <option value="Другая">Другая</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Сложность</label>
                <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
                  <option value="easy">Просто</option>
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
            {isPending ? 'Сохранение...' : isEditing ? 'Сохранить изменения' : 'Добавить рецепт'}
          </button>
        </div>
      </form>
    </div>
  );
}

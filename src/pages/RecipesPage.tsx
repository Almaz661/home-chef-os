import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Search, Clock, Users, Import, Filter, FolderInput } from 'lucide-react';
import { trpc } from '../utils/trpc';
import SectionImportDialog from '../components/SectionImportDialog';

export default function RecipesPage() {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [showSectionImport, setShowSectionImport] = useState(false);
  const [importUrl, setImportUrl] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const navigate = useNavigate();

  const recipes = trpc.recipes.list.useQuery({ search, category: category || undefined, difficulty: difficulty || undefined });
  const categories = trpc.recipes.getCategories.useQuery();
  const importMutation = trpc.recipes.importFromUrl.useMutation({
    onSuccess: (data) => {
      setShowImport(false);
      setImportUrl('');
      recipes.refetch();
      navigate(`/recipes/${data.id}`);
    },
  });

  const difficultyLabels: Record<string, string> = {
    easy: 'Легко',
    medium: 'Средне',
    hard: 'Сложно',
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Рецепты</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setShowImport(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            title="Импортировать один рецепт по ссылке"
          >
            <Import className="w-4 h-4" />
            <span className="hidden sm:inline">Импорт</span>
          </button>
          <button
            onClick={() => setShowSectionImport(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            title="Импортировать все рецепты из раздела/каталога одним заходом"
          >
            <FolderInput className="w-4 h-4" />
            <span className="hidden sm:inline">Импорт раздела</span>
          </button>
          <Link
            to="/recipes/add"
            className="flex items-center gap-2 px-4 py-2.5 bg-primary-600 rounded-xl text-sm font-medium text-white hover:bg-primary-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Добавить</span>
          </Link>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="mb-6 space-y-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Поиск рецептов..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`px-4 py-3 rounded-xl border transition-colors ${showFilters ? 'bg-primary-50 border-primary-200 text-primary-700' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}
          >
            <Filter className="w-5 h-5" />
          </button>
        </div>

        {showFilters && (
          <div className="flex flex-wrap gap-2">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">Все категории</option>
              {categories.data?.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
            <select
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value)}
              className="px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">Любая сложность</option>
              <option value="easy">Легко</option>
              <option value="medium">Средне</option>
              <option value="hard">Сложно</option>
            </select>
          </div>
        )}
      </div>

      {/* Recipe grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {recipes.data?.map(recipe => (
          <Link
            key={recipe.id}
            to={`/recipes/${recipe.id}`}
            className="bg-white rounded-2xl border border-gray-100 overflow-hidden hover:shadow-lg transition-all duration-200 hover:-translate-y-0.5"
          >
            <div className="aspect-[16/10] bg-gradient-to-br from-primary-100 to-primary-50 flex items-center justify-center">
              {recipe.imageUrl ? (
                <img src={recipe.imageUrl} alt={recipe.title} className="w-full h-full object-cover" />
              ) : (
                <span className="text-4xl">🍽️</span>
              )}
            </div>
            <div className="p-4">
              <h3 className="font-semibold text-gray-900 mb-1 line-clamp-1">{recipe.title}</h3>
              {recipe.description && (
                <p className="text-sm text-gray-500 mb-3 line-clamp-2">{recipe.description}</p>
              )}
              <div className="flex items-center gap-3 text-xs text-gray-500">
                {recipe.totalTime && (
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    {recipe.totalTime} мин
                  </span>
                )}
                {recipe.servings && (
                  <span className="flex items-center gap-1">
                    <Users className="w-3.5 h-3.5" />
                    {recipe.servings} порц.
                  </span>
                )}
                {recipe.difficulty && (
                  <span className={`px-2 py-0.5 rounded-full text-xs ${
                    recipe.difficulty === 'easy' ? 'bg-green-100 text-green-700' :
                    recipe.difficulty === 'hard' ? 'bg-red-100 text-red-700' :
                    'bg-yellow-100 text-yellow-700'
                  }`}>
                    {difficultyLabels[recipe.difficulty] || recipe.difficulty}
                  </span>
                )}
              </div>
            </div>
          </Link>
        ))}
      </div>

      {recipes.data?.length === 0 && (
        <div className="text-center py-12">
          <p className="text-gray-500 text-lg">Рецепты не найдены</p>
          <p className="text-gray-400 text-sm mt-1">Попробуйте изменить фильтры или добавьте новый рецепт</p>
        </div>
      )}

      {/* Import modal */}
      {showImport && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowImport(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <h2 className="text-xl font-bold mb-4">Импорт рецепта по URL</h2>
            <p className="text-sm text-gray-500 mb-4">
              Вставьте ссылку на рецепт. Поддерживаются сайты с разметкой Schema.org.
            </p>
            <input
              type="url"
              placeholder="https://example.com/recipe..."
              value={importUrl}
              onChange={(e) => setImportUrl(e.target.value)}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 mb-4"
            />
            {importMutation.error && (
              <p className="text-red-500 text-sm mb-4">{importMutation.error.message}</p>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => setShowImport(false)}
                className="flex-1 px-4 py-3 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Отмена
              </button>
              <button
                onClick={() => importMutation.mutate({ url: importUrl })}
                disabled={!importUrl || importMutation.isPending}
                className="flex-1 px-4 py-3 bg-primary-600 rounded-xl text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
              >
                {importMutation.isPending ? 'Импорт...' : 'Импортировать'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Bulk section import dialog */}
      {showSectionImport && (
        <SectionImportDialog
          onClose={() => setShowSectionImport(false)}
          onComplete={() => recipes.refetch()}
        />
      )}
    </div>
  );
}

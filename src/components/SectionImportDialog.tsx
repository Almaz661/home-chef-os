import { useEffect, useRef, useState } from 'react';
import { Loader2, X, CheckCircle2, AlertTriangle, ExternalLink } from 'lucide-react';
import { trpc } from '../utils/trpc';

interface Props {
  onClose: () => void;
  onComplete?: () => void;
}

/**
 * "Импорт раздела" — paste a category URL (e.g. menunedeli.ru/.../salaty/)
 * and the server walks the page (and its pagination), discovers recipe
 * links, and imports each one with photos.
 *
 * Runs as a background job; we poll status every 1.5s while it's active.
 */
export default function SectionImportDialog({ onClose, onComplete }: Props) {
  const [url, setUrl] = useState('');
  const [delaySec, setDelaySec] = useState(2);
  const [limit, setLimit] = useState(500);
  const [jobId, setJobId] = useState<string | null>(null);
  const utils = trpc.useUtils();
  const completionFiredRef = useRef(false);

  const startMutation = trpc.recipes.importSectionStart.useMutation({
    onSuccess: (data) => setJobId(data.jobId),
  });
  const cancelMutation = trpc.recipes.importSectionCancel.useMutation();
  const status = trpc.recipes.importSectionStatus.useQuery(
    { jobId: jobId ?? '' },
    {
      enabled: !!jobId,
      refetchInterval: (q) => (q.state.data?.done ? false : 1500),
    },
  );

  // Refresh recipe list while import is making progress, so the user can
  // see new recipes appear in the background.
  useEffect(() => {
    if (status.data?.success && status.data.success > 0) {
      utils.recipes.list.invalidate();
      utils.recipes.getStats.invalidate();
    }
  }, [status.data?.success, utils]);

  // Tell the parent to refresh once when the job finishes.
  useEffect(() => {
    if (status.data?.done && !completionFiredRef.current) {
      completionFiredRef.current = true;
      onComplete?.();
    }
  }, [status.data?.done, onComplete]);

  const handleStart = () => {
    if (!url.trim()) return;
    completionFiredRef.current = false;
    startMutation.mutate({
      url: url.trim(),
      limit,
      delayMs: delaySec * 1000,
    });
  };

  const handleCancel = () => {
    if (jobId) cancelMutation.mutate({ jobId });
  };

  const job = status.data;
  const isRunning = !!job && !job.done;
  const progressPct =
    job && job.total > 0 ? Math.round((job.processed / job.total) * 100) : 0;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={() => {
        // While running, only the X / Cancel buttons close the dialog.
        if (!isRunning) onClose();
      }}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 border-b border-gray-100 flex items-start justify-between gap-2">
          <div>
            <h2 className="text-xl font-bold">Импорт раздела</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Загрузить все рецепты с одной страницы-каталога
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={isRunning && !job?.cancelled}
            className="p-2 -mt-1 -mr-1 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100 disabled:opacity-50"
            aria-label="Закрыть"
            title={isRunning ? 'Сначала отмените задачу' : 'Закрыть'}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Setup form (hidden once a job is running) */}
          {!jobId && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Ссылка на раздел
                </label>
                <input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://menunedeli.ru/.../salaty/"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  autoFocus
                />
                <p className="text-xs text-gray-500 mt-1">
                  Например, страница «Салаты» на menunedeli.ru. Сервер сам
                  найдёт все ссылки на рецепты на странице (и в пагинации) и
                  загрузит каждый — с фото, ингредиентами и шагами.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Пауза между загрузками (сек)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={30}
                    value={delaySec}
                    onChange={(e) => setDelaySec(Math.max(0, Number(e.target.value) || 0))}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Чтобы сайт-источник не заблокировал
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Лимит (макс. рецептов)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={1000}
                    value={limit}
                    onChange={(e) => setLimit(Math.max(1, Number(e.target.value) || 1))}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    На всякий случай — стоп при достижении
                  </p>
                </div>
              </div>

              {startMutation.error && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">
                  {startMutation.error.message}
                </div>
              )}
            </>
          )}

          {/* Live job state */}
          {job && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium text-gray-700">
                  {job.phase === 'discovering' && 'Ищем рецепты на странице...'}
                  {job.phase === 'importing' && `Загружено ${job.processed} из ${job.total}`}
                  {job.phase === 'done' && (
                    <span className="flex items-center gap-1.5 text-green-700">
                      <CheckCircle2 className="w-4 h-4" />
                      Готово
                    </span>
                  )}
                  {job.phase === 'failed' && (
                    <span className="flex items-center gap-1.5 text-red-700">
                      <AlertTriangle className="w-4 h-4" />
                      Прервано
                    </span>
                  )}
                </div>
                <div className="text-xs text-gray-500">
                  {job.success} успех · {job.skipped} пропущено · {job.failed} ошибок
                </div>
              </div>

              {/* Progress bar */}
              {job.total > 0 && (
                <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary-500 transition-all"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
              )}

              {/* Currently processing */}
              {isRunning && job.currentUrl && (
                <div className="bg-gray-50 rounded-xl p-3 text-xs">
                  <div className="text-gray-500 mb-0.5 flex items-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Сейчас:
                  </div>
                  <div className="font-medium text-gray-800 truncate">
                    {job.currentTitle || job.currentUrl}
                  </div>
                </div>
              )}

              {/* Recently added preview */}
              {job.recentlyAdded.length > 0 && (
                <div>
                  <div className="text-xs font-medium text-gray-500 mb-1.5">
                    Последние добавленные:
                  </div>
                  <ul className="space-y-1 max-h-40 overflow-y-auto text-sm">
                    {job.recentlyAdded
                      .slice()
                      .reverse()
                      .map((r) => (
                        <li
                          key={r.id}
                          className="flex items-center gap-2 px-2 py-1 hover:bg-gray-50 rounded-lg"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                          <a
                            href={`/recipes/${r.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex-1 truncate text-gray-700 hover:text-primary-700"
                          >
                            {r.title}
                          </a>
                        </li>
                      ))}
                  </ul>
                </div>
              )}

              {/* Errors */}
              {job.errors.length > 0 && (
                <div>
                  <div className="text-xs font-medium text-red-600 mb-1.5">
                    Ошибки ({job.errors.length} из последних):
                  </div>
                  <ul className="space-y-1 max-h-32 overflow-y-auto text-xs text-red-700 bg-red-50 rounded-xl p-2.5">
                    {job.errors.slice().reverse().map((e, i) => (
                      <li key={i} className="truncate">
                        <a
                          href={e.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 hover:underline"
                        >
                          <ExternalLink className="w-3 h-3 flex-shrink-0" />
                          <span className="truncate">{e.url}</span>
                        </a>
                        <div className="text-red-600/70 ml-4">{e.error}</div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="p-4 border-t border-gray-100 flex justify-end gap-2">
          {!jobId && (
            <>
              <button
                onClick={onClose}
                className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Отмена
              </button>
              <button
                onClick={handleStart}
                disabled={!url.trim() || startMutation.isPending}
                className="flex items-center gap-2 px-5 py-2.5 bg-primary-600 rounded-xl text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
              >
                {startMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : null}
                Начать импорт
              </button>
            </>
          )}
          {jobId && isRunning && (
            <button
              onClick={handleCancel}
              disabled={cancelMutation.isPending || !!job?.cancelled}
              className="px-4 py-2.5 border border-red-200 text-red-700 bg-red-50 rounded-xl text-sm font-medium hover:bg-red-100 disabled:opacity-50"
            >
              {job?.cancelled ? 'Останавливаем...' : 'Прервать'}
            </button>
          )}
          {jobId && job?.done && (
            <button
              onClick={onClose}
              className="px-5 py-2.5 bg-primary-600 rounded-xl text-sm font-medium text-white hover:bg-primary-700"
            >
              Закрыть
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

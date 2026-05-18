/**
 * Translation service.
 *
 * If DEEPL_API_KEY is set, we use DeepL (highest quality).
 * If GOOGLE_TRANSLATE_API_KEY is set, fall back to Google Cloud Translation v2.
 * Otherwise we return the original text unchanged — the user can still edit
 * manually. This keeps the app fully functional without any external dependencies.
 */

const DEEPL_KEY = process.env.DEEPL_API_KEY;
const GOOGLE_KEY = process.env.GOOGLE_TRANSLATE_API_KEY;

export type TranslateResult = {
  text: string;
  /** false when no provider was configured / call failed: caller may need fallback. */
  translated: boolean;
  provider: 'deepl' | 'google' | 'none';
};

export function isTranslatorConfigured(): boolean {
  return Boolean(DEEPL_KEY || GOOGLE_KEY);
}

async function translateWithDeepL(text: string, sourceLang: string, targetLang: string): Promise<string> {
  // DeepL free uses *-free.deepl.com, paid uses api.deepl.com.
  // We default to free; the user can override.
  const baseUrl = process.env.DEEPL_API_URL || 'https://api-free.deepl.com';
  const url = `${baseUrl}/v2/translate`;

  const params = new URLSearchParams();
  params.append('text', text);
  params.append('target_lang', targetLang.toUpperCase());
  if (sourceLang) params.append('source_lang', sourceLang.toUpperCase());

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `DeepL-Auth-Key ${DEEPL_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params,
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    throw new Error(`DeepL ${res.status}: ${await res.text()}`);
  }
  const json = (await res.json()) as { translations?: { text: string }[] };
  return json.translations?.[0]?.text ?? text;
}

async function translateWithGoogle(text: string, sourceLang: string, targetLang: string): Promise<string> {
  const url = `https://translation.googleapis.com/language/translate/v2?key=${GOOGLE_KEY}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      q: text,
      target: targetLang,
      source: sourceLang || undefined,
      format: 'text',
    }),
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    throw new Error(`Google Translate ${res.status}: ${await res.text()}`);
  }
  const json = (await res.json()) as {
    data?: { translations?: { translatedText: string }[] };
  };
  return json.data?.translations?.[0]?.translatedText ?? text;
}

/**
 * Translate one string. Returns original text + translated:false when no
 * provider is configured or both providers fail.
 */
export async function translate(
  text: string,
  sourceLang: 'NL' | 'EN' | 'DE' | 'FR' | 'auto' = 'NL',
  targetLang: 'RU' | 'EN' = 'RU',
): Promise<TranslateResult> {
  if (!text || !text.trim()) {
    return { text, translated: false, provider: 'none' };
  }

  if (DEEPL_KEY) {
    try {
      const out = await translateWithDeepL(text, sourceLang === 'auto' ? '' : sourceLang, targetLang);
      return { text: out, translated: true, provider: 'deepl' };
    } catch (err) {
      console.warn('[translate] DeepL failed:', err);
    }
  }

  if (GOOGLE_KEY) {
    try {
      const out = await translateWithGoogle(
        text,
        sourceLang === 'auto' ? '' : sourceLang.toLowerCase(),
        targetLang.toLowerCase(),
      );
      return { text: out, translated: true, provider: 'google' };
    } catch (err) {
      console.warn('[translate] Google failed:', err);
    }
  }

  return { text, translated: false, provider: 'none' };
}

/**
 * Batch translate. Falls back per-item if a single batch call would exceed
 * upstream limits. For typical receipt lengths (15–30 items) one call is fine.
 */
export async function translateBatch(
  texts: string[],
  sourceLang: 'NL' | 'EN' | 'DE' | 'FR' | 'auto' = 'NL',
  targetLang: 'RU' | 'EN' = 'RU',
): Promise<TranslateResult[]> {
  return Promise.all(texts.map((t) => translate(t, sourceLang, targetLang)));
}

/**
 * OCR service for receipts.
 *
 * Strategy:
 *  - If OCR_SPACE_API_KEY is set, use OCR.space (free tier: 25k requests/month,
 *    supports Dutch out of the box, returns plain text — we then parse it
 *    locally with `parseReceiptText`).
 *  - If GOOGLE_VISION_API_KEY is set, use Google Cloud Vision text detection
 *    (better for harder photos; 1k requests/month free).
 *  - Otherwise return `{ available: false }` and the UI lets the user enter
 *    items manually.
 */

const OCR_SPACE_KEY = process.env.OCR_SPACE_API_KEY;
const GOOGLE_VISION_KEY = process.env.GOOGLE_VISION_API_KEY;

export type OcrResult =
  | { available: false; reason: 'no_provider'; text: ''; provider: 'none' }
  | { available: true; text: string; provider: 'ocr.space' | 'google-vision' };

export function isOcrConfigured(): boolean {
  return Boolean(OCR_SPACE_KEY || GOOGLE_VISION_KEY);
}

async function ocrWithOcrSpace(imageBase64: string, mimeType: string): Promise<string> {
  const formData = new FormData();
  // OCR.space accepts a data URL directly via base64Image
  formData.append('base64Image', `data:${mimeType};base64,${imageBase64}`);
  formData.append('language', 'dut'); // Dutch
  formData.append('isTable', 'true');
  formData.append('OCREngine', '2');
  formData.append('scale', 'true');

  const res = await fetch('https://api.ocr.space/parse/image', {
    method: 'POST',
    headers: { apikey: OCR_SPACE_KEY! },
    body: formData,
    signal: AbortSignal.timeout(45000),
  });

  if (!res.ok) {
    throw new Error(`OCR.space ${res.status}: ${await res.text()}`);
  }
  const json = (await res.json()) as {
    ParsedResults?: { ParsedText: string }[];
    IsErroredOnProcessing?: boolean;
    ErrorMessage?: string | string[];
  };

  if (json.IsErroredOnProcessing) {
    const msg = Array.isArray(json.ErrorMessage)
      ? json.ErrorMessage.join('; ')
      : json.ErrorMessage;
    throw new Error(`OCR.space: ${msg}`);
  }

  return json.ParsedResults?.map((r) => r.ParsedText).join('\n') || '';
}

async function ocrWithGoogleVision(imageBase64: string): Promise<string> {
  const url = `https://vision.googleapis.com/v1/images:annotate?key=${GOOGLE_VISION_KEY}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requests: [
        {
          image: { content: imageBase64 },
          features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
          imageContext: { languageHints: ['nl', 'ru', 'en'] },
        },
      ],
    }),
    signal: AbortSignal.timeout(45000),
  });

  if (!res.ok) {
    throw new Error(`Google Vision ${res.status}: ${await res.text()}`);
  }
  const json = (await res.json()) as {
    responses?: { fullTextAnnotation?: { text?: string } }[];
  };
  return json.responses?.[0]?.fullTextAnnotation?.text ?? '';
}

/**
 * Run OCR on a base64-encoded image (without the data: prefix).
 */
export async function ocrImage(imageBase64: string, mimeType: string): Promise<OcrResult> {
  if (OCR_SPACE_KEY) {
    try {
      const text = await ocrWithOcrSpace(imageBase64, mimeType);
      return { available: true, text, provider: 'ocr.space' };
    } catch (err) {
      console.warn('[ocr] OCR.space failed:', err);
    }
  }

  if (GOOGLE_VISION_KEY) {
    try {
      const text = await ocrWithGoogleVision(imageBase64);
      return { available: true, text, provider: 'google-vision' };
    } catch (err) {
      console.warn('[ocr] Google Vision failed:', err);
    }
  }

  return { available: false, reason: 'no_provider', text: '', provider: 'none' };
}

// ---------------------------------------------------------------------------
// Receipt-text parser
// ---------------------------------------------------------------------------

export type ParsedReceiptItem = {
  rawLine: string;
  name: string;
  quantity?: number;
  unit?: string;
  price?: number;
};

export type ParsedReceipt = {
  storeName?: string;
  date?: string;
  totalAmount?: number;
  items: ParsedReceiptItem[];
};

const STORE_KEYWORDS: Array<[RegExp, string]> = [
  [/\bAH\b|albert\s*heijn/i, 'Albert Heijn'],
  [/\bjumbo\b/i, 'Jumbo'],
  [/\blidl\b/i, 'Lidl'],
  [/\baldi\b/i, 'Aldi'],
  [/\bplus\b/i, 'Plus'],
  [/\bdirk\b/i, 'Dirk'],
  [/\bspar\b/i, 'Spar'],
  [/\bcoop\b/i, 'Coop'],
  [/\bekoplaza\b/i, 'Ekoplaza'],
  [/\bhema\b/i, 'Hema'],
];

/**
 * Heuristic parser for OCR'd Dutch supermarket receipts. The goal isn't 100%
 * accuracy — it's "produce a reasonable starting list that the user can edit".
 *
 *   - Detects store name from common chain keywords
 *   - Detects date in dd-mm-yyyy / dd/mm/yyyy / yyyy-mm-dd forms
 *   - Detects total via 'totaal' / 'subtotaal' / 'te betalen' keywords
 *   - Each remaining content line: extract trailing price (e.g. "1,29" or "1.29"),
 *     leading quantity ("2 x" or "2,000 kg"), and the rest as the product name.
 */
export function parseReceiptText(rawText: string): ParsedReceipt {
  const text = rawText.replace(/\r\n/g, '\n');
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  // Store name
  let storeName: string | undefined;
  for (const line of lines.slice(0, 5)) {
    for (const [re, name] of STORE_KEYWORDS) {
      if (re.test(line)) {
        storeName = name;
        break;
      }
    }
    if (storeName) break;
  }

  // Date
  let date: string | undefined;
  const dateRe = /\b(\d{1,2})[-./](\d{1,2})[-./](\d{2,4})\b/;
  const isoDateRe = /\b(\d{4})-(\d{2})-(\d{2})\b/;
  for (const line of lines) {
    const isoM = line.match(isoDateRe);
    if (isoM) {
      date = `${isoM[1]}-${isoM[2]}-${isoM[3]}`;
      break;
    }
    const m = line.match(dateRe);
    if (m) {
      const dd = m[1].padStart(2, '0');
      const mm = m[2].padStart(2, '0');
      const yyyy = m[3].length === 2 ? `20${m[3]}` : m[3];
      date = `${yyyy}-${mm}-${dd}`;
      break;
    }
  }

  // Total: scan from bottom for keyword
  let totalAmount: number | undefined;
  const totalRe = /\b(totaal|subtotaal|te\s*betalen|total)\b[^\d]*([\d.,]+)/i;
  for (let i = lines.length - 1; i >= 0; i--) {
    const m = lines[i].match(totalRe);
    if (m) {
      const n = parseEuroAmount(m[2]);
      if (n != null) {
        totalAmount = n;
        break;
      }
    }
  }

  // Item lines: anything that has a trailing price-like number and isn't
  // the total/header/footer lines.
  const items: ParsedReceiptItem[] = [];
  const skipRe =
    /^(totaal|subtotaal|te\s*betalen|total|btw|kassa|kassabon|datum|tijd|bon|bedankt|tot\s+ziens|kaart|pin|contant|cash|wisselgeld)/i;

  // Trailing price: last number on the line, with comma or dot decimals
  const trailingPriceRe = /([+-]?\d{1,3}(?:[ \u00A0]?\d{3})*[.,]\d{2})\s*[A-Z]?\s*$/;
  // Leading quantity: "2 x", "2,000 kg", "1.5 kg", "0,250kg"
  const leadingQtyRe = /^(\d+(?:[.,]\d+)?)\s*(x|kg|g|stuks?|st\.?|l|ml)\b/i;

  for (const line of lines) {
    if (skipRe.test(line)) continue;
    const priceM = line.match(trailingPriceRe);
    if (!priceM) continue;
    const price = parseEuroAmount(priceM[1]);
    if (price == null || price <= 0 || price > 9999) continue;

    let rest = line.slice(0, priceM.index!).trim();
    rest = rest.replace(/[\s.\-_:]+$/, '');

    let quantity: number | undefined;
    let unit: string | undefined;
    const qtyM = rest.match(leadingQtyRe);
    if (qtyM) {
      quantity = parseFloat(qtyM[1].replace(',', '.'));
      const u = qtyM[2].toLowerCase();
      unit = u === 'x' || u === 'st' || u === 'st.' || u.startsWith('stuks') ? 'шт' : u;
      rest = rest.slice(qtyM[0].length).trim();
    }

    rest = rest.replace(/^[\s\-_:.,]+/, '').replace(/\s{2,}/g, ' ');
    if (!rest) continue;

    items.push({
      rawLine: line,
      name: rest,
      quantity,
      unit,
      price,
    });
  }

  return { storeName, date, totalAmount, items };
}

function parseEuroAmount(s: string): number | null {
  // "1.234,56" -> 1234.56 ; "1,234.56" -> 1234.56 ; "1,29" -> 1.29 ; "1.29" -> 1.29
  const cleaned = s.replace(/\s|\u00A0/g, '');
  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');
  let normalized = cleaned;

  if (lastComma > lastDot) {
    // comma is decimal separator
    normalized = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (lastDot > lastComma) {
    // dot is decimal separator
    normalized = cleaned.replace(/,/g, '');
  }

  const n = parseFloat(normalized);
  return isNaN(n) ? null : n;
}

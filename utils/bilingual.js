const GOOGLE_TRANSLATE_URL = 'https://translation.googleapis.com/language/translate/v2';

const DEVANAGARI_RE = /[\u0900-\u097F]/;

function normalizeNullableText(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const s = String(value).trim();
  return s ? s : null;
}

function detectLanguage(text) {
  const s = String(text || '').trim();
  if (!s) return null;
  return DEVANAGARI_RE.test(s) ? 'hi' : 'en';
}

function isTranslationMockEnabled() {
  // Align with other translation codepaths in this backend:
  // enable mock by default unless explicitly disabled.
  // - TRANSLATE_USE_MOCK=false  => use real translation (requires API key + fetch)
  // - (unset/true)             => use mock
  return String(process.env.TRANSLATE_USE_MOCK || '').trim().toLowerCase() !== 'false';
}

async function translateText(text, sourceLanguage, targetLanguage) {
  const input = String(text || '').trim();
  if (!input) return '';

  if (isTranslationMockEnabled()) {
    const suffix =
      targetLanguage === 'hi'
        ? ' (हिंदी)'
        : targetLanguage === 'en'
          ? ' (English)'
          : ` (${targetLanguage})`;
    return `${input}${suffix}`;
  }

  const apiKey = process.env.GOOGLE_TRANSLATE_API_KEY;
  if (!apiKey) return '';

  try {
    const url = new URL(GOOGLE_TRANSLATE_URL);
    url.search = new URLSearchParams({
      key: apiKey,
      q: input,
      source: sourceLanguage,
      target: targetLanguage,
      format: 'text',
    }).toString();

    const response = await fetch(url, { method: 'POST' });
    if (!response.ok) return '';

    const payload = await response.json();
    return payload?.data?.translations?.[0]?.translatedText || '';
  } catch (_) {
    return '';
  }
}

async function fillBilingualPair(englishValue, hindiValue) {
  const enRaw = String(englishValue ?? '').trim();
  const hiRaw = String(hindiValue ?? '').trim();

  const hasEn = !!enRaw;
  const hasHi = !!hiRaw;

  if (hasEn && hasHi) {
    const enLang = detectLanguage(enRaw);
    const hiLang = detectLanguage(hiRaw);
    if (enLang === 'hi' && hiLang === 'en') {
      return { english: hiRaw, hindi: enRaw };
    }
    return { english: enRaw, hindi: hiRaw };
  }

  const provided = hasEn ? enRaw : hasHi ? hiRaw : '';
  if (!provided) return { english: null, hindi: null };

  const source = detectLanguage(provided) || (hasHi ? 'hi' : 'en');
  if (source === 'hi') {
    const translated = await translateText(provided, 'hi', 'en');
    return { english: translated || null, hindi: provided };
  }

  const translated = await translateText(provided, 'en', 'hi');
  return { english: provided, hindi: translated || null };
}

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj || {}, key);
}

function normalizedEqual(a, b) {
  return normalizeNullableText(a) === normalizeNullableText(b);
}

async function applyBilingualPairFromBody({ body, payload, englishKey, hindiKey, existing }) {
  const hasEnglish = hasOwn(body, englishKey);
  const hasHindi = hasOwn(body, hindiKey);
  if (!hasEnglish && !hasHindi) return payload;

  const nextEnglish = hasEnglish ? normalizeNullableText(body?.[englishKey]) : undefined;
  const nextHindi = hasHindi ? normalizeNullableText(body?.[hindiKey]) : undefined;

  const currentEnglish = existing ? normalizeNullableText(existing?.[englishKey]) : undefined;
  const currentHindi = existing ? normalizeNullableText(existing?.[hindiKey]) : undefined;

  // Both sides provided.
  if (hasEnglish && hasHindi) {
    // Nothing changed — skip.
    if (existing && normalizedEqual(nextEnglish, currentEnglish) && normalizedEqual(nextHindi, currentHindi)) {
      return payload;
    }

    // English changed but Hindi is stale (unchanged from stored) — auto-translate English → Hindi.
    if (existing) {
      const englishChanged = !normalizedEqual(nextEnglish, currentEnglish);
      const hindiChanged = !normalizedEqual(nextHindi, currentHindi);
      if (englishChanged && !hindiChanged && nextEnglish) {
        const pair = await fillBilingualPair(nextEnglish, null);
        payload[englishKey] = pair.english;
        payload[hindiKey] = pair.hindi;
        return payload;
      }
    }

    payload[englishKey] = nextEnglish;
    payload[hindiKey] = nextHindi;
    return payload;
  }

  // Only English provided.
  if (hasEnglish) {
    const englishUnchanged = existing ? normalizedEqual(nextEnglish, currentEnglish) : false;
    const hasStoredHindi = existing ? currentHindi !== undefined && currentHindi !== null : false;

    // If English is unchanged and Hindi already exists, don't re-translate.
    if (existing && englishUnchanged && hasStoredHindi) {
      return payload;
    }

    const pair = await fillBilingualPair(nextEnglish, null);

    payload[englishKey] = pair.english;
    if (pair.hindi !== null || !hasStoredHindi) {
      payload[hindiKey] = pair.hindi;
    }
    return payload;
  }

  // Only Hindi provided.
  const hindiUnchanged = existing ? normalizedEqual(nextHindi, currentHindi) : false;
  const hasStoredEnglish = existing ? currentEnglish !== undefined && currentEnglish !== null : false;

  // If Hindi is unchanged and English already exists, don't re-translate.
  if (existing && hindiUnchanged && hasStoredEnglish) {
    return payload;
  }

  const pair = await fillBilingualPair(null, nextHindi);

  payload[hindiKey] = pair.hindi;
  if (pair.english !== null || !hasStoredEnglish) {
    payload[englishKey] = pair.english;
  }
  return payload;
}

module.exports = {
  normalizeNullableText,
  detectLanguage,
  translateText,
  fillBilingualPair,
  applyBilingualPairFromBody,
};

const express = require('express');

const router = express.Router();
const GOOGLE_TRANSLATE_URL = 'https://translation.googleapis.com/language/translate/v2';
const USE_TRANSLATION_MOCK = process.env.TRANSLATE_USE_MOCK !== 'false';

router.post('/', async (req, res) => {
  const text = req.body?.text;
  const sourceLanguage = req.body?.sourceLanguage || 'en';
  const targetLanguage = req.body?.targetLanguage || 'hi';

  if (!text || !String(text).trim()) {
    return res.status(400).json({ message: 'Text is required for translation.' });
  }

  if (USE_TRANSLATION_MOCK) {
    return res.json({
      translated_text: `${text} (हिंदी)`,
      source_language: sourceLanguage,
      target_language: targetLanguage,
    });
  }

  const apiKey = process.env.GOOGLE_TRANSLATE_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ message: 'GOOGLE_TRANSLATE_API_KEY is not configured.' });
  }

  try {
    const url = new URL(GOOGLE_TRANSLATE_URL);
    url.search = new URLSearchParams({
      key: apiKey,
      q: text,
      source: sourceLanguage,
      target: targetLanguage,
      format: 'text',
    }).toString();

    const response = await fetch(url, { method: 'POST' });
    if (!response.ok) {
      throw new Error(`Translate API responded with ${response.status}`);
    }

    const payload = await response.json();
    const translatedText = payload?.data?.translations?.[0]?.translatedText || '';

    return res.json({
      translated_text: translatedText,
      source_language: sourceLanguage,
      target_language: targetLanguage,
    });
  } catch (error) {
    console.error('Google Translate API error:', error.message);
    return res
      .status(502)
      .json({ message: 'Failed to translate text.' });
  }
});

module.exports = router;

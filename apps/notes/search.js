// search.js - Tokenised keyword search across title + body with ranking

const RECENCY_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours
const RECENCY_BOOST = 5;
const TITLE_EXACT_SCORE = 100;
const TITLE_CONTAINS_SCORE = 50;
const BODY_CONTAINS_SCORE = 10;

export function searchNotes(notes, query) {
  const q = query.toLowerCase().trim();
  if (!q) return notes;

  const tokens = q.split(/\s+/).filter(Boolean);
  const now = Date.now();

  const scored = [];

  for (const note of notes) {
    const title = (note.title || '').toLowerCase();
    const body = (note.contentPlainText || '').toLowerCase();
    let score = 0;

    for (const token of tokens) {
      if (title === token) {
        score += TITLE_EXACT_SCORE;
      } else if (title.includes(token)) {
        score += TITLE_CONTAINS_SCORE;
      }

      if (body.includes(token)) {
        score += BODY_CONTAINS_SCORE;
      }
    }

    if (score === 0) continue;

    // Recency boost
    if (now - note.updatedAt < RECENCY_WINDOW_MS) {
      score += RECENCY_BOOST;
    }

    scored.push({ note, score });
  }

  scored.sort((a, b) => b.score - a.score || b.note.updatedAt - a.note.updatedAt);
  return scored.map(s => s.note);
}

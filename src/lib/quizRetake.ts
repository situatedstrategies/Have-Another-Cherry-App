// The financial style quiz can be retaken, but not casually: a style is a
// reading of a season, not a mood, so a retake opens three months after the
// last result. Profiles saved before the timestamp existed count as eligible.
//
// Mirrored in the Flutter app's `lib/domain/profile/quiz_retake.dart`;
// change them together.

export const QUIZ_RETAKE_MONTHS = 3;

/** When the next retake opens, or null when it is open now (no timestamp,
 *  or an unreadable one, counts as open). */
export const quizRetakeOpensAt = (financialProfileAt?: string | null): Date | null => {
  if (!financialProfileAt) return null;
  const at = new Date(financialProfileAt);
  if (Number.isNaN(at.getTime())) return null;
  return new Date(at.getFullYear(), at.getMonth() + QUIZ_RETAKE_MONTHS, at.getDate());
};

export const canRetakeQuiz = (
  financialProfileAt?: string | null,
  now: Date = new Date()
): boolean => {
  const opens = quizRetakeOpensAt(financialProfileAt);
  return opens === null || now.getTime() >= opens.getTime();
};

/** Why the quiz cannot be retaken yet, or null when it can. */
export const quizRetakeBlocker = (
  financialProfileAt?: string | null,
  now: Date = new Date()
): string | null => {
  if (canRetakeQuiz(financialProfileAt, now)) return null;
  const opens = quizRetakeOpensAt(financialProfileAt)!;
  const when = opens.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  return `You can retake the quiz on ${when}. A style is a reading of a season, so it opens every ${QUIZ_RETAKE_MONTHS} months.`;
};

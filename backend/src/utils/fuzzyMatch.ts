export const normalizeText = (value: unknown): string => {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

export const getTokens = (value: string): string[] => {
  return normalizeText(value).split(" ").filter((token) => token.length > 1);
};

export const levenshteinDistance = (left: string, right: string): number => {
  if (left === right) return 0;
  if (!left.length) return right.length;
  if (!right.length) return left.length;

  const row = Array.from({ length: right.length + 1 }, (_, index) => index);

  for (let i = 1; i <= left.length; i += 1) {
    let previous = row[0];
    row[0] = i;

    for (let j = 1; j <= right.length; j += 1) {
      const temporary = row[j];
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + cost);
      previous = temporary;
    }
  }

  return row[right.length];
};

export const tokenSimilarity = (queryToken: string, fieldToken: string): number => {
  if (!queryToken || !fieldToken) return 0;
  if (queryToken === fieldToken) return 1;
  if (fieldToken.startsWith(queryToken)) return 0.92;
  if (queryToken.length >= 4 && fieldToken.includes(queryToken)) return 0.78;
  if (fieldToken.length >= 4 && queryToken.includes(fieldToken)) return 0.65;

  const maxLength = Math.max(queryToken.length, fieldToken.length);
  if (maxLength < 4) return 0;
  const distance = levenshteinDistance(queryToken, fieldToken);
  const score = 1 - distance / maxLength;
  return score >= 0.66 ? score * 0.72 : 0;
};

export const fieldMatchScore = (queryTokens: string[], field: unknown): number => {
  const fieldText = normalizeText(Array.isArray(field) ? field.join(" ") : field);
  if (!fieldText || queryTokens.length === 0) return 0;

  const fieldTokens = getTokens(fieldText);
  const exactPhraseBoost = fieldText.includes(queryTokens.join(" ")) ? 0.12 : 0;
  const tokenScores = queryTokens.map((queryToken) =>
    Math.max(...fieldTokens.map((fieldToken) => tokenSimilarity(queryToken, fieldToken)), 0)
  );

  const average = tokenScores.reduce((sum, score) => sum + score, 0) / queryTokens.length;
  return Math.min(1, average + exactPhraseBoost);
};

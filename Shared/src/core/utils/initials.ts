const ARABIC_LETTER = /[؀-ۿ]/;
const ARABIC_ARTICLE = "ال";

function firstLetter(word: string): string {
  return Array.from(word)[0] ?? "";
}

function withoutArticle(word: string): string {
  const letters = Array.from(word);
  return word.startsWith(ARABIC_ARTICLE) && letters.length > 2
    ? letters.slice(2).join("")
    : word;
}

// Arabic gets ONE letter: two side by side join into a word, not initials
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";

  const first = words[0];
  if (ARABIC_LETTER.test(firstLetter(first))) {
    return firstLetter(withoutArticle(first));
  }

  const last = words.length > 1 ? words[words.length - 1] : "";
  return `${firstLetter(first)}${firstLetter(last)}`.toUpperCase();
}

/**
 * Exchange matching (proposal §4.1 "category-matched exchange requests").
 *
 * Deliberately a simple, explainable heuristic (proposal §4.3: "heuristic- and
 * API-assisted rather than a custom-trained model"): a want-tag matches a listing
 * when a word in its title, description or category STARTS WITH the tag.
 *   "headphone"  matches "Boat headphones"
 *   "phone"      does NOT match "Boat headphones" (no word starts with it)
 *   "maths book" matches "Engineering maths book (Grewal)"
 */

export type Matchable = {
  title: string;
  description?: string | null;
  category?: string | null;
};

/** Lowercase, punctuation → spaces, single-spaced. */
export function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ')
    .trim();
}

export function tagMatches(tag: string, listing: Matchable): boolean {
  const needle = normalise(tag);
  if (needle.length < 2) return false;
  const haystack = ` ${normalise(`${listing.title} ${listing.description ?? ''} ${listing.category ?? ''}`)} `;
  return haystack.includes(` ${needle}`);
}

/** Which of an exchange listing's wanted tags this listing satisfies. */
export function matchedTags(wantTags: string[] | null | undefined, listing: Matchable): string[] {
  return (wantTags ?? []).filter((tag) => tagMatches(tag, listing));
}

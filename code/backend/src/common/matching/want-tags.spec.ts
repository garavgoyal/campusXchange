import { describe, expect, it } from 'vitest';
import { matchedTags, tagMatches } from './want-tags.js';

describe('exchange want-tag matching', () => {
  const headphones = { title: 'Boat Rockerz headphones', description: 'With case', category: 'Electronics' };

  it('matches a whole word or the start of one', () => {
    expect(tagMatches('headphones', headphones)).toBe(true);
    expect(tagMatches('headphone', headphones)).toBe(true);
    expect(tagMatches('HEADPHONES', headphones)).toBe(true);
  });

  it('does not match the middle of a word', () => {
    expect(tagMatches('phone', headphones)).toBe(false);
  });

  it('matches category and multi-word tags', () => {
    expect(tagMatches('electronics', headphones)).toBe(true);
    expect(tagMatches('maths book', { title: 'Engineering maths book (Grewal)' })).toBe(true);
  });

  it('ignores empty and one-letter tags', () => {
    expect(tagMatches('', headphones)).toBe(false);
    expect(tagMatches('a', headphones)).toBe(false);
  });

  it('returns the tags that matched', () => {
    expect(matchedTags(['football', 'headphones', 'case'], headphones)).toEqual(['headphones', 'case']);
    expect(matchedTags(null, headphones)).toEqual([]);
  });
});

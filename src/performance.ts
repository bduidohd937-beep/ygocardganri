import type { Card, World } from './data';
import { displayName } from './data';

/** Build a compact read-only index once per card/world revision, not on every keystroke. */
export type SearchRecord = { card: Card; text: string };
export type CardQuery = { text: string; worldId: string; phase: string };
export const CARD_PAGE_SIZE = 60;
export const HISTORY_PAGE_SIZE = 80;

export function buildCardIndex(cards: readonly Card[], worlds: readonly World[]): SearchRecord[] {
  const worldNames = new Map(worlds.map(w => [w.id, w.name]));
  return cards.map(card => ({
    card,
    text: [displayName(card), worldNames.get(card.worldId) ?? '공통', card.effect,
      card.notes, card.source, card.id].join('\n').toLocaleLowerCase('ko-KR'),
  }));
}

/** All query words must match; each record is normalized exactly once. */
export function searchCardIndex(index: readonly SearchRecord[], query: CardQuery): Card[] {
  const words = query.text.trim().toLocaleLowerCase('ko-KR').split(/\s+/u).filter(Boolean);
  const result: Card[] = [];
  for (const { card, text } of index) {
    if (query.worldId !== 'all' && card.worldId !== query.worldId) continue;
    if (query.phase !== 'all' && String(card.phase) !== query.phase) continue;
    if (words.every(word => text.includes(word))) result.push(card);
  }
  return result;
}

export function visibleSlice<T>(items: readonly T[], count: number): T[] {
  return items.slice(0, Math.max(0, Math.trunc(count)));
}
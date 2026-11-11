/** File center data deliberately stays separate from approved card designs. */
export type AssetKind = 'CDB' | 'Lua' | '이미지' | 'YDK' | 'ZIP';
export type ThemeEntry = { id: string; name: string; description: string; createdAt: string; seed: boolean };
export type AssetEntry = {
  id: string; themeId: string; kind: AssetKind; filename: string; archivePath: string;
  cardId: string | null; sha256: string; size: number; importedAt: string;
  source: '직접'|'ZIP'; notes: string[]; cardCount: number;
};
export type IndexedCard = {
  themeId: string; passcode: string; name: string; effectText: string;
  sourceId: string; importedAt: string; /** Never an approval decision. */ confirmed: false;
};
export type IndexedDeck = {
  id: string; themeId: string; sourceId: string; name: string;
  main: string[]; extra: string[]; side: string[];
};
export type FileCatalog = {
  schemaVersion: 1; themes: ThemeEntry[]; assets: AssetEntry[];
  cards: IndexedCard[]; decks: IndexedDeck[];
};
export type PreviewAsset = {
  kind: AssetKind; filename: string; path: string; cardId: string | null;
  sha256: string; size: number; source: '직접'|'ZIP'; notes: string[];
  cards: { passcode: string; name: string; effectText: string }[];
  deck?: { main: string[]; extra: string[]; side: string[] };
  bytes: ArrayBuffer;
};
export type PreviewBatch = { entries: PreviewAsset[]; errors: string[]; skipped: number };

export const NOCTURNA_ID = 'nocturna';
export const emptyFileCatalog = (): FileCatalog => ({
  schemaVersion: 1,
  themes: [{ id: NOCTURNA_ID, name: '종언성서 — 녹투르나', description: '무명성서와 다섯 세계의 초기 설계 프로젝트', seed: true, createdAt: '2026-11-11T00:00:00.000Z' }],
  assets: [], cards: [], decks: [],
});

export function validateCatalog(data: unknown): data is FileCatalog {
  if (!data || typeof data !== 'object') return false;
  const d = data as Partial<FileCatalog>;
  if (d.schemaVersion !== 1 || !Array.isArray(d.themes) || !Array.isArray(d.assets) || !Array.isArray(d.cards) || !Array.isArray(d.decks)) return false;
  if (d.themes.length > 1000 || d.assets.length > 50000 || d.cards.length > 250000 || d.decks.length > 50000) return false;
  if (d.themes.some(t => !t || typeof t.id !== 'string' || !t.id || typeof t.name !== 'string')) return false;
  const ids = new Set(d.themes.map(t => t.id));
  if (ids.size !== d.themes.length) return false;
  if (d.assets.some(a => !a || typeof a.id !== 'string' || !ids.has(a.themeId) || typeof a.sha256 !== 'string' || typeof a.filename !== 'string')) return false;
  if (new Set(d.assets.map(a => a.id)).size !== d.assets.length) return false;
  if (d.cards.some(c => !c || !ids.has(c.themeId) || typeof c.passcode !== 'string' || typeof c.effectText !== 'string' || typeof c.sourceId !== 'string')) return false;
  if (d.decks.some(d => !d || !ids.has(d.themeId) || !Array.isArray(d.main) || !Array.isArray(d.extra) || !Array.isArray(d.side))) return false;
  return true;
}

export function createTheme(catalog: FileCatalog, name: string, description = ''): FileCatalog {
  const trimmed = name.trim().slice(0, 100);
  if (!trimmed) throw new Error('테마 이름을 입력하세요.');
  if (catalog.themes.some(t => t.name.toLocaleLowerCase('ko') === trimmed.toLocaleLowerCase('ko'))) throw new Error('같은 이름의 테마가 이미 있습니다.');
  return { ...catalog, themes: [...catalog.themes, { id: crypto.randomUUID(), name: trimmed, description: description.trim().slice(0, 500), createdAt: new Date().toISOString(), seed: false }] };
}

export function passcodeFromName(name: string): string | null {
  const m = /(?:^|[/\\])(?:c)?([0-9]{1,12})(?:\.(?:lua|png|jpg|jpeg|webp))$/i.exec(name);
  if (!m) return null;
  const code = m[1].replace(/^0+(?=\d)/, '');
  return /^[1-9]\d*$/.test(code) ? code : null;
}

export function parseYdk(content: string): { main: string[]; extra: string[]; side: string[]; warnings: string[] } {
  const deck = { main: [] as string[], extra: [] as string[], side: [] as string[], warnings: [] as string[] };
  let section: 'main'|'extra'|'side' | null = null;
  for (const [i, value] of content.replace(/^\uFEFF/, '').split(/\r?\n/).entries()) {
    const line = value.trim();
    if (!line) continue;
    if (line === '#main') { section = 'main'; continue; }
    if (line === '#extra') { section = 'extra'; continue; }
    if (line === '!side') { section = 'side'; continue; }
    if (line.startsWith('#') || line.startsWith('!')) continue;
    if (!section || !/^\d{1,12}$/.test(line) || Number(line) === 0 || !Number.isSafeInteger(Number(line))) {
      deck.warnings.push(`${i + 1}행: 카드 ID 형식 또는 섹션이 잘못됐습니다.`); continue;
    }
    if (deck.main.length + deck.extra.length + deck.side.length >= 300) { deck.warnings.push('301장 이상인 덱은 지원하지 않습니다.'); break; }
    deck[section].push(String(Number(line)));
  }
  if (!section) deck.warnings.push('YDK 섹션(#main/#extra/!side)이 없습니다.');
  return deck;
}

export function parseLua(content: string, filename: string): { cardId: string | null; warnings: string[] } {
  const cardId = passcodeFromName(filename);
  const warnings: string[] = [];
  if (!cardId) warnings.push('파일명이 c<카드ID>.lua 규칙과 일치하지 않습니다.');
  if (!/\bfunction\s+c\d+\.initial_effect\b|\bfunction\s+s\.initial_effect\b|\bfunction\s+s\.initial_effect\s*\(/.test(content)) warnings.push('initial_effect 함수가 확인되지 않습니다. 정적 텍스트 검사 결과입니다.');
  if (content.includes('\u0000')) warnings.push('Lua 텍스트에 NUL 문자가 있습니다.');
  return { cardId, warnings };
}

export function findAssetConflicts(catalog: FileCatalog, themeId: string, batch: readonly Pick<PreviewAsset,'cardId'|'kind'|'sha256'|'filename'>[]): string[] {
  const warnings: string[] = [];
  const groups = new Map<string, number>();
  for (const p of batch) {
    if (!p.cardId) continue;
    const key = `${p.kind}:${p.cardId}`;
    groups.set(key, (groups.get(key) || 0) + 1);
    if (catalog.assets.some(a => a.themeId === themeId && a.kind === p.kind && a.cardId === p.cardId && a.sha256 !== p.sha256)) {
      warnings.push(`파일 충돌: ${p.filename} — 카드 ${p.cardId}의 기존 ${p.kind} 원본과 내용이 다릅니다.`);
    }
    if (catalog.assets.some(a => a.themeId === themeId && a.kind === p.kind && a.cardId === p.cardId && a.sha256 === p.sha256)) {
      warnings.push(`중복 업로드: ${p.filename} — 동일 해시의 파일이 이미 등록되어 있습니다.`);
    }
  }
  for (const [key, count] of groups) if (count > 1) warnings.push(`이번 묶음 내 동일 카드 파일 충돌: ${key} (${count}개)`);
  return warnings;
}

export function appendPreview(catalog: FileCatalog, themeId: string, entries: readonly PreviewAsset[]): FileCatalog {
  if (!catalog.themes.some(t => t.id === themeId)) throw new Error('테마가 존재하지 않습니다.');
  const timestamp = new Date().toISOString();
  const assets = [...catalog.assets]; const cards = [...catalog.cards]; const decks = [...catalog.decks];
  for (const p of entries) {
    if (assets.some(a => a.themeId === themeId && a.sha256 === p.sha256 && a.filename === p.filename && a.archivePath === p.path)) continue;
    const id = crypto.randomUUID();
    assets.push({id, themeId, kind:p.kind, filename:p.filename, archivePath:p.path, cardId:p.cardId, sha256:p.sha256,
      size:p.size, importedAt:timestamp, source:p.source, notes:[...p.notes], cardCount:p.cards.length});
    for (const c of p.cards) cards.push({themeId, passcode:c.passcode, name:c.name, effectText:c.effectText,
      sourceId:id, importedAt:timestamp, confirmed:false});
    if (p.deck) decks.push({id:crypto.randomUUID(),themeId,sourceId:id,name:p.filename,...p.deck});
  }
  return {...catalog, assets, cards, decks};
}
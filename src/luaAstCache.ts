/** Bounded AST cache for a single worker audit pass. Lua source is never executed. */
import * as luaparse from 'luaparse';
import type { LuaAuditSource } from './staticAnalyzer';

export type ParsedLua = { ok: true; ast: unknown } | { ok: false; error: { message: string; line?: number } };
const MAX_CACHED_SCRIPTS = 3;
const parsed = new Map<LuaAuditSource, ParsedLua>();
export function getParsedLua(source: LuaAuditSource): ParsedLua {
  const previous = parsed.get(source);
  if (previous) return previous;
  let result: ParsedLua;
  try {
    result = { ok: true, ast: luaparse.parse(source.content, {
      comments: false, locations: true, ranges: true, scope: false, luaVersion: '5.3', encodingMode: 'none',
    }) };
  } catch (e) {
    const err = e as { message?: string; line?: number };
    result = { ok: false, error: { message: err.message || 'Lua AST 파싱 실패', line: typeof err.line === 'number' ? err.line : undefined } };
  }
  parsed.set(source, result);
  if (parsed.size > MAX_CACHED_SCRIPTS) parsed.delete(parsed.keys().next().value!);
  return result;
}
export function clearLuaAstCache() { parsed.clear(); }
import { describe, expect, it } from 'vitest';
import { parseYdk, passcodeFromName } from '../src/fileCatalog';

describe('P2 regression: imported data is never approved just by parsing',()=>{
  it('deck parsing counts duplicates while preserving order',()=>{
    const d=parseYdk('#main\n91008601\n91008601\n#extra\n19283\n!side\n1977\n');
    expect(d.main).toEqual(['91008601','91008601']);
    expect(d.extra).toEqual(['19283']);expect(d.side).toEqual(['1977']);
  });
  it('EDOPro Lua filename requires recognizable numeric passcode',()=>{
    expect(passcodeFromName('c91008601.lua')).toBe('91008601');
    expect(passcodeFromName('custom.lua')).toBeNull();
  });
});
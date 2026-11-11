import { describe, expect, it } from 'vitest';
import { appendPreview, createTheme, emptyFileCatalog, findAssetConflicts, parseLua, parseYdk, passcodeFromName, validateCatalog } from '../src/fileCatalog';
import type { PreviewAsset } from '../src/fileCatalog';

describe('P2 테마 관리',()=>{
  it('기존 《녹투르나》만 초기 등록하고 임의 테마를 만들지 않는다',()=>{
    const catalog=emptyFileCatalog();expect(catalog.themes.map(t=>t.name)).toEqual(['종언성서 — 녹투르나']);
    const changed=createTheme(catalog,'코스모코드','ID 기반 카드 관리');
    expect(changed.themes).toHaveLength(2);expect(catalog.themes).toHaveLength(1);
    expect(()=>createTheme(changed,'코스모코드')).toThrow('같은 이름');
    expect(validateCatalog(changed)).toBe(true);
  });
  it('스키마 오류나 중복 테마는 거부한다',()=>{
    const catalog=emptyFileCatalog();expect(validateCatalog({...catalog,schemaVersion:2})).toBe(false);
    expect(validateCatalog({...catalog,themes:[...catalog.themes,catalog.themes[0]]})).toBe(false);
  });
});

describe('ID·YDK·Lua 정적 파싱',()=>{
  it('파일명 ID 정규화 및 잘못된 이름 거부',()=>{
    expect(passcodeFromName('scripts/c10005001.lua')).toBe('10005001');
    expect(passcodeFromName('pics/0010005001.png')).toBe('10005001');
    expect(passcodeFromName('test.lua')).toBeNull();
    expect(passcodeFromName('c0.lua')).toBeNull();
  });
  it('YDK를 main / extra / side로 분리하고 깨진 행을 기록한다',()=>{
    const deck=parseYdk('#created by test\n#main\n10000\n10000\nBAD\n#extra\n20000\n!side\n30000');
    expect(deck.main).toEqual(['10000','10000']);expect(deck.extra).toEqual(['20000']);expect(deck.side).toEqual(['30000']);
    expect(deck.warnings).toHaveLength(1);
  });
  it('Lua는 실행하지 않고 파일명·initial_effect만 확인한다',()=>{
    const valid=parseLua('function s.initial_effect(c) end','c10005001.lua');
    expect(valid.cardId).toBe('10005001');expect(valid.warnings).toEqual([]);
    const broken=parseLua('print("hello")','test.lua');expect(broken.warnings).toHaveLength(2);
  });
});

describe('원본 분리·충돌 탐지',()=>{
  const entry=(sha:string,filename:string):PreviewAsset=>({kind:'Lua',filename,path:filename,cardId:'10005001',sha256:sha,size:3,source:'직접',notes:[],cards:[],bytes:new ArrayBuffer(3)});
  it('미승인 CDB 효과는 확정 데이터가 되지 않는다',()=>{
    const catalog=emptyFileCatalog();const preview:{cards:PreviewAsset['cards']}={cards:[{passcode:'123456',name:'테스트',effectText:'미승인 효과'}]};
    const input:PreviewAsset={...entry('h1','test.cdb'),kind:'CDB',cardId:null,cards:preview.cards};
    const updated=appendPreview(catalog,'nocturna',[input]);
    expect(updated.cards[0].confirmed).toBe(false);expect(updated.cards[0].effectText).toBe('미승인 효과');
    expect(catalog.cards).toHaveLength(0);
    expect(appendPreview(updated,'nocturna',[input]).assets).toHaveLength(1);
  });
  it('같은 ID의 서로 다른 Lua 해시를 충돌로 보고한다',()=>{
    const base=appendPreview(emptyFileCatalog(),'nocturna',[entry('h1','c10005001.lua')]);
    expect(findAssetConflicts(base,'nocturna',[entry('h2','c10005001.lua')])[0]).toContain('파일 충돌');
    expect(findAssetConflicts(base,'nocturna',[entry('h1','c10005001.lua')])[0]).toContain('중복');
  });
});
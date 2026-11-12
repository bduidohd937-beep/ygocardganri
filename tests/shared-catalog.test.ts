import { describe, expect, it } from 'vitest';
import {
  cardMakerPayload, emptyCatalog, mergeCatalog, parseCards, parsePortableJson, parseYdk,
  toYdk, validCardId, validHandoff, validateCatalog
} from '../src/sharedCatalog';

describe('공통 카드 ID · 데이터 이전 P2',()=>{
  it('숫자 ID만 받으며 유사 내부 카드 키는 추측하지 않는다',()=>{
    expect(validCardId('918760001')).toBe('918760001');
    expect(validCardId('4294967295')).toBe('4294967295');
    expect(validCardId('4294967296')).toBeNull();
    expect(validCardId('blood-0')).toBeNull();
    expect(validCardId('0')).toBeNull();
    expect(validCardId('000123')).toBeNull();
  });
  it('카드 메이커 JSON에서 수치 ID와 이름·효과를 구조적으로 읽는다',()=>{
    const parsed=parsePortableJson({version:1,cards:[{id:918760001,name:'RS－오리온',theme:'아칠리쉬',effect:'효과',frame:'effect'},{id:'blood-0',name:'잘못된 ID'}]});
    expect(parsed.cards).toHaveLength(1);
    expect(parsed.cards[0]).toMatchObject({id:'918760001',name:'RS－오리온',theme:'아칠리쉬'});
    expect(parsed.invalid).toBe(1);
  });
  it('같은 ID의 이름/효과 충돌은 덮어쓰지 않는다',()=>{
    const orig=parseCards([{id:918760001,name:'원본',effect:'승인 원문'}],'원본').cards;
    const merged=mergeCatalog({schemaVersion:1,cards:orig,decks:[]},parseCards([{id:918760001,name:'다른 이름',effect:'개정안'},{id:918760002,name:'신규'}],'제안'));
    expect(merged.conflicts).toBe(1);
    expect(merged.addedCards).toBe(1);
    expect(merged.catalog.cards[0].name).toBe('원본');
    expect(merged.catalog.cards[0].effect).toBe('승인 원문');
    expect(merged.catalog.cards[1].id).toBe('918760002');
  });
  it('완전히 같은 카드만 중복으로 판정한다',()=>{
    const base=parseCards([{id:123,name:'A',theme:'X',effect:'Y'}],'원본').cards;
    const x=mergeCatalog({schemaVersion:1,cards:base,decks:[]},parseCards([{id:123,name:'A',theme:'X',effect:'Y'}],'다른 파일'));
    expect(x.duplicateCards).toBe(1);
    expect(x.conflicts).toBe(0);
  });
  it('YDK 메인·엑스트라·사이드 카드 순서를 유지한다',()=>{
    const ydk='#created by user\n#main\n11111111\n22222222\n#extra\n33333333\n!side\n44444444\n';
    const result=parseYdk(ydk,'덱01');
    expect(result.main).toEqual(['11111111','22222222']);
    expect(result.extra).toEqual(['33333333']);
    expect(result.side).toEqual(['44444444']);
    expect(parseYdk(toYdk(result),'roundtrip').main).toEqual(result.main);
  });
  it('불확실한 승인/실전 데이터를 합산하지 않고 메타만 백업한다',()=>{
    const item=parseCards([{id:145,name:'카드'}],'테스트').cards[0];
    expect(item.source).toBe('테스트');
    const backup=mergeCatalog(emptyCatalog(),{cards:[item],decks:[],invalid:0}).catalog;
    expect(validateCatalog(backup)).toBe(true);
    expect((backup.cards[0] as unknown as Record<string,unknown>).approval).toBeUndefined();
    expect((backup.cards[0] as unknown as Record<string,unknown>).duel).toBeUndefined();
  });
  it('전송은 지원 대상/유효한 수치 ID만 허용한다',()=>{
    const cards=parseCards([{id:'918760003',name:'테스트'}],'수동').cards;
    expect(validHandoff({schemaVersion:1,target:'artlab',cards})).toBe(true);
    expect(validHandoff({schemaVersion:1,target:'arena',cards})).toBe(false);
    expect(validHandoff({schemaVersion:1,target:'cardmaker',cards:[{...cards[0],id:'bad'}]})).toBe(false);
  });
  it('렌더러 임시 카드 정보는 미검증 표시를 유지한다',()=>{
    const item=parseCards([{id:918760010,name:'테스트',effect:'①: 효과'}],'테스트').cards;
    const result=cardMakerPayload(item) as {id:number;name:string;unsupported:string[]}[];
    expect(result[0].id).toBe(918760010);
    expect(result[0].name).toBe('테스트');
    expect(result[0].unsupported.join('')).toContain('임시값');
  });
});

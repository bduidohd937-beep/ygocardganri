import {describe,expect,it} from 'vitest';
import {buildDeckLinkReport} from '../src/deckLinking';
import type {SharedCard,SharedDeck} from '../src/sharedCatalog';

const cards:SharedCard[]=[
  {id:'101',name:'일번',theme:'시험',effect:'① 효과',source:'보관함'},
  {id:'102',name:'이번',theme:'시험',effect:'② 효과',source:'보관함'}
];
const deck:SharedDeck={
  name:'연결 검사',source:'검증용',
  main:['101','101','102','999'],extra:['777','101'],side:['102','999']
};
describe('V2.8 / 덱·카드·일러스트 연결 판정',()=>{
  it('원본 YDK 순서와 섹션별 중복 장수를 그대로 보존한다',()=>{
    const r=buildDeckLinkReport(deck,cards,new Set(['101']));
    expect(r.total).toBe(8);
    expect(r.zones.map(z=>z.total)).toEqual([4,2,2]);
    expect(r.zones[0].entries.map(e=>[e.id,e.copies])).toEqual([['101',2],['102',1],['999',1]]);
    expect(r.zones[1].entries.map(e=>e.id)).toEqual(['777','101']);
  });
  it('카드명 연결률과 원화 연결률을 매수 기준으로 구별한다',()=>{
    const r=buildDeckLinkReport(deck,cards,new Set(['101']));
    expect(r.named).toBe(5);
    expect(r.illustrated).toBe(3);
    expect(r.zones[0]).toMatchObject({named:3,illustrated:2});
    expect(r.zones[1]).toMatchObject({named:1,illustrated:1});
  });
  it('누락 ID는 섹션을 넘어 중복 제거하며 순서는 최초 발견 기준이다',()=>{
    const r=buildDeckLinkReport(deck,cards,new Set(['101']));
    expect(r.missingIds).toEqual(['999','777']);
    expect(r.withoutImageIds).toEqual(['102']);
  });
  it('카드 원장에 없는 ID에 이미지가 있어도 카드 연동 성공으로 오판하지 않는다',()=>{
    const r=buildDeckLinkReport(deck,cards,new Set(['999','777','102']));
    expect(r.named).toBe(5);
    expect(r.illustrated).toBe(2);
    expect(r.zones[0].entries[2].hasImage).toBe(false);
    expect(r.zones[0].entries[1].hasImage).toBe(true);
  });
  it('원본 카드·덱 배열을 변경하지 않고 빈 덱도 안전하게 분석한다',()=>{
    const frozenDeck:SharedDeck={...deck,main:[...deck.main],extra:[...deck.extra],side:[...deck.side]};
    Object.freeze(frozenDeck.main);Object.freeze(frozenDeck.extra);Object.freeze(frozenDeck.side);
    const frozenCards=Object.freeze([...cards]);
    buildDeckLinkReport(frozenDeck,frozenCards,new Set(['101']));
    expect(deck.main).toEqual(['101','101','102','999']);
    const empty=buildDeckLinkReport({name:'비어 있음',source:'',main:[],extra:[],side:[]},[],new Set());
    expect(empty).toMatchObject({total:0,named:0,illustrated:0,missingIds:[]});
  });
});

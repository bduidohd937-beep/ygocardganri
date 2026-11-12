import {describe,expect,it} from 'vitest';
import {assessRecovery,compareRecoveryArt,compareRecoveryCard,deckRecoveryIds} from '../src/recoveryModel';
import type {SharedCard,SharedCatalog,SharedDeck} from '../src/sharedCatalog';
import type {MediaItem} from '../src/sharedMedia';

const card=(id:string,name:string,source='원본'):SharedCard=>({id,name,theme:'RS',effect:'① 테스트',source});
const deck:SharedDeck={name:'테스트',main:['123','123','456'],extra:['789'],side:['456'],source:'YDK'};
describe('V2.9 선택적 복구 충돌 모델',()=>{
  it('YDK 구성 및 매수는 그대로 두고 중복 ID만 조회한다',()=>{
    const original=JSON.stringify(deck);
    expect(deckRecoveryIds(deck)).toEqual(['123','456','789']);
    expect(JSON.stringify(deck)).toBe(original);
  });
  it('같은 ID의 카드명/테마/효과와 서로 다른 소스 제안을 구별한다',()=>{
    expect(compareRecoveryCard(undefined,[card('123','카드')])).toBe('new');
    expect(compareRecoveryCard(card('123','기존'),[card('123','기존','다른 출처')])).toBe('same');
    expect(compareRecoveryCard(card('123','기존'),[card('123','변경')])).toBe('conflict');
    expect(compareRecoveryCard(undefined,[card('123','A'),card('123','B')])).toBe('source-conflict');
    expect(compareRecoveryCard(undefined,[])).toBe('unavailable');
  });
  it('기존 이미지와 같은 SHA-256일 때만 동일 이미지로 판단한다',()=>{
    expect(compareRecoveryArt(undefined,'abc')).toBe('new');
    expect(compareRecoveryArt('abc','abc')).toBe('same');
    expect(compareRecoveryArt('abc','def')).toBe('conflict');
    expect(compareRecoveryArt('abc',undefined)).toBe('unavailable');
  });
  it('카드/이미지 충돌을 독립적으로 평가하고 원본을 변경하지 않는다',()=>{
    const current:SharedCatalog={schemaVersion:1,cards:[card('123','기존')],decks:[deck]};
    const media:MediaItem[]=[{id:'123',name:'기존',blob:new Blob(['old'],{type:'image/png'}),
      mime:'image/png',sha256:'oldhash',source:'cardmaker',importedAt:'2026-11-12'}];
    const proposal:MediaItem={...media[0],sha256:'newhash'};
    const before=JSON.stringify(current);
    const rows=assessRecovery(deck,current,media,[card('123','교체'),card('456','신규')],
      new Map([['123',proposal]]),new Map([['123','oldhash']]));
    expect(rows.map(r=>[r.id,r.cardState,r.artState])).toEqual([
      ['123','conflict','conflict'],['456','new','unavailable'],['789','unavailable','unavailable']
    ]);
    expect(rows[0].existingCard?.name).toBe('기존');
    expect(JSON.stringify(current)).toBe(before);
  });
  it('같은 ID에서 후보 이미지 중복이 충돌하면 기존 이미지가 없어도 막는다',()=>{
    const current:SharedCatalog={schemaVersion:1,cards:[],decks:[deck]};
    const rows=assessRecovery(deck,current,[],[],new Map(),new Map(),new Set(['456']));
    expect(rows.find(r=>r.id==='456')?.artState).toBe('conflict');
  });
});

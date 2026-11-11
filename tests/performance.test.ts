import { describe, expect, it } from 'vitest';
import { createInitialData } from '../src/data';
import { buildCardIndex, searchCardIndex, visibleSlice, CARD_PAGE_SIZE, HISTORY_PAGE_SIZE } from '../src/performance';

const makeCards = (count:number) => {
  const baseline = createInitialData();
  const template = baseline.cards[0];
  return { worlds:baseline.worlds, cards:Array.from({length:count},(_,i)=>({
    ...template, id:`load-${i}`, name:`부하 카드 ${String(i).padStart(5,'0')}`,
    effect:i%3===0?'상대 턴에도 발동할 수 있다.':'', notes:i%2===0?'테스트':'',
  })) };
};

describe('P0.5: card-search scales to large datasets',()=>{
  for(const count of [100,1_000,10_000]){
    it(`${count.toLocaleString('ko-KR')}장 - 인덱싱, 검색, 페이지 경계`,()=>{
      const fixture=makeCards(count);
      const start=performance.now();
      const index=buildCardIndex(fixture.cards,fixture.worlds);
      const buildMs=performance.now()-start;
      const found=searchCardIndex(index,{text:`부하 카드 ${String(count-1).padStart(5,'0')}`,worldId:'all',phase:'all'});
      expect(index).toHaveLength(count);
      expect(found).toHaveLength(1);
      expect(found[0].id).toBe(`load-${count-1}`);
      const all=searchCardIndex(index,{text:'',worldId:'all',phase:'all'});
      expect(all).toHaveLength(count);
      expect(visibleSlice(all,CARD_PAGE_SIZE)).toHaveLength(Math.min(count,CARD_PAGE_SIZE));
      expect(visibleSlice(all,120)).toHaveLength(Math.min(count,120));
      console.info(`[P0.5] index ${count} cards: ${buildMs.toFixed(2)}ms (CI sample, not user-vitals)`);
    });
  }
  it('world/phase filters are honored and history is bounded',()=>{
    const fixture=makeCards(1000);
    const index=buildCardIndex(fixture.cards,fixture.worlds);
    expect(searchCardIndex(index,{text:'부하',worldId:'sky',phase:'0'})).toHaveLength(0);
    expect(searchCardIndex(index,{text:'부하',worldId:'blood',phase:'1'})).toHaveLength(0);
    expect(searchCardIndex(index,{text:'부하',worldId:'blood',phase:'0'})).toHaveLength(1000);
    expect(visibleSlice(Array.from({length:1_000},(_,i)=>i),HISTORY_PAGE_SIZE)).toHaveLength(80);
    expect(visibleSlice(Array.from({length:1_000},(_,i)=>i),-1)).toHaveLength(0);
  });
  it('multi-keyword search matches out-of-order terms',()=>{
    const fixture=makeCards(100);
    const index=buildCardIndex(fixture.cards,fixture.worlds);
    const result=searchCardIndex(index,{text:'00007 부하',worldId:'all',phase:'all'});
    expect(result.map(c=>c.id)).toEqual(['load-7']);
  });
});
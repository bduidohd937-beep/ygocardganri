import { describe,it,expect } from 'vitest';
import { cardCounts,deckWarnings,exportYdk,newDeckStudy,openingMetrics,setMainCopies,toggleDeckRole,validateDeckBackup,validateDeckStudy } from '../src/deckMath';
import { parseYdk } from '../src/fileCatalog';
import type { DeckStudy } from '../src/deckMath';

const source={id:'deck-1',themeId:'cosmo',sourceId:'ydk-1',name:'테스트덱.ydk',
  main:[...Array(3).fill('91000001'),...Array(3).fill('91000002'),...Array(2).fill('91000003'),
    ...Array.from({length:32},(_,i)=>String(92000001+i))],extra:[],side:[]};
const make=()=>{
  const study=newDeckStudy(source);
  study.tags={91000001:['초동'],91000002:['전개보조'],91000003:['말림']};
  return study;
};
const c=(n:number,k:number)=>{
  if(k<0||k>n)return 0;let p=1;
  for(let i=1;i<=k;i++)p=p*(n-i+1)/i;
  return p;
};
describe('P5 exact YDK scenario analysis',()=>{
  it('does not modify the imported source when the scenario changes',()=>{
    const study=newDeckStudy(source),before=JSON.stringify(source);
    const changed=setMainCopies(study,'91000001',2);
    expect(changed.main.length).toBe(39);
    expect(source.main.length).toBe(40);
    expect(JSON.stringify(source)).toBe(before);
  });
  it('calculates at least one starter using the hypergeometric distribution',()=>{
    const result=openingMetrics(make(),5);
    expect(result.atLeastStarter).toBeCloseTo(1-c(37,5)/c(40,5),12);
    expect(result.starter).toBe(3);
  });
  it('calculates starter and extender jointly (without replacement)',()=>{
    const result=openingMetrics(make(),5);
    const reference=1-c(37,5)/c(40,5)-c(37,5)/c(40,5)+c(34,5)/c(40,5);
    expect(result.starterAndExtender).toBeCloseTo(reference,12);
  });
  it('handles overlapping classification with inclusion-exclusion',()=>{
    const study=make();study.tags['91000001']=['초동','전개보조'];
    study.tags['91000002']=[];
    const result=openingMetrics(study,6);
    expect(result.starterAndExtender).toBeCloseTo(result.atLeastStarter!,12);
  });
  it('calculates no starter with at least one brick, excluding shared-role bricks',()=>{
    const study=make(),p=openingMetrics(study,5);
    expect(p.noStarterWithBrick).toBeCloseTo((c(37,5)-c(35,5))/c(40,5),12);
    study.tags['91000003']=['말림','초동'];
    const same=openingMetrics(study,5);
    expect(same.noStarterWithBrick).toBeCloseTo(0,12);
  });
  it('calculates at least two bricks and exact one-brick probability',()=>{
    const study=make(),result=openingMetrics(study,5);
    const exact=(c(2,2)*c(38,3))/c(40,5);
    expect(result.atLeastTwoBricks).toBeCloseTo(exact,12);
    study.tags['91000003']=[];
    const zero=openingMetrics(study,5);
    expect(zero.atLeastTwoBricks).toBe(0);
  });
  it('supports 5/6-card opening hands and main deck size 40–60 without fixed size',()=>{
    const study=make(),five=openingMetrics(study,5);
    const six=openingMetrics(study,6);
    expect(six.atLeastStarter).toBeGreaterThan(five.atLeastStarter!);
    const sixty:DeckStudy={...study,main:[...study.main,...Array.from({length:20},(_,i)=>String(93000001+i))]};
    expect(deckWarnings(sixty)).toEqual([]);
    expect(openingMetrics(sixty,5).atLeastStarter).toBeLessThan(five.atLeastStarter!);
  });
  it('treats too-short imported YDK as warning, not a fabricated standard deck',()=>{
    const incomplete={...make(),main:['91000001','91000002']};
    expect(deckWarnings(incomplete).join(' ')).toContain('40~60');
    expect(openingMetrics(incomplete,5).canCalculate).toBe(false);
  });
  it('warns for extra/side limits, >3 ID copies, and invalid deck sizes',()=>{
    const study=make();
    const bad={...study,main:source.main.slice(0,39),
      extra:Array(16).fill('91000001'),side:Array(16).fill('91000002')};
    const warns=deckWarnings(bad).join(' / ');
    expect(warns).toContain('40~60');
    expect(warns).toContain('15장 초과');
    expect(warns).toContain('3장 제한');
  });
  it('does not silently exceed 3 copies across all deck sections',()=>{
    const study={...make(),side:['91000001']};
    expect(()=>setMainCopies(study,'91000001',3)).toThrow('3장');
    expect(()=>setMainCopies(study,'91000001',4)).toThrow('0~3');
    expect(()=>setMainCopies(study,'',2)).toThrow();
  });
  it('retains role tags after removal to make original-vs-scenario comparison fair',()=>{
    const study=make(),updated=setMainCopies(study,'91000001',0);
    expect(updated.tags['91000001']).toContain('초동');
    expect(openingMetrics(updated,5).starter).toBe(0);
    expect(openingMetrics({main:source.main,tags:updated.tags},5).starter).toBe(3);
  });
  it('allows multiple roles without trying to infer card effects',()=>{
    const study=newDeckStudy(source);
    const a=toggleDeckRole(study,'91000001','초동');
    const b=toggleDeckRole(a,'91000001','전개보조');
    const c=toggleDeckRole(b,'91000001','초동');
    expect(b.tags['91000001']).toEqual(['초동','전개보조']);
    expect(c.tags['91000001']).toEqual(['전개보조']);
    expect(()=>toggleDeckRole(study,'99999999','초동')).toThrow();
  });
  it('exports correct YDK section order and exact card ID counts',()=>{
    const study=make(),ydk=exportYdk(study);
    const parsed=parseYdk(ydk);
    expect(parsed.warnings).toEqual([]);
    expect(parsed.main).toEqual(study.main);
    expect(parsed.extra).toEqual(study.extra);
    expect(parsed.side).toEqual(study.side);
    expect(cardCounts(parsed.main).get('91000001')).toBe(3);
  });
  it('validates scenario and backup schema without accepting corrupt records',()=>{
    const study=make();
    expect(validateDeckStudy(study)).toBe(true);
    expect(validateDeckStudy({...study,main:['xyz']})).toBe(false);
    expect(validateDeckStudy({...study,revision:-1})).toBe(false);
    expect(validateDeckStudy({...study,tags:{91000001:['초동','초동']}})).toBe(false);
    const backup={kind:'ygo_card_studio_deck_lab',schemaVersion:1,exportedAt:new Date().toISOString(),studies:[study]};
    expect(validateDeckBackup(backup)).toBe(true);
    expect(validateDeckBackup({...backup,studies:[study,study]})).toBe(false);
  });
});

import { describe,it,expect } from 'vitest';
import { combinationMetrics,emptyCombinationPlan,parseIdList,validateCombinationPlan } from '../src/combinationMath';
import type { CombinationPlan,CombinationRoute } from '../src/combinationMath';
import { newDeckStudy,validateDeckBackup,validateDeckStudy } from '../src/deckMath';

const cards=(n:number)=>Array.from({length:n},(_,i)=>String(91000001+i));
const route=(id:string,a:string[],b:string[]=[]):CombinationRoute=>({id,label:id,a,b});
const plan=(routes:CombinationRoute[],brickIds:string[]=[]):CombinationPlan=>({routes,brickIds});
const choose=(n:number,k:number)=>{
  let x=1;for(let i=1;i<=k;i++)x*= (n-i+1)/i;
  return x;
};
function exhaustive(deck:string[],settings:CombinationPlan,hand:5|6){
  let any=0,risks=0,riskSuccess=0,safeSuccess=0,riskFailure=0;
  const perRoute=Array(settings.routes.length).fill(0);
  let combinations=0;
  const group=new Set(settings.brickIds);
  function sample(items:number[],begin:number){
    if(items.length===hand){
      combinations++;
      const drawn=items.map(i=>deck[i]);
      const checks=settings.routes.map(r=>{
        if(!r.b.length)return drawn.some(c=>r.a.includes(c));
        return drawn.some((a,i)=>r.a.includes(a)&&drawn.some((b,j)=>i!==j&&r.b.includes(b)));
      });
      checks.forEach((yes,i)=>{if(yes)perRoute[i]++;});
      const success=checks.some(Boolean),risk=drawn.some(id=>group.has(id));
      if(success)any++;if(risk)risks++;
      if(success&&risk)riskSuccess++;if(success&&!risk)safeSuccess++;
      if(!success&&risk)riskFailure++;
      return;
    }
    for(let i=begin;i<=deck.length-(hand-items.length);i++)sample([...items,i],i+1);
  }
  sample([],0);
  return {any:any/combinations,perRoute:perRoute.map(n=>n/combinations),
    riskChance:risks/combinations,withRisk:riskSuccess/combinations,
    withoutRisk:safeSuccess/combinations,failedWithRisk:riskFailure/combinations};
}

describe('P5.1 exact combination probabilities',()=>{
  it('requires two physically distinct cards for A+B, even with overlapping IDs',()=>{
    const deck=['91000001',...cards(39).filter(x=>x!=='91000001')].slice(0,40);
    const p=plan([route('same',['91000001'],['91000001'])]);
    expect(combinationMetrics(deck,p,5).anyRoute).toBe(0);
    const duplicated=['91000001','91000001',...cards(38).filter(x=>x!=='91000001')];
    const result=combinationMetrics(duplicated,p,5);
    const probability=choose(38,3)/choose(40,5);
    expect(result.anyRoute).toBeCloseTo(probability,12);
  });
  it('A+B disjoint uses the hypergeometric intersection and works for 5/6 cards',()=>{
    const deck=[...Array(3).fill('91000001'),...Array(2).fill('91000002'),...cards(35)];
    const p=plan([route('AB',['91000001'],['91000002'])]);
    for(const hand of [5,6] as const){
      const result=combinationMetrics(deck,p,hand);
      const exact=1-choose(37,hand)/choose(40,hand)-choose(38,hand)/choose(40,hand)+choose(35,hand)/choose(40,hand);
      expect(result.anyRoute).toBeCloseTo(exact,12);
    }
  });
  it('two identical OR routes are counted exactly once',()=>{
    const deck=[...Array(3).fill('91000001'),...cards(37)];
    const settings=plan([route('first',['91000001']),route('second',['91000001'])]);
    const result=combinationMetrics(deck,emptyCombinationPlan(),5);
    const again=combinationMetrics(deck,settings,5);
    expect(again.anyRoute).toBeCloseTo(again.perRoute[0].probability!,12);
    expect(again.anyRoute).toBeCloseTo(again.perRoute[1].probability!,12);
    expect(again.anyRoute).toBeLessThan(again.perRoute[0].probability!+again.perRoute[1].probability!);
    expect(result.canCalculate).toBe(false);
  });
  it('A-only or B-only route is the probability of either group appearing',()=>{
    const deck=[...Array(2).fill('91000001'),...Array(2).fill('91000002'),...cards(36)];
    const result=combinationMetrics(deck,plan([route('A',['91000001']),route('B',['91000002'])]),5);
    const expected=1-choose(36,5)/choose(40,5);
    expect(result.anyRoute).toBeCloseTo(expected,12);
  });
  it('overlap, risk co-occurrence and failure-risk match exhaustive physical-hand enumeration',()=>{
    const ids=['91000001','91000001','91000002','91000003','91000003','91000004','91000005','91000006'];
    const p=plan([
      route('AB',['91000001','91000003'],['91000003','91000002']),
      route('Aonly',['91000004','91000005']),
      route('both',['91000001'],['91000001']),
      route('last',['91000006'],['91000002']),
    ],['91000002','91000003']);
    const exact=exhaustive(ids,p,5),measured=combinationMetrics(ids,p,5);
    expect(measured.anyRoute).toBeCloseTo(exact.any,12);
    measured.perRoute.forEach((r,i)=>expect(r.probability).toBeCloseTo(exact.perRoute[i],12));
    expect(measured.riskChance).toBeCloseTo(exact.riskChance,12);
    expect(measured.withRisk).toBeCloseTo(exact.withRisk,12);
    expect(measured.withoutRisk).toBeCloseTo(exact.withoutRisk,12);
    expect(measured.failedWithRisk).toBeCloseTo(exact.failedWithRisk,12);
    expect(measured.withRisk!+measured.withoutRisk!).toBeCloseTo(measured.anyRoute!,12);
    expect(measured.withRisk!+measured.failedWithRisk!).toBeCloseTo(measured.riskChance!,12);
  });
  it('returns unknown values when no route exists or a draw cannot be sampled',()=>{
    const empty=combinationMetrics(cards(40),emptyCombinationPlan(),5);
    expect(empty.anyRoute).toBeNull();expect(empty.canCalculate).toBe(false);
    expect(combinationMetrics(cards(3),plan([route('X',['91000001'])]),5).canCalculate).toBe(false);
  });
  it('validates route IDs, duplicate groups, card IDs, max routes and old P5 backup compatibility',()=>{
    const correct=plan([route('r1',['91000001'],['91000002'])],['91000003']);
    expect(validateCombinationPlan(correct)).toBe(true);
    expect(validateCombinationPlan(plan([route('x',[],[]) ]))).toBe(false);
    expect(validateCombinationPlan(plan([route('x',['91000001','91000001'])]))).toBe(false);
    expect(validateCombinationPlan(plan(Array.from({length:5},(_,i)=>route('r'+i,['91000001']))))).toBe(false);
    expect(()=>parseIdList('foo')).toThrow();
    expect(parseIdList('91000001, 91000002, 91000001')).toEqual(['91000001','91000002']);
    const old=newDeckStudy({id:'d',themeId:'t',sourceId:'s',name:'name',main:cards(40),extra:[],side:[]});
    delete old.combinations;
    expect(validateDeckStudy(old)).toBe(true);
    expect(validateDeckStudy({...old,combinations:correct})).toBe(true);
    expect(validateDeckStudy({...old,combinations:plan([route('x',[])])})).toBe(false);
    const backup={kind:'ygo_card_studio_deck_lab',schemaVersion:1,exportedAt:'2026-11-11',studies:[old]};
    expect(validateDeckBackup(backup)).toBe(true);
  });
  it('handles 60-card maximum and all four routes without exhaustive hand enumeration',()=>{
    const deck=[...Array(3).fill('91000001'),...Array(3).fill('91000002'),
      ...Array(3).fill('91000003'),...Array(3).fill('91000004'),...cards(48)];
    const settings=plan([
      route('p1',['91000001'],['91000002']),
      route('p2',['91000003'],['91000004']),
      route('p3',['91000001','91000002'],['91000003','91000004']),
      route('p4',['91000001','91000004']),
    ],['91000001','91000004']);
    const started=performance.now();
    const outcome=combinationMetrics(deck,settings,6);
    expect(outcome.canCalculate).toBe(true);
    expect(outcome.anyRoute).toBeGreaterThan(0);
    expect(outcome.anyRoute).toBeLessThanOrEqual(1);
    expect(outcome.noRoute!+outcome.anyRoute!).toBeCloseTo(1,12);
    expect(performance.now()-started).toBeLessThan(3000);
  });
});

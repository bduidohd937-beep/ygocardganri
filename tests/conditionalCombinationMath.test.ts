import { describe,expect,it } from 'vitest';
import { combinationMetrics,validateCombinationPlan } from '../src/combinationMath';
import type { CombinationPlan,CombinationRoute } from '../src/combinationMath';
import { validateDeckBackup,validateDeckStudy,newDeckStudy } from '../src/deckMath';

const ids=Array.from({length:12},(_,i)=>String(91008601+i));
const make=(a:string[],b:string[]=[],other:Partial<CombinationRoute>={}):CombinationRoute=>({
 id:other.id||'route-1',label:other.label||'테스트 루트',a,b,...other,
});
const settings=(routes:CombinationRoute[],brickIds:string[]=[]):CombinationPlan=>({routes,brickIds});
const choose=(n:number,k:number)=>{if(k<0||k>n)return 0;let t=1;for(let i=1;i<=k;i++)t=t*(n-i+1)/i;return t;};
type Exact={any:number;perRoute:number[];withRisk:number;withoutRisk:number;failedWithRisk:number;riskChance:number};
/** Brute-force physical copy enumeration is an independent oracle, not the DP under test. */
function brute(deck:string[],plan:CombinationPlan,hand:5|6):Exact {
  const outcome={any:0,perRoute:plan.routes.map(()=>0),withRisk:0,withoutRisk:0,failedWithRisk:0,riskChance:0};
  let samples=0;
  function test(selected:number[],begin:number):void {
    if(selected.length===hand){
      const cards=selected.map(i=>deck[i]);
      const passed=plan.routes.map(route=>{
        if((route.forbiddenIds||[]).some(id=>cards.includes(id)))return false;
        if((route.minResources||0)>cards.filter(id=>(route.resourceIds||[]).includes(id)).length)return false;
        if(!route.b.length)return cards.some(id=>route.a.includes(id));
        return cards.some((a,i)=>route.a.includes(a)&&
          cards.some((b,j)=>i!==j&&route.b.includes(b)));
      });
      const success=passed.some(Boolean),risk=cards.some(id=>plan.brickIds.includes(id));
      passed.forEach((v,i)=>{if(v)outcome.perRoute[i]++;});
      if(success)outcome.any++;
      if(risk)outcome.riskChance++;
      if(success&&risk)outcome.withRisk++;
      if(success&&!risk)outcome.withoutRisk++;
      if(!success&&risk)outcome.failedWithRisk++;
      samples++;return;
    }
    for(let i=begin;i<=deck.length-(hand-selected.length);i++)test([...selected,i],i+1);
  }
  test([],0);
  return Object.fromEntries(Object.entries(outcome).map(([name,value])=>[
    name,Array.isArray(value)?value.map(x=>x/samples):value/samples,
  ])) as Exact;
}
function compare(deck:string[],plan:CombinationPlan,hand:5|6){
  const expected=brute(deck,plan,hand),actual=combinationMetrics(deck,plan,hand);
  expect(actual.canCalculate).toBe(true);
  expect(actual.anyRoute).toBeCloseTo(expected.any,12);
  actual.perRoute.forEach((r,i)=>expect(r.probability).toBeCloseTo(expected.perRoute[i],12));
  expect(actual.withRisk).toBeCloseTo(expected.withRisk,12);
  expect(actual.withoutRisk).toBeCloseTo(expected.withoutRisk,12);
  expect(actual.failedWithRisk).toBeCloseTo(expected.failedWithRisk,12);
  expect(actual.riskChance).toBeCloseTo(expected.riskChance,12);
  expect(actual.withRisk!+actual.withoutRisk!).toBeCloseTo(actual.anyRoute!,12);
  expect(actual.withRisk!+actual.failedWithRisk!).toBeCloseTo(actual.riskChance!,12);
}
describe('P5.2 exact per-route conditional combination analysis',()=>{
  it('forbidden card in the hand invalidates only that route (exact hypergeometric)',()=>{
    const deck=[...Array(3).fill(ids[0]),...Array(2).fill(ids[1]),
      ...Array.from({length:35},(_,i)=>String(92000001+i))];
    const p=settings([make([ids[0]],[],{forbiddenIds:[ids[1]]})]);
    const result=combinationMetrics(deck,p,5);
    const exact=(choose(38,5)-choose(35,5))/choose(40,5);
    expect(result.anyRoute).toBeCloseTo(exact,12);
  });
  it('resource 1+ requires another distinct card ID, never reuses the A/B copy',()=>{
    const deck=[ids[0],ids[1],ids[2],ids[2],ids[3],ids[4],ids[5],ids[6]];
    const p=settings([make([ids[0]],[ids[1]],{resourceIds:[ids[2]],minResources:1})],[ids[3]]);
    compare(deck,p,5);
    const invalid=settings([make([ids[0]],[],{resourceIds:[ids[0]],minResources:1})]);
    expect(validateCombinationPlan(invalid)).toBe(false);
    expect(()=>combinationMetrics(deck,invalid,5)).toThrow();
  });
  it('additional 2 or 3 physical resource copies are separately counted, including repeated IDs',()=>{
    const deck=[ids[0],ids[1],ids[2],ids[2],ids[2],ids[3],ids[4],ids[5],ids[6]];
    for(const required of [1,2,3]){
      const p=settings([make([ids[0]],[ids[1]],{resourceIds:[ids[2]],minResources:required})],[ids[4]]);
      compare(deck,p,5);
    }
  });
  it('forbid and resource group conflict produces zero probability rather than a fake success',()=>{
    const deck=[ids[0],ids[1],ids[1],ids[2],ids[3],ids[4],ids[5]];
    const p=settings([make([ids[0]],[],{resourceIds:[ids[1]],minResources:1,forbiddenIds:[ids[1]]})],[ids[3]]);
    compare(deck,p,5);
    expect(combinationMetrics(deck,p,5).anyRoute).toBe(0);
  });
  it('four OR routes with distinct conditions, A/B overlap and brick risk match brute force',()=>{
    const deck=[ids[0],ids[0],ids[1],ids[2],ids[2],ids[3],ids[4],ids[5],ids[6],ids[7]];
    const p=settings([
      make([ids[0]],[ids[1]],{id:'r1',resourceIds:[ids[2]],minResources:1,forbiddenIds:[ids[6]]}),
      make([ids[2]],[],{id:'r2',forbiddenIds:[ids[1],ids[4]]}),
      make([ids[0]],[ids[0]],{id:'r3',resourceIds:[ids[3]],minResources:1}),
      make([ids[3],ids[4]],[ids[5]],{id:'r4',resourceIds:[ids[7]],minResources:1,forbiddenIds:[ids[0]]}),
    ],[ids[4],ids[6]]);
    compare(deck,p,5);compare(deck,p,6);
  });
  it('same physical card cannot satisfy both A and B even with forbids',()=>{
    const deck=[ids[0],...ids.slice(1,8)];
    const p=settings([make([ids[0]],[ids[0]],{forbiddenIds:[ids[7]]})]);
    expect(combinationMetrics(deck,p,5).anyRoute).toBe(0);
    const two=[ids[0],ids[0],...ids.slice(1,7)];
    const answer=combinationMetrics(two,p,5);
    expect(answer.anyRoute).toBeCloseTo(choose(6,3)/choose(8,5),12);
  });
  it('no additional conditions preserves P5.1 fast-path and saved plan values',()=>{
    const deck=[ids[0],ids[1],ids[2],ids[2],ids[3],ids[4]];
    const old=settings([make([ids[0]],[ids[1]])],[ids[4]]);
    const optional=settings([make([ids[0]],[ids[1]],{forbiddenIds:[],resourceIds:[],minResources:0})],[ids[4]]);
    expect(combinationMetrics(deck,old,5).anyRoute).toBeCloseTo(combinationMetrics(deck,optional,5).anyRoute!,12);
    const oldStudy=newDeckStudy({id:'source',themeId:'t',sourceId:'file',name:'유지 테스트',
      main:Array.from({length:40},(_,i)=>String(93000001+i)),extra:[],side:[]});
    oldStudy.combinations=old;
    expect(validateDeckStudy(oldStudy)).toBe(true);
    const backup={kind:'ygo_card_studio_deck_lab',schemaVersion:1,exportedAt:'2026-11-12',studies:[oldStudy]};
    expect(validateDeckBackup(backup)).toBe(true);
  });
  it('invalid and unsafe advanced requirements are rejected at storage boundaries',()=>{
    const bad=[
      make([ids[0]],[],{minResources:1,resourceIds:[]}),
      make([ids[0]],[],{minResources:4,resourceIds:[ids[1]]}),
      make([ids[0]],[],{minResources:-1,resourceIds:[ids[1]]}),
      make([ids[0]],[],{minResources:1.5,resourceIds:[ids[1]]}),
      make([ids[0]],[],{forbiddenIds:['undefined']}),
      make([ids[0]],[],{resourceIds:[ids[1],ids[1]],minResources:1}),
    ];
    for(const r of bad)expect(validateCombinationPlan(settings([r]))).toBe(false);
  });
  it('60-card boundary is exact and 61 cards give explicit unavailable status without crash',()=>{
    const deck=[ids[0],ids[1],...Array.from({length:58},(_,i)=>String(94000001+i))];
    const p=settings([make([ids[0]],[ids[1]],{resourceIds:[deck[2]],minResources:1,forbiddenIds:[deck[4]]})],[deck[6]]);
    const under=combinationMetrics(deck,p,5);
    expect(under.canCalculate).toBe(true);
    const over=combinationMetrics([...deck,ids[9]],p,5);
    expect(over.canCalculate).toBe(false);
    expect(over.limitReason).toContain('60장');
  });
});

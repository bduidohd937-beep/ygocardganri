/** P5.2 advanced opening: forbid-in-hand + minimum independent resource copies.
 * Exact count of unordered, uniformly drawn physical card slots (5 or 6).
 * Never estimates activation legality, search access, or EDOPro gameplay.
 */
import type { CombinationMetrics, CombinationPlan } from './combinationMath';

const MAX_TOTAL_STATES=70000;
function choose(n:number,k:number):number {
  if(k<0||k>n)return 0;
  let value=1;
  for(let j=1;j<=Math.min(k,n-k);j++)value=value*(n-j+1)/j;
  return value;
}
type Signature={bits:number[];risk:boolean};
const max=4;
const empty=(main:readonly string[],plan:CombinationPlan,hand:5|6,reason:string):CombinationMetrics=>({
  total:main.length,hand,canCalculate:false,limitReason:reason,anyRoute:null,noRoute:null,
  perRoute:plan.routes.map(r=>({id:r.id,label:r.label,probability:null})),
  withRisk:null,withoutRisk:null,failedWithRisk:null,riskChance:null,
});

/** Sparse DP rather than a dense 2^25 array; inputs are limited to 60 physical slots.
 * State for each route (six bits): A seen, B seen, 2 distinct A/B copies seen,
 * forbidden card seen, capped resource count (0..3). Risk is bit 24.
 */
export function advancedCombinationMetrics(main:readonly string[],plan:CombinationPlan,hand:5|6):CombinationMetrics {
  if(main.length>60)return empty(main,plan,hand,'메인 덱이 60장을 초과했습니다.');
  if(!plan.routes.length||main.length<hand)return empty(main,plan,hand,'계산할 루트가 없거나 첫 패 장수보다 덱이 작습니다.');
  const count=plan.routes.length;
  if(count>max)return empty(main,plan,hand,'루트 상한 4개를 초과했습니다.');
  const a=plan.routes.map(r=>new Set(r.a));
  const b=plan.routes.map(r=>new Set(r.b));
  const forbid=plan.routes.map(r=>new Set(r.forbiddenIds||[]));
  const resources=plan.routes.map(r=>new Set(r.resourceIds||[]));
  const need=plan.routes.map(r=>r.minResources||0);
  const risk=new Set(plan.brickIds);
  const riskBit=1<<24;
  const lookup=new Map<string,Signature>();
  const signature=(id:string):Signature=>{
    const cached=lookup.get(id);
    if(cached)return cached;
    const bits:number[]=[];
    for(let i=0;i<count;i++){
      bits.push((a[i].has(id)?1:0)|(b[i].has(id)?2:0)|
        (forbid[i].has(id)?8:0)|(resources[i].has(id)&&need[i]>0?16:0));
    }
    const out={bits,risk:risk.has(id)};lookup.set(id,out);return out;
  };
  const apply=(state:number,incident:Signature):number=>{
    let output=state;
    for(let i=0;i<count;i++){
      const shift=i*6;
      const relevant=incident.bits[i];
      if(!relevant)continue;
      const old=(state>>>shift)&63;
      const seen=old&7,hit=relevant&3;
      const nextSeen=seen|hit|(hit&&(seen&3)?4:0);
      const isForbidden=(old&8)||(relevant&8);
      const countResource=(old>>>4)&3;
      const nextCount=(relevant&16)?Math.min(need[i],countResource+1):countResource;
      const next=(nextSeen&7)|(isForbidden?8:0)|(nextCount<<4);
      output=(output&~(63<<shift))|(next<<shift);
    }
    if(incident.risk)output|=riskBit;
    return output;
  };
  // dp[k][state] is the *integer count* of k-card combinations in this state.
  const dp=Array.from({length:hand+1},()=>new Map<number,number>());
  dp[0].set(0,1);
  for(let idx=0;idx<main.length;idx++){
    const hit=signature(main[idx]);
    const upper=Math.min(hand,idx+1);
    for(let drawn=upper;drawn>=1;drawn--){
      const source=dp[drawn-1],target=dp[drawn];
      for(const [state,ways] of source){
        const next=apply(state,hit);
        target.set(next,(target.get(next)||0)+ways);
        if(target.size>MAX_TOTAL_STATES){
          return empty(main,plan,hand,'조합 상태가 안전 계산 상한을 초과했습니다. 루트/그룹을 줄여 다시 분석하세요.');
        }
      }
    }
  }
  const expected=choose(main.length,hand);
  const actual=[...dp[hand].values()].reduce((acc,n)=>acc+n,0);
  if(actual!==expected)return empty(main,plan,hand,'조합 가중치 검증에 실패했습니다. 결과를 표시하지 않습니다.');
  let any=0,withRisk=0,withoutRisk=0,failedRisk=0,riskCount=0;
  const per=Array(count).fill(0) as number[];
  for(const [state,ways] of dp[hand]){
    let successful=false;
    for(let i=0;i<count;i++){
      const status=(state>>>(6*i))&63;
      const seen=status&7,blocked=Boolean(status&8);
      const resourcesCount=(status>>>4)&3;
      const coreOK=b[i].size>0?seen===7:Boolean(seen&1);
      const yes=coreOK&&!blocked&&resourcesCount>=need[i];
      if(yes){per[i]+=ways;successful=true;}
    }
    const riskHit=risk.size>0&&Boolean(state&riskBit);
    if(riskHit)riskCount+=ways;
    if(successful){
      any+=ways;if(riskHit)withRisk+=ways;else withoutRisk+=ways;
    }else if(riskHit)failedRisk+=ways;
  }
  const ratio=(x:number)=>Math.max(0,Math.min(1,x/expected));
  return {
    canCalculate:true,total:main.length,hand,
    anyRoute:ratio(any),noRoute:ratio(expected-any),
    perRoute:plan.routes.map((r,i)=>({id:r.id,label:r.label,probability:ratio(per[i])})),
    withRisk:risk.size?ratio(withRisk):null,withoutRisk:risk.size?ratio(withoutRisk):null,
    failedWithRisk:risk.size?ratio(failedRisk):null,riskChance:risk.size?ratio(riskCount):null,
  };
}

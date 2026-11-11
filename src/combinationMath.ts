/** P5.1: exact combinational opening hands; no card-effect inference or simulation. */
export type CombinationRoute={id:string;label:string;a:string[];b:string[]};
export type CombinationPlan={routes:CombinationRoute[];brickIds:string[]};
export type CombinationMetrics={
  canCalculate:boolean;total:number;hand:5|6;
  anyRoute:number|null;noRoute:number|null;perRoute:{id:string;label:string;probability:number|null}[];
  withRisk:number|null;withoutRisk:number|null;failedWithRisk:number|null;
  riskChance:number|null;
};
export const MAX_COMBO_ROUTES=4;
const validId=(id:string)=>/^[1-9]\d{0,11}$/.test(id)&&Number.isSafeInteger(Number(id));
export const emptyCombinationPlan=():CombinationPlan=>({routes:[],brickIds:[]});
export function validateCombinationPlan(value:unknown):value is CombinationPlan{
  if(!value||typeof value!=='object'||Array.isArray(value))return false;
  const p=value as Partial<CombinationPlan>;
  if(!Array.isArray(p.routes)||p.routes.length>MAX_COMBO_ROUTES||
    !Array.isArray(p.brickIds)||p.brickIds.length>20||
    !p.brickIds.every(id=>typeof id==='string'&&validId(id))||
    new Set(p.brickIds).size!==p.brickIds.length)return false;
  const unique=new Set<string>();
  for(const r of p.routes){
    if(!r||typeof r.id!=='string'||!r.id||r.id.length>100||unique.has(r.id)||
       typeof r.label!=='string'||r.label.length>100||!Array.isArray(r.a)||!Array.isArray(r.b)||
       r.a.length<1||r.a.length>12||r.b.length>12)return false;
    unique.add(r.id);
    if(![...r.a,...r.b].every(id=>typeof id==='string'&&validId(id))||
       new Set(r.a).size!==r.a.length||new Set(r.b).size!==r.b.length)return false;
  }
  return true;
}
export function parseIdList(text:string,allowEmpty=false):string[]{
  const s=text.trim();
  if(!s){if(allowEmpty)return [];throw new Error('그룹 A에는 최소 1개 카드 ID가 필요합니다.');}
  const fields=s.split(/[\s,，;]+/).filter(Boolean);
  if(fields.some(id=>!validId(id)))throw new Error('카드 ID는 유효한 양의 정수여야 합니다. 여러 ID는 쉼표로 구분하세요.');
  const unique=[...new Set(fields)];
  if(unique.length>20)throw new Error('한 그룹에는 카드 ID를 최대 20개만 입력할 수 있습니다.');
  return unique;
}
function combinations(n:number,k:number):number{
  if(k<0||k>n)return 0;
  let result=1;
  for(let j=1;j<=Math.min(k,n-k);j++)result=result*(n-j+1)/j;
  return result;
}
/** Each physical copy is a distinct deck slot. A+B needs two separate slots even if groups overlap. */
export function combinationMetrics(main:readonly string[],plan:CombinationPlan,hand:5|6):CombinationMetrics{
  if(!validateCombinationPlan(plan))throw new Error('조합 초동 설정이 유효하지 않습니다.');
  const total=main.length;
  if(total>60)throw new Error('조합 계산은 메인 덱 60장까지 지원합니다.');
  const base={canCalculate:false,total,hand,anyRoute:null,noRoute:null,
    perRoute:plan.routes.map(r=>({id:r.id,label:r.label,probability:null})),
    withRisk:null,withoutRisk:null,failedWithRisk:null,riskChance:null} satisfies CombinationMetrics;
  if(plan.routes.length===0||total===0||hand>total)return base;

  const routes=plan.routes;
  const aSets=routes.map(r=>new Set(r.a)),bSets=routes.map(r=>new Set(r.b));
  const riskSet=new Set(plan.brickIds);
  const rCount=routes.length;
  // For each route 3 bits: A seen, B seen, and at least 2 separate physical copies from A∪B.
  const riskBit=1<<(3*rCount);
  const stateCount=1<<(3*rCount+(riskSet.size?1:0));
  const transitions=new Map<number,Uint16Array>();
  const hitOf=(card:string)=>{
    let hit=0;
    for(let i=0;i<rCount;i++){
      if(aSets[i].has(card))hit|=1<<(3*i);
      if(bSets[i].has(card))hit|=2<<(3*i);
    }
    if(riskSet.has(card))hit|=riskBit;
    return hit;
  };
  const transition=(hit:number)=>{
    const existing=transitions.get(hit);if(existing)return existing;
    const next=new Uint16Array(stateCount);
    for(let state=0;state<stateCount;state++){
      let update=state;
      for(let i=0;i<rCount;i++){
        const shift=3*i;
        const incident=(hit>>shift)&3;
        if(!incident)continue;
        const current=(state>>shift)&7;
        // The two-distinct flag is set only if a DIFFERENT physical card was seen earlier.
        const bits=current|incident|((current&3)?4:0);
        update=(update&~(7<<shift))|(bits<<shift);
      }
      if(riskSet.size&&hit&riskBit)update|=riskBit;
      next[state]=update;
    }
    transitions.set(hit,next);return next;
  };

  // Streaming elementary symmetric sums over individual card copies.
  // DP weight = number of equally likely unordered h-card hands in a state.
  const dp=new Float64Array((hand+1)*stateCount);
  dp[0]=1;
  for(let i=0;i<total;i++){
    const map=transition(hitOf(main[i]));
    const upper=Math.min(i+1,hand);
    for(let drawn=upper;drawn>=1;drawn--){
      const from=(drawn-1)*stateCount,to=drawn*stateCount;
      for(let mask=0;mask<stateCount;mask++){
        const count=dp[from+mask];
        if(count)dp[to+map[mask]]+=count;
      }
    }
  }
  const denominator=combinations(total,hand);
  const weights=new Float64Array(rCount);
  let any=0,risk=0,successRisk=0,successSafe=0,failureRisk=0;
  for(let state=0;state<stateCount;state++){
    const ways=dp[hand*stateCount+state];if(!ways)continue;
    let success=false;
    for(let i=0;i<rCount;i++){
      const seen=(state>>(3*i))&7;
      const yes=bSets[i].size?seen===7:(seen&1)!==0;
      if(yes){weights[i]+=ways;success=true;}
    }
    const hasRisk=riskSet.size>0&&(state&riskBit)!==0;
    if(hasRisk)risk+=ways;
    if(success){
      any+=ways;
      if(hasRisk)successRisk+=ways;else successSafe+=ways;
    }else if(hasRisk)failureRisk+=ways;
  }
  const probability=(count:number)=>Math.max(0,Math.min(1,count/denominator));
  return {canCalculate:true,total,hand,anyRoute:probability(any),noRoute:probability(denominator-any),
    perRoute:routes.map((r,i)=>({id:r.id,label:r.label,probability:probability(weights[i])})),
    withRisk:riskSet.size?probability(successRisk):null,
    withoutRisk:riskSet.size?probability(successSafe):null,
    failedWithRisk:riskSet.size?probability(failureRisk):null,
    riskChance:riskSet.size?probability(risk):null};
}

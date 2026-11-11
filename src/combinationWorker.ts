/// <reference lib="webworker" />
/** P5.2 combination odds run in a dedicated cancellable worker, never on the UI thread. */
import { combinationMetrics } from './combinationMath';
import type { CombinationPlan, CombinationMetrics } from './combinationMath';
type Request={main:string[];sourceMain:string[];plan:CombinationPlan;hand:5|6};
type Response={current:CombinationMetrics;original:CombinationMetrics;error?:never}|{error:string;current?:never;original?:never};
const worker=self as unknown as DedicatedWorkerGlobalScope;
worker.onmessage=(event:MessageEvent<Request>)=>{
  const {main,sourceMain,plan,hand}=event.data;
  let result:Response;
  try{
    result={current:combinationMetrics(main,plan,hand),
      original:combinationMetrics(sourceMain,plan,hand)};
  }catch(err){
    result={error:err instanceof Error?err.message:'조합 조건 분석 실패'};
  }
  worker.postMessage(result);
};

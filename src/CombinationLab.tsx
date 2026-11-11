import { useEffect,useMemo,useState } from 'react';
import { AlertTriangle, GitMerge, Plus, Save, Trash2 } from 'lucide-react';
import { combinationMetrics, emptyCombinationPlan, MAX_COMBO_ROUTES, parseIdList } from './combinationMath';
import type { CombinationPlan, CombinationRoute, CombinationMetrics } from './combinationMath';
import type { DeckStudy } from './deckMath';
import './combination-lab.css';

type Props={
  study:DeckStudy;sourceMain:string[];hand:5|6;cardNames:Map<string,string>;
  onChange:(plan:CombinationPlan)=>void;
};
const pct=(p:number|null)=>p===null?'—':(p*100).toFixed(2)+'%';
const delta=(current:number|null,base:number|null)=>{
  if(current===null||base===null)return '—';
  const d=(current-base)*100;
  return (d>0?'+':'')+d.toFixed(2)+'%p';
};
const validId=(id:string)=>/^[1-9]\d{0,11}$/.test(id)&&Number.isSafeInteger(Number(id));
const distinct=(items:readonly string[])=>[...new Set(items)];
function parseRisk(raw:string):string[]{
  const bits=raw.trim()?raw.trim().split(/[\s,，;]+/).filter(Boolean):[];
  if(bits.some(s=>!validId(s)))throw new Error('말림 카드 목록에 유효하지 않은 카드 ID가 있습니다.');
  if(new Set(bits).size>20)throw new Error('말림 카드 ID는 최대 20종까지 지정할 수 있습니다.');
  return distinct(bits);
}
function RouteEditor({route,onSave,onDelete,cardNames}:{route:CombinationRoute;onSave:(r:CombinationRoute)=>void;
  onDelete:()=>void;cardNames:Map<string,string>}){
  const [title,setTitle]=useState(route.label);
  const [a,setA]=useState(route.a.join(', '));
  const [b,setB]=useState(route.b.join(', '));
  const [forbidden,setForbidden]=useState((route.forbiddenIds||[]).join(', '));
  const [resources,setResources]=useState((route.resourceIds||[]).join(', '));
  const [minimum,setMinimum]=useState(route.minResources||0);
  const [error,setError]=useState('');
  const apply=()=>{
    try{
      const nextA=parseIdList(a),nextB=parseIdList(b,true);
      const nextForbidden=parseIdList(forbidden,true),nextResources=parseIdList(resources,true);
      if(minimum>0&&!nextResources.length)throw new Error('추가 자원 매수를 설정했다면 자원 카드 ID도 지정하세요.');
      if(minimum>0&&nextResources.some(id=>nextA.includes(id)||nextB.includes(id)))
        throw new Error('추가 자원은 A/B 초동 카드와 다른 ID여야 해. 동일 카드를 두 번 세지 않도록 자원 그룹을 분리하세요.');
      onSave({...route,label:title.trim().slice(0,100)||'이름 없는 초동 루트',
        a:nextA,b:nextB,forbiddenIds:nextForbidden,resourceIds:nextResources,minResources:minimum});
      setError('');
    }catch(e){setError(e instanceof Error?e.message:'입력 오류');}
  };
  const nameOf=(ids:string[])=>ids.length?ids.map(x=>cardNames.get(x)||x).join(', '):'지정하지 않음';
  return <div className="combo-route" data-route={route.id}>
    <div className="combo-route-heading">
      <label>루트 이름<input aria-label={route.id+' 루트 이름'} value={title} maxLength={100} onChange={e=>setTitle(e.target.value)}/></label>
      <button type="button" className="outline-button" onClick={onDelete} aria-label={route.id+' 삭제'}><Trash2 size={14}/> 삭제</button>
    </div>
    <div className="combo-route-fields">
      <label>A 그룹 · 1장 이상<input aria-label={route.id+' A 그룹'} value={a} onChange={e=>setA(e.target.value)}
        placeholder="카드 ID (쉼표로 OR 구분)"/><small>{nameOf(route.a)}</small></label>
      <span className="combo-and">AND</span>
      <label>B 그룹 · 선택<input aria-label={route.id+' B 그룹'} value={b} onChange={e=>setB(e.target.value)}
        placeholder="비워 두면 A 단독 초동"/><small>{nameOf(route.b)}</small></label>
      <button type="button" className="primary-button" onClick={apply} aria-label={route.id+' 조건 적용'}><Save size={14}/> 조건 적용</button>
    </div>
    <div className="combo-constraints">
      <label>금지 패 카드 · 있으면 이 루트 실패
        <input aria-label={route.id+' 금지 패 그룹'} value={forbidden} onChange={e=>setForbidden(e.target.value)}
          placeholder="없어야 할 카드 ID · 쉼표 구분"/>
      </label>
      <label>추가 자원 카드 · A/B와 다른 ID
        <input aria-label={route.id+' 추가 자원 그룹'} value={resources} onChange={e=>setResources(e.target.value)}
          placeholder="패 코스트 등으로 필요한 카드 ID"/>
      </label>
      <label>필요한 추가 자원 실물 매수
        <select aria-label={route.id+' 추가 자원 최소 매수'} value={minimum}
          onChange={e=>setMinimum(Number(e.target.value))}>
          <option value={0}>없음</option><option value={1}>1장 이상</option>
          <option value={2}>2장 이상</option><option value={3}>3장 이상</option>
        </select>
      </label>
    </div>
    {error&&<p className="combo-error" role="alert">{error}</p>}
    <p className="combo-guide">A+B는 서로 다른 실물 2장, 추가 자원은 A/B와 겹치지 않는 ID의 실물 카드로 별도 충족해야 해.
    금지 그룹의 카드가 1장이라도 패에 있으면 해당 루트는 실패야. <strong>수정 후 ‘조건 적용’</strong>을 눌러야 확률에 반영돼.</p>
  </div>;
}
function Ratio({title,value,baseline,helper}:{title:string;value:number|null;baseline:number|null;helper:string}){
  return <div className="combo-result">
    <span>{title}</span><strong>{pct(value)}</strong><div className="combo-meter"><i style={{width:(value===null?0:value*100)+'%'}}/></div>
    <small>{helper} · 원본 대비 {delta(value,baseline)}</small>
  </div>;
}
export default function CombinationLab({study,sourceMain,hand,cardNames,onChange}:Props){
  const plan=study.combinations||emptyCombinationPlan();
  const [choice,setChoice]=useState('');
  const [riskRaw,setRiskRaw]=useState(plan.brickIds.join(', '));
  const [riskError,setRiskError]=useState('');
  const advanced=plan.routes.some(r=>(r.forbiddenIds?.length||0)>0||(r.minResources||0)>0);
  const key=JSON.stringify([study.main,sourceMain,plan,hand]);
  const [computed,setComputed]=useState<{
    key:string;current:CombinationMetrics;original:CombinationMetrics;
  }|null>(null);
  const [calcError,setCalcError]=useState('');
  const fast=useMemo(()=>advanced?null:{
    current:combinationMetrics(study.main,plan,hand),
    original:combinationMetrics(sourceMain,plan,hand),
  },[advanced,study.main,sourceMain,plan,hand]);
  useEffect(()=>{
    if(!advanced)return;
    const worker=new Worker(new URL('./combinationWorker.ts',import.meta.url),{type:'module'});
    worker.onmessage=(event:MessageEvent<{
      current?:CombinationMetrics;original?:CombinationMetrics;error?:string;
    }>)=>{
      if(event.data.error||!event.data.current||!event.data.original){
        setCalcError(event.data.error||'조합 계산 실패');return;
      }
      setCalcError('');
      setComputed({key,current:event.data.current,original:event.data.original});
    };
    worker.onerror=()=>setCalcError('분리된 계산 스레드를 실행할 수 없습니다.');
    worker.postMessage({main:study.main,sourceMain,plan,hand});
    return()=>worker.terminate();
  },[advanced,key,study.main,sourceMain,plan,hand]);
  const result=advanced?(computed?.key===key?computed:null):fast;
  const metrics=result?.current;
  const original=result?.original;
  const options=useMemo(()=>distinct(study.main),[study.main]);
  const addRoute=()=>{
    if(!choice||plan.routes.length>=MAX_COMBO_ROUTES)return;
    const route:CombinationRoute={id:crypto.randomUUID(),label:'루트 '+(plan.routes.length+1),a:[choice],b:[]};
    onChange({...plan,routes:[...plan.routes,route]});
    setChoice('');
  };
  const updateRoute=(changed:CombinationRoute)=>onChange({...plan,routes:plan.routes.map(r=>r.id===changed.id?changed:r)});
  const removeRoute=(id:string)=>onChange({...plan,routes:plan.routes.filter(r=>r.id!==id)});
  const applyRisk=()=>{
    try{
      const next=parseRisk(riskRaw);
      onChange({...plan,brickIds:next});setRiskError('');
    }catch(e){setRiskError(e instanceof Error?e.message:'말림 카드 목록 오류');}
  };
  const fillBricks=()=>{
    const ids=distinct(study.main.filter(id=>(study.tags[id]||[]).includes('말림'))).slice(0,20);
    setRiskRaw(ids.join(', '));onChange({...plan,brickIds:ids});setRiskError('');
  };
  const unknown=distinct([...plan.routes.flatMap(r=>[...r.a,...r.b,...(r.forbiddenIds||[]),...(r.resourceIds||[])]),...plan.brickIds]).filter(id=>!study.main.includes(id));
  const named=(id:string)=>cardNames.get(id)?cardNames.get(id)+' ('+id+')':id;
  return <section className="combo-shell" aria-label="조합 초동 분석기">
    <div className="combo-head"><div><span className="micro-label">P5.2 / CONDITIONAL COMBINATIONS</span><h3>조합 초동 분석기</h3>
      <p>한 루트는 A 또는 A+B에 금지 패·추가 자원 조건을 더할 수 있어. 여러 루트는 <strong>OR</strong>로 정확하게 합쳐 중복 패를 한 번만 세.</p></div>
      <GitMerge size={22}/></div>
    <div className="combo-add">
      <label>새 초동 루트의 A 카드<select aria-label="새 루트 A 카드" value={choice} onChange={e=>setChoice(e.target.value)}>
        <option value="">메인 덱의 카드 ID 선택</option>{options.map(id=><option key={id} value={id}>{named(id)}</option>)}
      </select></label>
      <button type="button" className="outline-button" disabled={!choice||plan.routes.length>=MAX_COMBO_ROUTES} onClick={addRoute}><Plus size={15}/> 루트 추가</button>
      <span>{plan.routes.length} / {MAX_COMBO_ROUTES}개 루트</span>
    </div>
    <div className="combo-route-list">
      {plan.routes.length===0?<div className="combo-empty">아직 설정된 조합 초동이 없어. A 카드를 골라 루트를 추가하고, A+B라면 B 카드 그룹도 설정해 줘.</div>:
        plan.routes.map(route=><RouteEditor key={study.id+':'+route.id} route={route} onSave={updateRoute} onDelete={()=>removeRoute(route.id)} cardNames={cardNames}/>)}
    </div>
    <div className="combo-risk">
      <div><strong>함께 잡힐 말림 카드</strong><p>특정 카드 ID를 쉼표로 구분해 지정하면 조합 성공·실패와의 동반 확률을 계산해.</p></div>
      <label>말림 위험 카드 ID<input aria-label="조합 말림 카드 ID" value={riskRaw} onChange={e=>setRiskRaw(e.target.value)} placeholder="예: 91008601, 91008602"/></label>
      <div className="combo-risk-actions"><button type="button" className="outline-button" onClick={applyRisk}>위험 카드 적용</button>
        <button type="button" className="outline-button" onClick={fillBricks}>P5 말림 태그 가져오기</button></div>
      {riskError&&<p role="alert" className="combo-error">{riskError}</p>}
      <small>분석에 반영된 위험 ID {plan.brickIds.length}종. 태그 가져오기도 수동 편집으로 저장돼.</small>
    </div>
    {unknown.length>0&&<div className="combo-unknown" role="status"><AlertTriangle size={16}/> 메인 덱에 없는 지정 ID: {unknown.slice(0,8).join(', ')}{unknown.length>8?' 외 '+(unknown.length-8)+'종':''}. 해당 카드는 현재 확률에 기여하지 않아.</div>}
    {metrics?.canCalculate&&<div className="combo-metrics">
      <div className="combo-result-grid">
        <Ratio title="하나 이상의 루트 성립 (OR)" value={metrics.anyRoute} baseline={original?.anyRoute??null} helper={'첫 패 '+hand+'장 기준'}/>
        <Ratio title="모든 루트 실패" value={metrics.noRoute} baseline={original?.noRoute??null} helper="모든 루트 미성립"/>
        {plan.brickIds.length>0&&<>
          <Ratio title="루트 성립 + 말림 동반" value={metrics.withRisk} baseline={original?.withRisk??null} helper="성공과 위험이 같은 패에 존재"/>
          <Ratio title="루트 성립 + 말림 없음" value={metrics.withoutRisk} baseline={original?.withoutRisk??null} helper="지정 위험 카드 0장"/>
          <Ratio title="루트 실패 + 말림 동반" value={metrics.failedWithRisk} baseline={original?.failedWithRisk??null} helper="초동 없음과 위험 카드 존재"/>
          <Ratio title="말림 카드 최소 1장" value={metrics.riskChance} baseline={original?.riskChance??null} helper="루트 성립 여부와 무관"/>
        </>}
      </div>
      <div className="combo-per-route"><strong>개별 루트 확률 (중복될 수 있어 서로 더하면 안 됨)</strong>
        {metrics.perRoute.map((r,i)=><div key={r.id}><span>{r.label}</span><strong>{pct(r.probability)}</strong><small>원본 대비 {delta(r.probability,original?.perRoute[i]?.probability??null)}</small></div>)}</div>
    </div>}
    {calcError&&advanced&&<p className="combo-error" role="alert">{calcError}</p>}
    {!metrics?.canCalculate&&<p className="combo-pending" role="status">
      {study.main.length>60?'현재 메인 덱이 60장을 초과해. 조합 확률은 60장 이하에서만 계산할 수 있어.':
      plan.routes.length===0?'분석할 초동 루트를 추가하면 계산 결과가 나타나.':
      metrics?.limitReason||(!result?'복합 조건 확률 계산 중…':'루트 조건 또는 덱 장수를 확인해.')}
    </p>}
    <p className="combo-foot"><AlertTriangle size={15}/> A+B에는 실물 두 장, 별도 자원에는 A/B와 다른 ID의 실물 카드가 필요해. 금지 그룹은 해당 루트에만 적용돼. 모든 값은 첫 패의 무작위 추출 확률이야. 서치·효과 발동 조건·소환 제약·상대 견제에 따른 실제 전개 성공은 검증하지 않아.</p>
  </section>;
}

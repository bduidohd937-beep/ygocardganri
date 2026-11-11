import './audit-center.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, ChevronDown, CircleHelp, Download, FileSearch, Play, Search, ShieldAlert, Square, X } from 'lucide-react';
import type { FileCatalog } from './fileCatalog';
import { emptyFileCatalog } from './fileCatalog';
import { loadCatalog } from './fileVault';
import { runStaticAudit, MAX_AUDIT_CARDS } from './auditRunner';
import type { AuditProgress } from './auditRunner';
import type { AuditFinding, AuditReport, Severity } from './staticAnalyzer';
import { getAuditDecisions, latestDecisions, recordAuditDecision } from './auditDecisions';
import type { AuditDecision, AuditTriageStatus } from './auditDecisions';
import LuaPatchReview from './LuaPatchReview';
import EffectAlignmentPanel from './EffectAlignmentPanel';
import EffectLinkPanel from './EffectLinkPanel';

type Props={themeId?:string;passcode?:string;onOpenCard?:(themeId:string,passcode:string)=>void};
const severities:Record<Severity,string>={오류:'높음 · 구조 확인',주의:'중간 · 자료 불일치',검토:'검토 · 정적 의심'};
const MAX_VISIBLE=60;
const statuses=['검토중','조치 필요','확인됨(수동)','오탐(수동)'] as const;
function exportReport(report:AuditReport,history:AuditDecision[]){
  const json=JSON.stringify({...report,decisionEvents:history,notice:'정적 보고서. OCG 재정 적합성이나 EDOPro 실행 성공을 보증하지 않음.'},null,2);
  const url=URL.createObjectURL(new Blob([json],{type:'application/json;charset=utf-8'}));
  const link=document.createElement('a');link.href=url;link.download=`정적검수_${report.themeId}_${new Date().toISOString().slice(0,10)}.json`;link.click();
  setTimeout(()=>URL.revokeObjectURL(url),5000);
}
function FindingRow({item,decision,onDecision,onRecorded,onOpenCard}:{item:AuditFinding;decision?:AuditDecision;
  onDecision:(item:AuditFinding,status:AuditTriageStatus)=>void;onRecorded:(event:AuditDecision)=>void;onOpenCard?:Props['onOpenCard']}){
  return <article className={`audit-finding audit-finding--${item.severity==='오류'?'high':item.severity==='주의'?'medium':'review'}`}>
    <div className="audit-finding-head"><div><span className="audit-rule">{item.ruleId}</span><strong>{item.title}</strong></div><span className="audit-level">{severities[item.severity]}</span></div>
    <div className="audit-finding-meta"><span>카드 ID {item.passcode}</span><span>{item.certainty}</span><span>{item.source}</span>{item.line&&<span>{item.line}행</span>}</div>
    <div className="audit-evidence"><span>관찰된 근거</span><p>{item.evidence}</p></div>
    <p className="audit-suggestion"><CircleHelp size={14}/>{item.suggestion}</p>
    <div className="audit-finding-actions">{onOpenCard&&<button className="outline-button" onClick={()=>onOpenCard(item.themeId,item.passcode)}>카드 작업실</button>}
      <label>수동 검토 상태<select aria-label={`${item.ruleId} 검토 상태`} value={decision?.status||'미검토'} onChange={e=>onDecision(item,e.target.value as AuditTriageStatus)}>
        <option value="미검토">미검토</option>{statuses.map(s=><option key={s} value={s}>{s}</option>)}{decision?.status==='수정안 내보내기 승인(수동)'&&<option value="수정안 내보내기 승인(수동)" disabled>수정안 내보내기 승인(수동)</option>}
      </select></label>
    </div>
    {item.patch&&<LuaPatchReview key={item.key} finding={item} onRecorded={onRecorded}/>}
    {decision&&<div className="audit-decision"><strong>{decision.status}</strong><span>{new Date(decision.at).toLocaleString('ko-KR')}</span>{decision.note&&<p>판정 근거: {decision.note}</p>}</div>}
  </article>;
}
export default function AuditCenter({themeId,passcode,onOpenCard}:Props){
  const [catalog,setCatalog]=useState<FileCatalog>(emptyFileCatalog);
  const [selectedTheme,setSelectedTheme]=useState(themeId||'nocturna');
  const [loading,setLoading]=useState(true);
  const [running,setRunning]=useState(false);
  const [progress,setProgress]=useState<AuditProgress|null>(null);
  const [report,setReport]=useState<AuditReport|null>(null);
  const [history,setHistory]=useState<AuditDecision[]>([]);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [filter,setFilter]=useState<'전체'|Severity>('전체');
  const [search,setSearch]=useState('');
  const [limit,setLimit]=useState(MAX_VISIBLE);
  const aborter=useRef<AbortController|null>(null);
  const activeTheme=themeId||selectedTheme;
  useEffect(()=>{
    let alive=true;
    setLoading(true);
    Promise.all([loadCatalog(),getAuditDecisions(activeTheme)]).then(([cat,decisions])=>{
      if(alive){setCatalog(cat);setHistory(decisions);setLoading(false);}
    }).catch(e=>{if(alive){setError(e instanceof Error?e.message:'검수 자료를 읽지 못했습니다.');setLoading(false);}});
    return()=>{alive=false;aborter.current?.abort();aborter.current=null;};
  },[activeTheme]);
  useEffect(()=>{setReport(null);setError('');setNotice('');setLimit(MAX_VISIBLE);aborter.current?.abort();},[activeTheme,passcode]);
  const decisionMap=useMemo(()=>latestDecisions(history),[history]);
  const findings=useMemo(()=>report?.findings.filter(f=>{
    const q=search.trim().toLowerCase();return (filter==='전체'||f.severity===filter)&&
      (!q||[f.ruleId,f.title,f.evidence,f.passcode,f.source].join(' ').toLowerCase().includes(q));
  })||[],[report,filter,search]);
  const count=useMemo(()=>{
    const r={오류:0,주의:0,검토:0};for(const f of report?.findings||[])r[f.severity]++;return r;
  },[report]);
  const start=async()=>{
    if(running)return;
    aborter.current?.abort();const controller=new AbortController();aborter.current=controller;
    setError('');setNotice('');setRunning(true);setReport(null);setProgress({processed:0,total:0,filename:''});
    try{
      const result=await runStaticAudit(activeTheme,passcode||null,controller.signal,p=>{if(!controller.signal.aborted)setProgress(p);});
      if(!controller.signal.aborted){setReport(result);setHistory(await getAuditDecisions(activeTheme));setFilter('전체');setLimit(MAX_VISIBLE);}
    }catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:'정적 분석 중 오류');}
    finally{if(aborter.current===controller){aborter.current=null;setRunning(false);}}
  };
  const cancel=()=>{aborter.current?.abort();aborter.current=null;setRunning(false);setProgress(null);setNotice('분석을 중단했어. 승인 원문이나 원본 파일은 변경되지 않았어.');};
  const decision=async(item:AuditFinding,status:AuditTriageStatus)=>{
    if(running)return;
    let note='';
    if(status==='확인됨(수동)'||status==='오탐(수동)'){
      const entered=window.prompt(`${item.ruleId} — '${status}'로 기록할 근거를 적어줘. OCG/EDOPro 검증완료와는 별개야.`);
      if(entered===null)return;note=entered.trim();if(!note){setError('수동 확인 또는 오탐 판정에는 근거가 필요해.');return;}
    }
    try{const event=await recordAuditDecision({key:item.key,themeId:item.themeId,passcode:item.passcode,status,note});setHistory(h=>[...h,event]);setError('');}
    catch(e){setError(e instanceof Error?e.message:'검토 이력 저장 실패');}
  };
  return <section className={`audit-root ${passcode?'audit-root--inline':''}`}>
    <header className="audit-heading"><div><span className="micro-label">P4.3 / NUMBERED EFFECT ↔ LUA CALLBACK</span>
      <h2>{passcode?`카드 ${passcode} · 정적 오류 분석`:'정적 오류 분석기'}</h2>
      <p>CDB 번호 효과 ①·②·③을 Lua 등록 객체·콜백 처리와 대조해. e1이 ①이라고 가정하지 않고 고유 근거가 없으면 판별 불가로 표시해. <strong>Lua 실행이나 규칙 적합성 인증은 하지 않아.</strong></p>
    </div><div className="audit-header-icon"><ShieldAlert size={25}/></div></header>
    <div className="audit-toolbar">{!themeId&&<label>검사할 테마<select aria-label="정적 분석 대상 테마" disabled={running} value={selectedTheme} onChange={e=>setSelectedTheme(e.target.value)}>{catalog.themes.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>}
      <div className="audit-run-actions"><button type="button" className="primary-button" disabled={running||loading} onClick={()=>void start()}><Play size={14}/> {running?'분석 중...':passcode?'이 카드 분석 실행':'선택한 테마 정적 분석'}</button>
      {running&&<button type="button" className="outline-button" onClick={cancel}><Square size={13}/> 중단</button>}
      {report&&<button className="outline-button" onClick={()=>exportReport(report,history)}><Download size={14}/> JSON 보고서</button>}</div>
    </div>
    {loading&&<p className="audit-message">원본 파일 색인 확인 중...</p>}
    {running&&<div className="audit-progress" role="status"><span>검사 입력 수집 {progress?.processed||0} / {progress?.total||'—'} · {progress?.filename||'준비 중'}</span><div><i style={{width:progress?.total?`${Math.floor((progress.processed/progress.total)*100)}%`:'4%'}}/></div></div>}
    {error&&<p role="alert" className="audit-error"><AlertCircle size={15}/>{error}</p>}
    {notice&&<p role="status" className="audit-message">{notice}</p>}
    {!report&&!running&&!loading&&<div className="audit-empty"><FileSearch size={29}/><strong>아직 실행한 정적 분석이 없어</strong>
      <p>선택한 테마의 CDB·Lua·승인 원문을 읽고 문제 후보를 생성해. 검사 후에도 어떤 카드도 자동으로 승인·수정하지 않아.</p></div>}
    {report&&<>
      <div className="audit-coverage" role="status"><strong>검사 카드 {report.scannedCards} / {report.totalCards}종</strong><span>규칙 엔진 {report.engine} · {new Date(report.createdAt).toLocaleString('ko-KR')}</span></div>
      {report.truncated&&<p className="audit-error"><AlertTriangle size={15}/>성능 보호를 위해 첫 {MAX_AUDIT_CARDS}종만 검사했어. 나머지 카드는 미검사 상태이며 검증완료가 아니야.</p>}
      <EffectLinkPanel key={report.createdAt+'-links'} links={report.effectLinks||[]} onOpenCard={onOpenCard}/>
      <EffectAlignmentPanel key={report.createdAt} comparisons={report.comparisons||[]} onOpenCard={onOpenCard}/>
      <div className="audit-metrics">{(['오류','주의','검토'] as Severity[]).map(severity=><button className={filter===severity?'is-active':''} key={severity} onClick={()=>{setFilter(severity);setLimit(MAX_VISIBLE);}}><span>{severities[severity]}</span><strong>{count[severity]}</strong></button>)}<button className={filter==='전체'?'is-active':''} onClick={()=>setFilter('전체')}><span>전체 탐지</span><strong>{report.findings.length}</strong></button></div>
      <div className="audit-search"><Search size={15}/><input aria-label="분석 항목 검색" placeholder="규칙 코드·카드 ID·근거 검색" value={search} onChange={e=>{setSearch(e.target.value);setLimit(MAX_VISIBLE);}}/></div>
      {!findings.length?<div className="audit-empty"><CheckCircle2 size={26}/><strong>현재 조건의 정적 발견 항목이 없어</strong><p>오류가 0건이어도 OCG·EDOPro 실제 검증이 통과했다는 의미는 아니야.</p></div>:<div className="audit-findings">{findings.slice(0,limit).map(item=><FindingRow key={item.key} item={item} decision={decisionMap.get(item.key)} onDecision={(finding,status)=>void decision(finding,status)} onRecorded={event=>setHistory(h=>[...h,event])} onOpenCard={onOpenCard}/>)}</div>}
      {findings.length>limit&&<button className="outline-button" onClick={()=>setLimit(n=>n+MAX_VISIBLE)}>다음 {MAX_VISIBLE}건 보기 ({limit}/{findings.length}) <ChevronDown size={14}/></button>}
      <p className="audit-disclaimer"><X size={13}/>문자열·파일 연결을 보는 정적 검사야. 의식/펜듈럼/융합/엑시즈 등 실제 소환 절차와 룰 판단은 EDOPro 테스트 및 사람이 검수해야 해. 수동 상태 기록은 승인·검증완료 판정으로 연결되지 않아.</p>
    </>}
  </section>;
}
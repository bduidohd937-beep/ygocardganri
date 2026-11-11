import { useState } from 'react';
import { ArrowRight, ChevronDown, FileCode2, Link2Off, Route, ShieldAlert } from 'lucide-react';
import type { EffectLinkReport, LinkStatus, LinkStepStatus } from './effectLinking';
import './effect-linking.css';

type Props={ links:EffectLinkReport[]; onOpenCard?: (themeId:string,passcode:string)=>void };
const statusName:Record<LinkStatus,string>={
  '고유 처리 근거 후보':'처리 근거로 연결 후보',
  '단일 구조 후보':'단일 구조 후보',
  '판별 불가':'연결 미확정',
  '등록 이펙트 미발견':'등록 객체 미발견',
};
const stepName:Record<LinkStepStatus,string>={
  '구조 발견':'구조 발견','검토 필요':'검토 필요','판별 불가':'판별 불가','문구 미인식':'문구 미인식',
};
const stepClass=(s:LinkStepStatus)=>s==='검토 필요'?'review':s==='구조 발견'?'found':'unknown';
export default function EffectLinkPanel({links,onOpenCard}:Props){
  const [limit,setLimit]=useState(6);
  if(!links.length)return null;
  const assigned=links.reduce((total,report)=>total+report.effects.filter(e=>e.luaVariable).length,0);
  const unmatched=links.reduce((total,report)=>total+report.effects.filter(e=>!e.luaVariable).length,0);
  return <section className="link-root" aria-label="효과 번호별 Lua 연결 분석">
    <header className="link-heading"><div><span className="micro-label">P4.3 / EFFECT NUMBER ↔ CALLBACK GRAPH</span>
      <h3>번호 효과별 Lua 연결 지도</h3><p>①·②·③ 원문을 Lua 이펙트 객체·콜백과 개별 비교해. <strong>e1이 ①이라는 가정은 하지 않아.</strong></p></div>
      <Route size={22}/></header>
    <div className="link-metrics"><span>고유 근거·단일 후보 <strong>{assigned}</strong></span><span>연결 미확정 <strong>{unmatched}</strong></span><span>실행 검증 <strong>수행 안 함</strong></span></div>
    <div className="link-list">{links.slice(0,limit).map(report=><article className="link-card" key={report.key}>
      <div className="link-card-head"><div><strong><FileCode2 size={15}/>{report.filename}</strong><small>카드 ID {report.passcode} · {report.sourceLabel}</small></div>
        {onOpenCard&&<button className="outline-button" onClick={()=>onOpenCard(report.themeId,report.passcode)}>카드 작업실</button>}</div>
      <p className="link-coverage">{report.coverage}</p>
      {report.warning.length>0&&<div className="link-warnings">{report.warning.map((message,i)=><p key={i}><ShieldAlert size={13}/>{message}</p>)}</div>}
      {!report.effects.length&&<p className="link-no-source"><Link2Off size={16}/>번호 효과를 비교할 기준이 아직 없어.</p>}
      {report.effects.map((part,i)=><section className="link-effect" key={report.key+':'+part.number+':'+i}>
        <div className="link-effect-top"><span className="link-effect-index">{part.number}</span><div className="link-effect-text">{part.text||'원문 미입력'}</div>
          <span className={'link-status link-status--'+(part.status==='고유 처리 근거 후보'?'matched':part.status==='단일 구조 후보'?'single':'uncertain')}>{statusName[part.status]}</span></div>
        <div className="link-mapping"><div><small>원문 효과</small><strong>{part.number}</strong></div><ArrowRight size={16} color="var(--muted,#a5a5a5)"/><div><small>Lua 등록 객체</small>
          <strong className="link-code">{part.luaVariable||'미확정'}</strong>{part.registerLine&&<span>등록 {part.registerLine}행</span>}</div>
          <div><small>처리 콜백</small><strong className="link-code">{part.operationCallback||'미확인'}</strong></div></div>
        <p className="link-reason">{part.actionEvidence}</p>
        <div className="link-stage-grid">{part.steps.map(s=><div className="link-stage" key={s.stage}>
          <div><b>{s.stage}</b><span className={'link-stage-status link-stage-status--'+stepClass(s.status)}>{stepName[s.status]}</span></div>
          <p>{s.textEvidence}</p><small>{s.luaEvidence}{s.line?' · '+s.line+'행':''}</small>
        </div>)}</div>
      </section>)}
      {report.unassignedLua.length>0&&<p className="link-unassigned">원문 번호와 연결하지 않은 Lua 등록 객체: {report.unassignedLua.join(' · ')}</p>}
      <footer>처리 함수 호출이 유일하게 대응해도 카드 발동 조건·코스트·처리의 OCG 적합성을 보증하지 않아. 이 결과로 원본이나 승인 원문을 변경하지 않아.</footer>
    </article>)}</div>
    {links.length>limit&&<button className="outline-button" onClick={()=>setLimit(n=>n+6)}>
      다음 6개 Lua 원본 보기 ({Math.min(limit,links.length)}/{links.length}) <ChevronDown size={14}/></button>}
  </section>;
}
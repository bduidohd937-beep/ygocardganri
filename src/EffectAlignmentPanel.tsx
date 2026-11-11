import { useState } from 'react';
import { ChevronDown, FileCode2, FileText, Layers3 } from 'lucide-react';
import type { EffectAlignment, AlignmentStatus } from './effectAlignment';
import './effect-alignment.css';

type Props = { comparisons: EffectAlignment[]; onOpenCard?: (themeId:string,passcode:string)=>void };
const labels:Record<AlignmentStatus,string>={
  '구조 발견':'코드 구조 발견', '검토 필요':'구현 검토 필요', '판별 불가':'판별 불가', '문구 없음':'문구 미인식',
};
export default function EffectAlignmentPanel({comparisons,onOpenCard}:Props){
  const [limit,setLimit]=useState(12);
  if(!comparisons.length)return null;
  const reviews=comparisons.reduce((count,c)=>count+c.steps.filter(s=>s.status==='검토 필요').length,0);
  const unknown=comparisons.reduce((count,c)=>count+c.steps.filter(s=>s.status==='판별 불가').length,0);
  return <section className="align-root" aria-label="효과 원문과 Lua 구조 비교">
    <header className="align-head"><div><span className="micro-label">P4.2 / EFFECT TEXT ↔ LUA AST</span>
      <h3>효과 단계별 연결 비교</h3><p>발동 조건·코스트·대상·효과 처리를 카드 효과 문구와 Lua AST에 대조해. <strong>구조 발견은 효과 동작 검증이 아니야.</strong></p></div>
      <div className="align-head-count"><strong>{comparisons.length}</strong><span>Lua 원본별 비교</span></div>
    </header>
    <div className="align-overview"><span>구현 검토 후보 <strong>{reviews}</strong></span><span>판별 불가 단계 <strong>{unknown}</strong></span><span>기존 파일·승인 원문 <strong>변경 없음</strong></span></div>
    <div className="align-list">{comparisons.slice(0,limit).map(item=><article className="align-item" key={item.key}>
      <div className="align-item-header"><div><strong><FileCode2 size={15}/> {item.filename}</strong><small>카드 ID {item.passcode} · 비교 기준: {item.sourceLabel}</small></div>
        {onOpenCard&&<button type="button" className="outline-button" onClick={()=>onOpenCard(item.themeId,item.passcode)}>카드 작업실</button>}</div>
      <div className="align-source"><FileText size={14}/><span>원문 발췌</span><p>{item.originalSnippet||'원문 미확인'}</p></div>
      <div className="align-scope"><Layers3 size={14}/><span>검사 범위:</span> {item.coverage}</div>
      <div className="align-table" role="table" aria-label={`카드 ${item.passcode} 효과 단계별 비교`}>
        <div className="align-table-head" role="row"><span role="columnheader">효과 단계</span><span role="columnheader">카드 원문 근거</span><span role="columnheader">Lua에서 관찰한 구조</span><span role="columnheader">판정</span></div>
        {item.steps.map(s=><div className="align-table-row" role="row" key={s.stage}>
          <strong role="cell">{s.stage}</strong><span role="cell">{s.textEvidence}</span><span role="cell">{s.luaEvidence}{s.line?' · '+s.line+'행':''}</span>
          <span role="cell"><em className={'align-status align-status--'+(s.status==='검토 필요'?'review':s.status==='구조 발견'?'seen':'unknown')}>{labels[s.status]}</em></span>
        </div>)}
      </div>
      <footer>기준 원문과 코드의 문구·호출을 전체 카드 범위에서 비교해. ①②③ 각각과 e1/e2 등을 일대일로 확정하지 않으며, 헬퍼·동적 등록은 판별 불가로 처리할 수 있어.</footer>
    </article>)}</div>
    {comparisons.length>limit&&<button className="outline-button" onClick={()=>setLimit(n=>n+12)}>다음 12건 보기 ({Math.min(limit,comparisons.length)}/{comparisons.length}) <ChevronDown size={14}/></button>}
  </section>;
}
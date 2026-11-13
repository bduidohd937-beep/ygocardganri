import {
  ArrowRight, BookOpen, CheckCircle2, Clock3, CreditCard,
  Database, FileText, FlaskConical, Image, Layers3,
  ShieldCheck, Swords
} from 'lucide-react';
import type { Card, StudioData } from './data';
import type { CSSProperties } from 'react';
import './studio-v2-home.css';
import type { SharedCatalog } from './sharedCatalog';
import type { ProjectOption, StudioScope } from './studioV2Model';

type Destination='home'|'generic'|'themes'|'cards'|'worlds'|'reviews'|'decks'|'shared'|'artlab'|'cardmaker'|'designlab'|'arena'|'history';
type Props={
  data:StudioData;
  counts:{pending:number;reviewing:number;unknown:number};
  pendingCards:Card[];
  scope:StudioScope;
  projects:ProjectOption[];
  sharedCatalog:SharedCatalog|null;
  recentPages:{key:Destination;name:string}[];
  onNavigate:(page:Destination)=>void;
  onScopeChange:(scope:StudioScope)=>void;
  onOpenWorld:(id:string)=>void;
  onOpenCard:(id:string)=>void;
};
const SHORTCUTS=[
  {page:'generic',title:'범용 카드 도감',detail:'ID · 효과 · 채택 · 실전 검증',icon:BookOpen},
  {page:'cards',title:'카드 제작',detail:'카드 원문 · 설계 · 승인',icon:Layers3},
  {page:'artlab',title:'이미지 연구소',detail:'임시 원화 · 일괄 생성',icon:Image},
  {page:'cardmaker',title:'카드 렌더러',detail:'카드 프레임 · 이미지 출력',icon:CreditCard},
  {page:'decks',title:'덱 연구실',detail:'YDK · 초동률 · 분석',icon:FlaskConical},
  {page:'arena',title:'AI 검증 관제실',detail:'대전 기록 · MSG16 추적',icon:Swords},
] as const;
export default function StudioHome({
  data,counts,pendingCards,scope,projects,sharedCatalog,recentPages,
  onNavigate,onScopeChange,onOpenWorld,onOpenCard
}:Props){
  const selected=projects.find(p=>p.key===scope)??projects[0];
  const sharedCards=selected.kind==='shared'?sharedCatalog?.cards.filter(c=>c.theme.trim()===selected.name):[];
  const isGeneral=selected.kind==='all';
  const isNocturna=selected.kind==='world';
  const recentEdits=data.history.slice(0,3);
  const unread=counts.pending+counts.reviewing;
  return <div className="v2-home">
    <div className="v2-eyebrow"><span className="v2-live"/> STUDIO WORKSPACE <span className="v2-eyebrow-line"/> UI V2.0</div>
    <section className="v2-hero">
      <div className="v2-hero-copy">
        <div className="v2-hero-index">{isGeneral?'ONE CREATIVE WORKSPACE':isNocturna?'WORLD BUILDING / NOCTURNA':'SHARED CARD CATALOG / THEME'}</div>
        <h1>{isGeneral?'YGO STUDIO':selected.name}</h1>
        <p>{isGeneral?'카드 제작부터 일러스트·덱 연구·검증 기록까지. 흩어진 작업실을 하나의 공간에서 관리하세요.':selected.description+' · 현재 선택은 작업 화면의 탐색 범위이며, 도구 사이의 데이터를 자동 동기화하지 않습니다.'}</p>
        <div className="v2-hero-actions">
          <button className="primary-button" onClick={()=>onNavigate('generic')}><BookOpen size={16}/> 범용 카드 도감 바로 열기</button>
          <button className="primary-button" onClick={()=>onNavigate(isGeneral?'cards':isNocturna?'themes':'shared')}>{isGeneral?'카드 작업 시작':isNocturna?'세계관 작업 열기':'공통 카드 목록 열기'} <ArrowRight size={15}/></button>
          <button className="outline-button" onClick={()=>onNavigate('shared')}>공통 카드·덱 보관함 <Database size={15}/></button>
        </div>
        <div className="v2-hero-foot">현재 범위: <strong>{selected.name}</strong> · 원본 카드·검증 상태 보존</div>
      </div>
      <div className="v2-hero-graphic" aria-hidden="true"><div className="v2-graphic-ring ring-1"/><div className="v2-graphic-ring ring-2"/><div className="v2-graphic-ring ring-3"/><div className="v2-mark">✣</div><span>CARD / ART / DECK / AUDIT</span></div>
    </section>
    <div className="v2-overview">
      <div><span>등록된 프로젝트 범위</span><strong>{projects.length-1}</strong><small>실제 데이터가 확인된 항목</small></div>
      <div><span>녹투르나 설계 카드</span><strong>{data.cards.length}</strong><small>미완성 문서 포함</small></div>
      <div><span>공통 카드 ID</span><strong>{sharedCatalog?.cards.length??0}</strong><small>현재 브라우저 메타 보관함</small></div>
      <div><span>검토 중인 항목</span><strong>{unread}</strong><small>미승인 제안 + 검토 중인 카드</small></div>
    </div>
    <div className="v2-section-heading"><div><span>01 / WORKSPACES</span><h2>바로 작업하기</h2></div><p>기존 기능은 유지하고 입구를 간결하게 정리했습니다.</p></div>
    <div className="v2-shortcut-grid">
      {SHORTCUTS.map(({page,title,detail,icon:Icon})=><button key={page} className="v2-shortcut" onClick={()=>onNavigate(page)}>
        <span className="v2-shortcut-icon"><Icon size={22} strokeWidth={1.65}/></span>
        <strong>{title}</strong><small>{detail}</small><ArrowRight className="v2-shortcut-arrow" size={17}/>
      </button>)}
    </div>
    <div className="v2-section-heading"><div><span>02 / PROJECTS</span><h2>프로젝트 탐색</h2></div><button className="v2-text-link" onClick={()=>onScopeChange('all')}>전체 범위 보기 <ArrowRight size={15}/></button></div>
    <div className="v2-project-list">
      {projects.filter(p=>p.kind!=='all').slice(0,8).map(p=><button key={p.key} onClick={()=>onScopeChange(p.key)} className={'v2-project-card '+(scope===p.key?'v2-project-card--active':'')}>
        <span className="v2-project-symbol">{p.kind==='world'?'✧':'◈'}</span><span className="v2-project-content"><strong>{p.name}</strong><small>{p.kind==='world'?'5개 세계관 · 카드 설계 기록':'공통 보관함 카드 메타정보'}</small></span><span className="v2-project-total">{p.cards}장</span><ArrowRight size={15}/>
      </button>)}
      {projects.length===2&&<div className="v2-project-note">다른 테마를 추가하려면 공통 카드·덱 보관함에서 숫자 카드 ID 자료를 가져오세요. 미등록 테마는 프로젝트로 표시하지 않습니다.</div>}
    </div>
    {isGeneral&&<section className="v2-realm-section">
      <div className="v2-section-heading"><div><span>FEATURED WORLD / NOCTURNA</span><h2>종언성서 · 다섯 세계</h2></div><button className="v2-text-link" onClick={()=>onScopeChange('nocturna')}>프로젝트 자세히 <ArrowRight size={15}/></button></div>
      <div className="realm-grid">{data.worlds.map((w,i)=><button className="realm-tile" key={w.id} style={{'--realm':w.accent} as CSSProperties} onClick={()=>onOpenWorld(w.id)}>
        <div className="realm-art"><span className="realm-monogram">{['Ⅰ','Ⅱ','Ⅲ','Ⅳ','Ⅴ'][i]??'✧'}</span><span className="realm-engrave">{w.shortLabel}</span></div>
        <div className="realm-detail"><span>WORLD / {String(i+1).padStart(2,'0')}</span><strong>{w.name}</strong><small>{w.mechanism}</small><span className="realm-footer">계보 열기 <ArrowRight size={14}/></span></div>
      </button>)}</div>
    </section>}
    {!isGeneral&&<section className="v2-scope-detail">
      <div className="v2-panel-head"><div><span>SELECTED PROJECT</span><h3>{selected.name} · 확인된 자료</h3></div><button onClick={()=>onNavigate(isNocturna?'themes':'shared')}>자세히 보기 <ArrowRight size={15}/></button></div>
      {isNocturna?<div className="v2-world-links">{data.worlds.map((w,i)=><button onClick={()=>onOpenWorld(w.id)} key={w.id}><span>0{i+1}</span><strong>{w.name}</strong><small>{w.mechanism}</small><ArrowRight size={14}/></button>)}</div>:
       <div className="v2-shared-preview">{sharedCards?.slice(0,6).map(c=><div key={c.id}><span>{c.id}</span><strong>{c.name}</strong></div>)}{!sharedCards?.length&&<p>현재 브라우저의 해당 테마 카드가 없습니다.</p>}</div>}
    </section>}
    <div className="v2-bottom-panels">
      <section className="v2-list-panel">
        <div className="v2-panel-head"><div><span>03 / RECENT</span><h3>최근 작업</h3></div><Clock3 size={17}/></div>
        {recentPages.length>0?recentPages.slice(0,4).map(p=><button className="v2-list-item" key={p.key} onClick={()=>onNavigate(p.key)}><Clock3 size={16}/><span>{p.name}</span><ArrowRight size={15}/></button>):<p className="v2-empty">방문한 작업실이 없습니다. 위 작업실을 열면 이곳에 최근 방문 기록이 나타납니다.</p>}
        {recentEdits.length>0&&<div className="v2-recent-edits"><strong>최근 기록된 변경</strong>{recentEdits.map(e=><div key={e.id}><FileText size={14}/><span>{e.action} · {e.entityName}</span></div>)}</div>}
      </section>
      <section className="v2-list-panel">
        <div className="v2-panel-head"><div><span>04 / REVIEW</span><h3>검토가 필요한 작업</h3></div><button onClick={()=>onNavigate('reviews')}>검수 센터 <ArrowRight size={14}/></button></div>
        {pendingCards.length>0?pendingCards.slice(0,4).map(c=><button className="v2-list-item" onClick={()=>onOpenCard(c.id)} key={c.id}><ShieldCheck size={17}/><span>{c.name||'미확인 카드명'} <small>미승인 제안 {c.proposals.filter(p=>p.status==='미승인').length}건</small></span><ArrowRight size={15}/></button>):<div className="v2-review-clear"><CheckCircle2 size={20}/><div><strong>대기 중인 효과 제안 없음</strong><small>검토 중인 카드 {counts.reviewing}장 · 미확인 필드는 기존 카드 작업실에서 별도 확인</small></div></div>}
      </section>
    </div>
    <div className="v2-bottom-note"><BookOpen size={16}/><span>이 화면은 원본 데이터에 기록된 정보만 표시합니다. 프로젝트 전환은 대시보드 탐색 및 공통 카드 목록 검색을 위한 기능이며, 독립 도구의 수정 사항은 자동 동기화되지 않습니다.</span></div>
  </div>;
}

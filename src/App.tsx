import { lazy, Suspense, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import type * as React from 'react';
import type { FormEvent, ReactNode } from 'react';
import {
  Activity, ArrowDownRight, ArrowLeft, ArrowRight, BookOpen, Check, CheckCircle2,
  ChevronDown, ChevronRight, Clock3, Database, Download,
  FileQuestion, FileText, Filter, FolderOpen, GitCompareArrows,
  History, Layers3, LayoutGrid, Menu, Plus, Save, Search,
  Settings2, ShieldAlert, ShieldCheck, SlidersHorizontal, Upload,
  X, AlertCircle, Info, CircleHelp
} from 'lucide-react';
import {
  APPROVAL_OPTIONS, BALANCE_OPTIONS, ENGINE_OPTIONS, PHASES, RULE_OPTIONS,
  countUnknown, displayName, createInitialData
} from './data';
import type { Card, StudioData, World } from './data';
import type { CardPatch } from './logic';
import { createCard, decideEffect, editCard, exportJson, proposeEffect, updateWorldStage, validateBackup } from './logic';
import { loadWorkspace, saveWorkspace } from './storage';
import type { StorageMode } from './storage';
import { createCoalescedSaver } from './autosave';
import type { SavePhase } from './autosave';
import FileCenter from './FileCenter';
import ImportedCardStudio from './ImportedCardStudio';
import AuditCenter from './AuditCenter';
const DeckLab=lazy(()=>import('./DeckLab'));
import { loadAllImportedRecords, restoreWorkbenchBackup, validateWorkbenchBackup } from './workbenchVault';
import { buildCardIndex, searchCardIndex, visibleSlice, CARD_PAGE_SIZE, HISTORY_PAGE_SIZE } from './performance';

type Page = 'home'|'themes'|'cards'|'studio'|'worlds'|'reviews'|'audit'|'files'|'decks'|'history'|'settings';
type Notice = { text:string; kind:'success'|'error'|'info' };
const NAV: { key:Page; name:string; group:'workspace'|'tools'; icon: typeof LayoutGrid }[] = [
  {key:'home',name:'대시보드',group:'workspace',icon:LayoutGrid},
  {key:'themes',name:'테마 라이브러리',group:'workspace',icon:BookOpen},
  {key:'cards',name:'카드 라이브러리',group:'workspace',icon:Layers3},
  {key:'worlds',name:'세계관 · 진화 계보',group:'workspace',icon:GitCompareArrows},
  {key:'reviews',name:'검수 센터',group:'tools',icon:ShieldCheck},
  {key:'audit',name:'오류 분석',group:'tools',icon:ShieldAlert},
  {key:'files',name:'파일 센터',group:'tools',icon:FolderOpen},
  {key:'decks',name:'덱 연구실',group:'tools',icon:Activity},
  {key:'history',name:'변경 이력',group:'tools',icon:History},
  {key:'settings',name:'백업 · 설정',group:'tools',icon:Settings2},
];
const UNKNOWN='미확인';
const IS_PENDING = (card:Card)=>card.proposals.some(p=>p.status==='미승인');
const byDate = (s:string)=> new Date(s).toLocaleString('ko-KR',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});
const worldOf = (data:StudioData,card:Card)=>data.worlds.find(w=>w.id===card.worldId);
const cardPhase = (c:Card)=>c.phase===-1?'공통 기본형':c.phase===0?'레벨 4 · 첫 고난':c.phase===1?'1차 진화 · 극복':'2차 진화 · 지배';

function Status({value,small=false}:{value:string;small?:boolean}){
  const kind=['승인','확정','검증완료','통과','충돌 없음 확인'].includes(value)?'positive':
    ['검토중','초안','진행중','미승인','수정 필요'].includes(value)?'warning':
    ['반려','충돌 확인'].includes(value)?'negative':'neutral';
  return <span className={`status status--${kind} ${small?'status--small':''}`}><i />{value||UNKNOWN}</span>;
}

function SectionTitle({index,title,aside}:{index:string;title:string;aside?:string}){
  return <div className="section-title"><div><span className="section-index">{index}</span><h2>{title}</h2></div>{aside&&<span className="section-aside">{aside}</span>}</div>;
}

function ArtSlot({card,world,large=false}:{card:Card;world?:World;large?:boolean}){
  return <div className={`art-slot ${large?'art-slot--large':''}`} style={{'--art-accent':world?.accent??'#8A8691'} as React.CSSProperties}>
    {card.artUrl ? <img src={card.artUrl} loading={large ? 'eager' : 'lazy'} decoding="async" alt={`${displayName(card)} 일러스트`} onError={e=>{e.currentTarget.style.display='none';}} /> :
      <div className="art-empty"><span className="art-orbit art-orbit--one"/><span className="art-orbit art-orbit--two"/>
        <span className="art-symbol">{card.worldId==='common'?'✦':world?.shortLabel.slice(0,1)??'?'}</span>
        <div className="art-empty-label">ILLUSTRATION<br/>NOT ATTACHED</div>
      </div>}
    <span className="art-phase">{card.phase>=0?`0${card.phase+1} / ${['ORIGIN','ASCEND','DOMINION'][card.phase]}`:'00 / ORIGIN'}</span>
  </div>;
}

function Empty({title,detail,icon}:{title:string;detail?:string;icon?:ReactNode}){
  return <div className="empty-state">{icon??<FileQuestion size={26}/>}<strong>{title}</strong>{detail&&<p>{detail}</p>}</div>;
}

function MiniMetric({label,value,foot,accent}:{label:string;value:string|number;foot:string;accent?:boolean}){
  return <div className="metric"><span className="micro-label">{label}</span><div className={`metric-number ${accent?'metric-number--accent':''}`}>{value}</div><span className="metric-foot">{foot}</span></div>;
}

export default function App(){
  const [data,setData]=useState<StudioData|null>(null);
  const [storageMode,setStorageMode]=useState<StorageMode>('IndexedDB');
  const [page,setPage]=useState<Page>('home');
  const [selectedId,setSelectedId]=useState<string>('blood-0');
  const [importedCard,setImportedCard]=useState<{themeId:string;passcode:string}|null>(null);
  const [selectedWorld,setSelectedWorld]=useState('blood');
  const [search,setSearch]=useState('');
  const [worldFilter,setWorldFilter]=useState('all');
  const [stageFilter,setStageFilter]=useState('all');
  const [notice,setNotice]=useState<Notice|null>(null);
  const [mobileNav,setMobileNav]=useState(false);
  const [activeTab,setActiveTab]=useState<'effect'|'lineage'|'history'>('effect');
  const [editBasic,setEditBasic]=useState(false);
  const [draft,setDraft]=useState<CardPatch>({});
  const [proposalText,setProposalText]=useState('');
  const [proposalMemo,setProposalMemo]=useState('');
  const [worldDraft,setWorldDraft]=useState<{lore:string;design:string;source:string;status:'미확인'|'제안'|'검토중'|'확정'}|null>(null);
  const [selectedPhase,setSelectedPhase]=useState<0|1|2>(0);
  const [saveError,setSaveError]=useState('');
  const [savePhase,setSavePhase]=useState<SavePhase>('saved');
  const [cardLimit,setCardLimit]=useState(CARD_PAGE_SIZE);
  const [historyLimit,setHistoryLimit]=useState(HISTORY_PAGE_SIZE);
  const deferredSearch=useDeferredValue(search);
  const filePicker=useRef<HTMLInputElement>(null);
  const workbenchPicker=useRef<HTMLInputElement>(null);
  const globalSearch=useRef<HTMLInputElement>(null);
  const hasLoaded=useRef(false);
  const storageModeRef=useRef(storageMode);
  storageModeRef.current=storageMode;
  const saverRef=useRef<ReturnType<typeof createCoalescedSaver<StudioData>>|null>(null);
  if(!saverRef.current) saverRef.current=createCoalescedSaver<StudioData>(
    snapshot=>saveWorkspace(snapshot,storageModeRef.current),450,
    (phase)=>{setSavePhase(phase);setSaveError(phase==='error'?'자동 저장에 실패했습니다. JSON으로 백업하세요.':'');}
  );

  useEffect(()=>{let alive=true;loadWorkspace().then(result=>{if(!alive)return;setData(result.data);setStorageMode(result.mode);hasLoaded.current=true;}).catch(()=>{
    if(alive){setData(createInitialData());setStorageMode('localStorage');hasLoaded.current=true;setNotice({text:'로컬 저장소를 사용할 수 없습니다. JSON 백업을 활용하세요.',kind:'error'});}
  });return()=>{alive=false;};},[]);
  useEffect(()=>{if(!data||!hasLoaded.current)return;
    saverRef.current?.schedule(data);
  },[data,storageMode]);
  useEffect(()=>{
    const flushOnHidden=()=>{if(document.visibilityState==='hidden')void saverRef.current?.flush();};
    const flushOnPageHide=()=>{void saverRef.current?.flush();};
    document.addEventListener('visibilitychange',flushOnHidden);
    window.addEventListener('pagehide',flushOnPageHide);
    return()=>{document.removeEventListener('visibilitychange',flushOnHidden);window.removeEventListener('pagehide',flushOnPageHide);void saverRef.current?.flush();};
  },[]);
  useEffect(()=>{function keys(e:KeyboardEvent){if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();globalSearch.current?.focus();}if(e.key==='Escape')setMobileNav(false);}document.addEventListener('keydown',keys);return()=>document.removeEventListener('keydown',keys);},[]);
  useEffect(()=>{if(!notice)return;const t=setTimeout(()=>setNotice(null),4200);return()=>clearTimeout(t);},[notice]);
  const inform=useCallback((text:string,kind:Notice['kind']='success')=>setNotice({text,kind}),[]);
  const mutate=useCallback((action:(current:StudioData)=>StudioData)=>{
    setData(old=>{if(!old)return old;try{return action(old);}catch(e){inform(e instanceof Error?e.message:String(e),'error');return old;}});
  },[inform]);
  const go=(target:Page)=>{setPage(target);setMobileNav(false);if(target!=='studio'){setEditBasic(false);setWorldDraft(null);}window.scrollTo({top:0,behavior:'smooth'});};
  const openImportedCard=(themeId:string,passcode:string)=>{setImportedCard({themeId,passcode});setPage('studio');setMobileNav(false);window.scrollTo({top:0,behavior:'smooth'});};
  const openCard=(cardId:string)=>{setImportedCard(null);setSelectedId(cardId);setPage('studio');setActiveTab('effect');setEditBasic(false);setProposalText('');setProposalMemo('');setMobileNav(false);window.scrollTo({top:0,behavior:'smooth'});};
  const openWorld=(id:string)=>{setSelectedWorld(id);setSelectedPhase(0);setWorldDraft(null);go('worlds');};
  const selected=data?.cards.find(c=>c.id===selectedId)??data?.cards[0];
  const selectedRealm=data?.worlds.find(w=>w.id===selectedWorld)??data?.worlds[0];
  const counts=useMemo(()=>{
    if(!data)return {pending:0,reviewing:0,unknown:0};
    return {pending:data.cards.reduce((n,c)=>n+c.proposals.filter(p=>p.status==='미승인').length,0),
      reviewing:data.cards.filter(c=>c.approval==='검토중'||c.ocg==='검토중'||c.balance==='검토중').length,
      unknown:countUnknown(data)};
  },[data]);
  // Rebuild only on card/world edits, not on each search keystroke or history update.
  const searchIndex=useMemo(()=>buildCardIndex(data?.cards??[],data?.worlds??[]),[data?.cards,data?.worlds]);
  const filteredCards=useMemo(()=>searchCardIndex(searchIndex,{
    text:deferredSearch,worldId:worldFilter,phase:stageFilter,
  }),[searchIndex,deferredSearch,worldFilter,stageFilter]);
  const shownCards=useMemo(()=>visibleSlice(filteredCards,cardLimit),[filteredCards,cardLimit]);
  const shownHistory=useMemo(()=>visibleSlice(data?.history??[],historyLimit),[data?.history,historyLimit]);
  useEffect(()=>{setCardLimit(CARD_PAGE_SIZE);},[deferredSearch,worldFilter,stageFilter]);
  const saveCardDetails=(event:FormEvent<HTMLFormElement>)=>{
    event.preventDefault();if(!data||!selected)return;
    const changes={...draft};
    if(changes.name!==undefined&&changes.name!==selected.name&&selected.protectedName){
      if(!window.confirm('사용자가 확정한 원래 카드명을 변경합니다. 이름 확인 상태도 미확인으로 돌아갑니다. 계속할까요?'))return;
    }
    mutate(current=>editCard(current,selected.id,changes,'카드 정보 편집',true));
    setEditBasic(false);inform('수정 내용을 기록했습니다.');
  };
  const startEdit=()=>{if(!selected)return;setDraft({name:selected.name,level:selected.level,attribute:selected.attribute,race:selected.race,
    monsterType:selected.monsterType,atk:selected.atk,def:selected.def,design:selected.design,artUrl:selected.artUrl,source:selected.source,notes:selected.notes});setEditBasic(true);};
  const saveProposal=()=>{if(!selected||!proposalText.trim())return inform('효과 제안 원문을 입력하세요.','error');
    mutate(current=>proposeEffect(current,selected.id,proposalText,proposalMemo));
    setProposalText('');setProposalMemo('');inform('제안을 저장했습니다. 확정 원문은 변경되지 않았습니다.');};
  const reviewProposal=(id:string,approve:boolean)=>{
    if(!selected)return;
    const p=selected.proposals.find(p=>p.id===id);if(!p)return;
    const msg=approve?`미승인 효과 제안을 승인하고 현재 확정 원문을 교체할까요?\n\n이전:\n${selected.effect||'미확인'}\n\n변경:\n${p.text}`:'이 제안을 반려하시겠습니까? 반려 기록은 변경 이력에 남습니다.';
    if(!window.confirm(msg))return;
    mutate(d=>decideEffect(d,selected.id,id,approve?'승인':'반려'));
    inform(approve?'승인된 제안을 효과 원문에 반영했습니다.':'제안을 반려했습니다.');
  };
  const createNewCard=()=>{
    if(!data)return;
    const target=data.worlds.find(w=>w.id===(worldFilter==='all'?'blood':worldFilter))??data.worlds[0];
    const next=createCard(data,target.id);const fresh=next.cards[next.cards.length-1];
    setData(next);openCard(fresh.id);inform('새 카드 문서를 생성했습니다.');
  };
  const exportBackup=()=>{if(!data)return;const content=exportJson(data),url=URL.createObjectURL(new Blob([content],{type:'application/json;charset=utf-8'}));
    const anchor=document.createElement('a');anchor.href=url;anchor.download=`YGO_카드스튜디오_백업_${new Date().toISOString().slice(0,10)}.json`;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);inform('전체 데이터 JSON 백업을 내보냈습니다.');};
  const importBackup=async(file:File|null)=>{if(!file||!data)return;
    if(file.size>10_000_000)return inform('10MB 이하 JSON 백업만 지원합니다.','error');
    try{const content=await file.text();const unknown:unknown=JSON.parse(content);
      if(!validateBackup(unknown))throw new Error('백업 데이터 구조가 유효하지 않습니다.');
      if(!window.confirm(`현재 저장된 녹투르나 카드 ${data.cards.length}종과 변경 이력을 이 백업으로 교체할까요? 기존 데이터는 먼저 내보내는 것을 권장합니다.`))return;
      setData(unknown);setSelectedId(unknown.cards[0]?.id??'');go('home');inform('백업을 복원했습니다.');
    }catch(e){inform(e instanceof Error?e.message:'백업 가져오기에 실패했습니다.','error');}
    finally{if(filePicker.current)filePicker.current.value='';}
  };
  const exportWorkbench=async()=>{
    try{
      const records=await loadAllImportedRecords();
      const backup={kind:'ygo_card_studio_imported_workbench',schemaVersion:1,exportedAt:new Date().toISOString(),records};
      const url=URL.createObjectURL(new Blob([JSON.stringify(backup,null,2)],{type:'application/json;charset=utf-8'}));
      const a=document.createElement('a');a.href=url;a.download=`커스텀카드_작업문서_백업_${new Date().toISOString().slice(0,10)}.json`;a.click();
      window.setTimeout(()=>URL.revokeObjectURL(url),1200);
      inform(`${records.length}개 외부 테마 작업 문서를 백업했습니다. CDB·Lua·이미지 원본은 별도 보관하세요.`);
    }catch(e){inform(e instanceof Error?e.message:'작업 문서 백업 실패','error');}
  };
  const importWorkbench=async(file:File|null)=>{
    if(!file)return;
    if(file.size>20_000_000)return inform('20MB 이하 작업 문서 백업만 읽을 수 있습니다.','error');
    try{
      const raw:unknown=JSON.parse(await file.text());
      if(!validateWorkbenchBackup(raw))throw new Error('작업 문서 백업의 구조가 유효하지 않습니다.');
      const existing=await loadAllImportedRecords();
      const keys=new Set(existing.map(r=>JSON.stringify([r.themeId,r.passcode])));
      const overlap=raw.records.filter(r=>keys.has(JSON.stringify([r.themeId,r.passcode]))).length;
      if(!window.confirm(`작업 문서 ${raw.records.length}개를 가져옵니다. 현재 문서와 동일한 테마·카드 ID ${overlap}개는 백업으로 교체됩니다. 먼저 현재 작업 문서를 내보냈나요?`))return;
      const count=await restoreWorkbenchBackup(raw);
      inform(`${count}개 작업 문서를 가져왔습니다. 관련 CDB·Lua·이미지 원본은 이 백업에 포함되지 않습니다.`);
    }catch(e){inform(e instanceof Error?e.message:'작업 문서 가져오기 실패','error');}
    finally{if(workbenchPicker.current)workbenchPicker.current.value='';}
  };
  const reset=()=>{if(!data)return;
    if(window.confirm('현재 데이터를 초기화합니다. 저장된 카드 수정과 변경 이력이 모두 사라집니다. 먼저 JSON 백업을 받으셨나요?')&&window.confirm('정말로 모든 로컬 데이터를 초기 확정 정보로 되돌릴까요?')){
      setData(createInitialData());setSelectedId('blood-0');go('home');inform('초기 데이터로 복원했습니다.');
    }
  };

  if(!data)return <div className="loading-screen"><div className="brand-mark">Y</div><strong>YGO CARD STUDIO</strong><span>기록 보관소를 여는 중...</span></div>;

  const pendingCards=data.cards.filter(IS_PENDING);

  return <div className="shell">
    <aside className={`sidebar ${mobileNav?'sidebar--open':''}`}>
      <div className="brand"><div className="brand-symbol">✣</div><div><strong>YGO<span> / </span>STUDIO</strong><small>CUSTOM CARD WORKSPACE</small></div><button className="mobile-close" onClick={()=>setMobileNav(false)} aria-label="메뉴 닫기"><X size={17}/></button></div>
      <div className="sidebar-content">
        <div className="sidebar-caption">WORKSPACE <span>01</span></div>
        {NAV.filter(i=>i.group==='workspace').map(i=><button key={i.key} className={`nav-link ${page===i.key?'nav-link--active':''}`} onClick={()=>go(i.key)}><i.icon size={17} strokeWidth={1.7}/><span>{i.name}</span>{page===i.key&&<ChevronRight size={14}/>}</button>)}
        <div className="sidebar-caption sidebar-caption--second">TOOLS <span>02</span></div>
        {NAV.filter(i=>i.group==='tools').map(i=><button key={i.key} className={`nav-link ${page===i.key?'nav-link--active':''}`} onClick={()=>go(i.key)}><i.icon size={17} strokeWidth={1.7}/><span>{i.name}</span>{i.key==='reviews'&&counts.pending>0&&<em>{counts.pending}</em>}</button>)}
        <div className="sidebar-projects"><div className="sidebar-caption">PROJECTS</div><button className="project-link" onClick={()=>go('themes')}><span className="project-orb">✦</span><span><strong>종언성서 — 녹투르나</strong><small>무명성서 · 세계 5</small></span></button></div>
      </div>
      <div className="sidebar-bottom"><div className="storage-dot"/><div><strong>로컬 워크스페이스</strong><span>{storageMode} · {savePhase==='pending'?'저장 대기':savePhase==='writing'?'저장 중':savePhase==='error'?'저장 실패':'저장 완료'}</span></div><button onClick={()=>go('settings')} aria-label="백업 설정"><Settings2 size={16}/></button></div>
    </aside>
    {mobileNav&&<div className="mobile-scrim" onClick={()=>setMobileNav(false)}/>}
    <div className="main-area">
      <header className="topbar"><div className="topbar-left"><button className="mobile-menu" onClick={()=>setMobileNav(true)} aria-label="메뉴 열기"><Menu size={21}/></button><span>PERSONAL WORKSPACE</span><ChevronRight size={13}/><strong>{page==='studio'?'카드 스튜디오':NAV.find(x=>x.key===page)?.name}</strong></div>
        <div className="topbar-right"><div className="searchbox"><Search size={16}/><input ref={globalSearch} value={search} onFocus={()=>{if(page!=='cards'&&page!=='studio')go('cards');}} onChange={e=>{setSearch(e.target.value);if(page!=='cards')go('cards');}} placeholder="카드명·세계·효과 검색" aria-label="카드 검색"/><kbd>⌘ K</kbd></div><button className="top-action" onClick={exportBackup} title="JSON 전체 백업"><Download size={18}/></button></div>
      </header>
      {saveError&&<div className="error-banner"><AlertCircle size={16}/>{saveError}<button onClick={exportBackup}>백업 내보내기</button></div>}
      <main className={`content content--${page}`}>
        {page==='home'&&<>
          <div className="page-eyebrow"><span className="red-dot"/> PROJECTS / 001 <span className="eyebrow-rule"/> LIVE WORKSPACE</div>
          <section className="hero"><div className="hero-top"><span>FEATURED COLLECTION</span><span>01 — 06 / ORIGINAL WORLD</span></div><div className="hero-body"><div className="hero-copy"><div className="hero-overline">NOCTURNA · NAMELESS SCRIPTURE</div><h1>종언성서<span> — </span><br/>녹투르나</h1><p>다섯 세계에서 고난을 겪은 아벨. 세계관과 카드 설계, 원문과 검증 기록을 연결하는 제작 원장.</p><div className="hero-actions"><button className="primary-button" onClick={()=>go('themes')}>프로젝트 탐색 <ArrowRight size={16}/></button><button className="outline-button" onClick={()=>go('cards')}>카드 라이브러리 <ArrowDownRight size={16}/></button></div></div>
            <div className="hero-art" aria-hidden="true"><div className="hero-constellation"><span className="constellation-center">✧</span><i className="ring-one"/><i className="ring-two"/><i className="ring-three"/></div><span className="hero-art-caption">VOL. VI · THE LAST SCRIPTURE</span></div>
          </div></section>
          <div className="metrics-row"><MiniMetric label="확정 세계" value="05" foot="고유 세계관"/><MiniMetric label="초기 카드 원장" value={data.cards.length.toString().padStart(2,'0')} foot="미확인 진화 문서 포함"/><MiniMetric label="승인 대기 제안" value={counts.pending.toString().padStart(2,'0')} foot="미승인 효과 변경" accent={counts.pending>0}/><MiniMetric label="미확인 필드" value={counts.unknown} foot="주요 카드 속성 합계"/></div>
          <SectionTitle index="01" title="다섯 세계 · 기록 보관소" aside="THE FIVE REALMS"/>
          <div className="realm-grid">{data.worlds.map((w,index)=><button className="realm-tile" key={w.id} style={{'--realm':w.accent} as React.CSSProperties} onClick={()=>openWorld(w.id)}><div className="realm-art"><span className="realm-monogram">{['Ⅰ','Ⅱ','Ⅲ','Ⅳ','Ⅴ'][index]}</span><span className="realm-engrave">{w.shortLabel}</span></div><div className="realm-detail"><span>WORLD / {String(index+1).padStart(2,'0')}</span><strong>{w.name}</strong><small>{w.mechanism}</small><span className="realm-footer">계보 열기 <ArrowRight size={14}/></span></div></button>)}</div>
          <SectionTitle index="02" title="현재 작업 대기열" aside="REAL DATA / NO ESTIMATES"/>
          <div className="bottom-grid"><div className="queue-panel"><div className="panel-head"><h3>검토와 수정</h3><button onClick={()=>go('reviews')}>모두 보기 <ArrowRight size={14}/></button></div>
            {pendingCards.length===0?<Empty icon={<CheckCircle2 size={24}/>} title="대기 중인 효과 제안 없음" detail="승인할 제안이 생기면 여기에 표시돼요."/>:pendingCards.slice(0,3).map(c=><button className="queue-item" onClick={()=>openCard(c.id)} key={c.id}><span className="queue-icon"><FileText size={17}/></span><span><strong>{displayName(c)}</strong><small>미승인 제안 {c.proposals.filter(p=>p.status==='미승인').length}건</small></span><ChevronRight size={16}/></button>)}
          </div><div className="queue-panel"><div className="panel-head"><h3>최근 변경 이력</h3><button onClick={()=>go('history')}>전체 이력 <ArrowRight size={14}/></button></div>
            {data.history.length===0?<Empty icon={<History size={24}/>} title="아직 변경 이력 없음" detail="카드를 편집하거나 제안을 승인하면 여기에 기록됩니다."/>:data.history.slice(0,3).map(h=><div key={h.id} className="history-mini"><span className="timeline-dot"/><div><strong>{h.action}</strong><small>{h.entityName} · {byDate(h.at)}</small></div></div>)}
          </div></div>
        </>}
        {page==='themes'&&<><PageHeading eyebrow="PROJECT LIBRARY / 001" title="테마 라이브러리" subtitle="서로 다른 세계와 카드군을 하나의 제작 원장으로 관리합니다."/><div className="feature-theme"><div><span className="micro-label">PROJECT 001 / ACTIVE</span><h2>종언성서 — 녹투르나</h2><p>최종 테마 《무명성서》를 중심으로 다섯 세계의 카드·설정·진화 계보를 관리합니다.</p><div className="feature-tags"><span>세계 5</span><span>초기 카드 {data.cards.length}</span><span>확정 하급 아벨 5</span></div></div><div className="feature-theme-deco">✧</div></div>
          <SectionTitle index="A" title="세계별 설계 원장" aside="SELECT A WORLD"/>
          <div className="theme-grid">{data.worlds.map((w,i)=><button key={w.id} className="theme-world" onClick={()=>openWorld(w.id)} style={{'--realm':w.accent} as React.CSSProperties}><div className="theme-world-top"><span>0{i+1} / {w.shortLabel}</span><ArrowRight size={18}/></div><div className="theme-world-sigil">{['✧','◷','◈','⌁','⌘'][i]}</div><strong>{w.name}</strong><small>{w.concept}</small><div className="theme-world-bottom">레벨 4 아벨 등록 <Check size={15}/></div></button>)}</div>
          <div className="note-line"><Info size={16}/>이 화면의 세계관 요약과 아벨 이름은 확인된 자료만 사용합니다. 일러스트 미첨부 상태를 시안 이미지로 대체하지 않습니다.</div><FileCenter view="themes" onOpenCard={openImportedCard}/>
        </>}
        {page==='cards'&&<><PageHeading eyebrow="CARDS / ARCHIVE" title="카드 라이브러리" subtitle="설계 문서와 상태를 검색하고 카드별 작업실에서 수정할 수 있습니다." action={<button className="primary-button" onClick={createNewCard}><Plus size={16}/> 새 카드 문서</button>}/>
          <div className="filter-bar"><div className="filter-head"><SlidersHorizontal size={17}/><span>필터</span></div><label>세계 <select value={worldFilter} onChange={e=>setWorldFilter(e.target.value)}><option value="all">모든 세계</option>{data.worlds.map(w=><option value={w.id} key={w.id}>{w.name}</option>)}<option value="common">공통 카드</option></select></label><label>단계 <select value={stageFilter} onChange={e=>setStageFilter(e.target.value)}><option value="all">전체 단계</option><option value="0">첫 고난</option><option value="1">1차 진화</option><option value="2">2차 진화</option><option value="-1">공통 기본형</option></select></label><span className="results-count">{filteredCards.length}개 문서</span></div>
          <div className="card-table"><div className="card-table-head"><span>카드 / 단계</span><span>세계</span><span>효과 원문</span><span>일러스트</span><span>Lua</span><span>최종 수정</span></div>
            {filteredCards.length===0?<Empty icon={<Filter size={25}/>} title="검색 결과가 없습니다" detail="다른 검색어 또는 필터로 다시 확인하세요."/>:shownCards.map(c=>{
              const w=worldOf(data,c);return <button className="card-row" key={c.id} onClick={()=>openCard(c.id)}><span className="row-name"><span className="row-thumbnail" style={{'--realm':w?.accent??'#A5A5B0'} as React.CSSProperties}>{w?.shortLabel.slice(0,1)??'✦'}</span><span><strong>{displayName(c)}</strong><small>{cardPhase(c)} · v{c.version}</small></span></span><span>{w?.name??'공통 기본형'}</span><span>{c.effect?<Status small value="원문 등록"/>:<Status small value={UNKNOWN}/>}</span><span><Status small value={c.artStatus}/></span><span><Status small value={c.lua}/></span><span className="row-date">{byDate(c.updatedAt)} <ChevronRight size={16}/></span></button>;
            })}
          </div>
          {shownCards.length<filteredCards.length&&<div className="more-results"><span>{shownCards.length.toLocaleString('ko-KR')} / {filteredCards.length.toLocaleString('ko-KR')}개 표시</span><button className="outline-button" onClick={()=>setCardLimit(n=>n+CARD_PAGE_SIZE)}>다음 {Math.min(CARD_PAGE_SIZE,filteredCards.length-shownCards.length)}개 보기 <ChevronDown size={16}/></button></div>}
          <FileCenter view="cards" externalSearch={search} onOpenCard={openImportedCard}/>
        </>}
        {page==='studio'&&importedCard&&<ImportedCardStudio key={`${importedCard.themeId}:${importedCard.passcode}`} themeId={importedCard.themeId} passcode={importedCard.passcode} onBack={()=>{setImportedCard(null);go('cards');}}/>}
        {page==='studio'&&!importedCard&&selected&&<>
          <div className="studio-breadcrumb"><button onClick={()=>go('cards')}><ArrowLeft size={15}/> 카드 라이브러리</button><span>/</span><strong>{displayName(selected)}</strong></div>
          <div className="studio-heading"><div><div className="page-eyebrow">CARD RECORD / {selected.id.toUpperCase()}</div><h1>{displayName(selected)}</h1><div className="studio-meta"><Status small value={selected.approval}/><span>v{selected.version}</span><span>{cardPhase(selected)}</span><span>카드 ID: 미확인</span></div></div><button className="outline-button" onClick={()=>go('history')}><History size={16}/> 변경 이력</button></div>
          <div className="studio-grid"><aside className="studio-card-panel"><ArtSlot card={selected} world={worldOf(data,selected)} large/><div className="card-panel-name">{displayName(selected)}</div><div className="card-panel-info"><div><span>WORLD</span><strong>{worldOf(data,selected)?.name??'공통 카드'}</strong></div><div><span>LEVEL</span><strong>{selected.level??UNKNOWN}</strong></div><div><span>ATTRIBUTE</span><strong>{selected.attribute||UNKNOWN}</strong></div><div><span>TYPE</span><strong>{selected.monsterType||UNKNOWN}</strong></div></div><div className="card-panel-actions"><button className="outline-button" onClick={startEdit}><Settings2 size={15}/> 기본 정보 편집</button><Status small value={selected.artStatus}/></div>
          </aside>
          <div className="studio-editor"><div className="tabline"><button className={activeTab==='effect'?'active':''} onClick={()=>setActiveTab('effect')}>효과 · 설계</button><button className={activeTab==='lineage'?'active':''} onClick={()=>setActiveTab('lineage')}>진화 계보</button><button className={activeTab==='history'?'active':''} onClick={()=>setActiveTab('history')}>변경 이력</button></div>
            {editBasic?<form className="edit-form" onSubmit={saveCardDetails}><div className="module-heading"><div><span className="micro-label">CARD METADATA</span><h3>카드 기본 정보 수정</h3></div><button type="button" className="icon-button" aria-label="수정 취소" onClick={()=>setEditBasic(false)}><X size={18}/></button></div>
              <div className="form-grid"><Field label="카드명"><input value={String(draft.name??'')} onChange={e=>setDraft({...draft,name:e.target.value})}/></Field><Field label="레벨"><input type="number" min="0" value={draft.level??''} onChange={e=>setDraft({...draft,level:e.target.value===''?null:Number(e.target.value)})}/></Field><Field label="속성"><input value={String(draft.attribute??'')} onChange={e=>setDraft({...draft,attribute:e.target.value})}/></Field><Field label="종족"><input value={String(draft.race??'')} onChange={e=>setDraft({...draft,race:e.target.value})}/></Field><Field label="카드 종류"><input value={String(draft.monsterType??'')} onChange={e=>setDraft({...draft,monsterType:e.target.value})}/></Field><Field label="ATK"><input type="number" value={draft.atk??''} onChange={e=>setDraft({...draft,atk:e.target.value===''?null:Number(e.target.value)})}/></Field><Field label="DEF"><input type="number" value={draft.def??''} onChange={e=>setDraft({...draft,def:e.target.value===''?null:Number(e.target.value)})}/></Field><Field label="이미지 URL"><input placeholder="https://... (선택)" value={String(draft.artUrl??'')} onChange={e=>setDraft({...draft,artUrl:e.target.value})}/></Field></div>
              <Field label="캐릭터 디자인 방향"><textarea rows={3} value={String(draft.design??'')} onChange={e=>setDraft({...draft,design:e.target.value})}/></Field><Field label="설계 메모"><textarea rows={3} value={String(draft.notes??'')} onChange={e=>setDraft({...draft,notes:e.target.value})}/></Field><Field label="정보 출처"><input value={String(draft.source??'')} onChange={e=>setDraft({...draft,source:e.target.value})}/></Field>
              <div className="form-actions"><button type="button" className="outline-button" onClick={()=>setEditBasic(false)}>취소</button><button className="primary-button" type="submit"><Save size={16}/> 수정 내용 저장</button></div>
            </form>:activeTab==='effect'?<>
              <section className="editor-module"><div className="module-heading"><div><span className="micro-label">01 / APPROVED CARD TEXT</span><h3>효과 원문 <Status small value={selected.effect?'원문 등록':'미확인'}/></h3></div><span className="module-version">REVISION {String(selected.version).padStart(2,'0')}</span></div><div className="effect-text">{selected.effect||<span className="unknown-effect">현재 등록된 효과 원문이 없습니다.<small>임의 생성하지 않고 미확인으로 유지합니다.</small></span>}</div><div className="module-foot"><ShieldCheck size={15}/><span>{selected.effectSource||'근거 자료: 미확인'}</span></div></section>
              <section className="editor-module editor-module--proposal"><div className="module-heading"><div><span className="micro-label">02 / CHANGE PROPOSAL</span><h3>미승인 효과 제안</h3></div><Status small value={IS_PENDING(selected)?'검토중':'미확인'}/></div><p className="module-help">효과 제안은 별도 기록에 저장되며, 승인하기 전까지 위의 효과 원문을 변경하지 않습니다.</p>
                <Field label="새 효과안"><textarea rows={6} className="proposal-textarea" placeholder="카드 효과 초안을 작성하세요. 확정 원문은 보호됩니다." value={proposalText} onChange={e=>setProposalText(e.target.value)}/></Field><Field label="검토 메모 (선택)"><input placeholder="수정 목적 또는 근거" value={proposalMemo} onChange={e=>setProposalMemo(e.target.value)}/></Field><div className="form-actions"><button className="primary-button" onClick={saveProposal}><Plus size={16}/> 제안 등록</button></div>
              </section>
              {selected.proposals.map(p=><section className="proposal-review" key={p.id}><div className="proposal-review-top"><span>제안 · {byDate(p.createdAt)}</span><Status small value={p.status}/></div><pre>{p.text}</pre>{p.note&&<small>메모: {p.note}</small>}{p.status==='미승인'&&<div className="form-actions"><button className="outline-button" onClick={()=>reviewProposal(p.id,false)}><X size={14}/> 반려</button><button className="primary-button" onClick={()=>reviewProposal(p.id,true)}><Check size={14}/> 원문 반영 승인</button></div>}</section>)}
              {selected.proposals.length===0&&<div className="subtle-empty">등록된 효과 제안이 없습니다.</div>}
            </>:activeTab==='lineage'?<div className="lineage-workspace"><div className="module-heading"><div><span className="micro-label">EVOLUTION PATH</span><h3>{worldOf(data,selected)?.name??'공통 원형'} · 진화 계보</h3></div></div>{selected.worldId==='common'?<Empty title="공통 기본형" detail="각 세계의 진화 계보와 구분하여 관리합니다."/>:<div className="lineage-list">{data.cards.filter(c=>c.worldId===selected.worldId&&c.id.includes('-')&&c.phase>=0).sort((a,b)=>a.phase-b.phase).map((c,i)=><button className={`lineage-item ${c.id===selected.id?'lineage-item--current':''}`} key={c.id} onClick={()=>openCard(c.id)}><span>{String(i+1).padStart(2,'0')}</span><div><strong>{displayName(c)}</strong><small>{cardPhase(c)} · 효과 {c.effect?'기록됨':'미확인'}</small></div><ChevronRight size={17}/></button>)}</div>}</div>:<div className="history-workspace"><div className="module-heading"><div><span className="micro-label">AUDIT TRAIL</span><h3>카드 변경 이력</h3></div></div>{data.history.filter(h=>h.entity==='card'&&h.entityId===selected.id).length===0?<Empty title="아직 변경 이력 없음" detail="새로운 변경이 생기면 시간과 전후 내용을 기록합니다."/>:data.history.filter(h=>h.entity==='card'&&h.entityId===selected.id).map(h=><HistoryItem key={h.id} item={h}/>)}</div>}
          </div>
          <aside className="inspector"><div className="inspector-title"><ShieldCheck size={18}/><strong>검수 · 구현 현황</strong></div><p>승인, 규칙 검토, 실제 엔진 검증은 서로 다른 상태입니다.</p><SelectStatus label="설계 종합 승인" value={selected.approval} options={APPROVAL_OPTIONS} onChange={v=>mutate(d=>editCard(d,selected.id,{approval:v}))}/><SelectStatus label="일러스트 승인" value={selected.artStatus} options={APPROVAL_OPTIONS} onChange={v=>mutate(d=>editCard(d,selected.id,{artStatus:v}))}/><div className="inspector-divider"/><SelectStatus label="OCG 규칙 충돌" value={selected.ocg} options={RULE_OPTIONS} onChange={v=>mutate(d=>editCard(d,selected.id,{ocg:v}))}/><SelectStatus label="밸런스 검토" value={selected.balance} options={BALANCE_OPTIONS} onChange={v=>mutate(d=>editCard(d,selected.id,{balance:v}))}/><div className="inspector-divider"/><SelectStatus label="CDB 데이터" value={selected.cdb} options={ENGINE_OPTIONS} onChange={v=>mutate(d=>editCard(d,selected.id,{cdb:v}))}/><SelectStatus label="Lua 스크립트" value={selected.lua} options={ENGINE_OPTIONS} onChange={v=>mutate(d=>editCard(d,selected.id,{lua:v}))}/><SelectStatus label="EDOPro 듀얼" value={selected.duel} options={ENGINE_OPTIONS} onChange={v=>mutate(d=>editCard(d,selected.id,{duel:v}))}/><div className="inspector-divider"/><div className="inspector-file-head"><FolderOpen size={17}/><strong>연결된 실행 파일</strong></div><div className="file-pending"><CircleHelp size={17}/>파일 센터에서 보관된 원본의 카드 문서 자동 연결은 후속 단계입니다.<small>파일 업로드만으로 OCG·Lua·EDOPro 검증 완료가 되지 않습니다.</small></div>
          </aside></div>
        </>}
        {page==='worlds'&&selectedRealm&&<><PageHeading eyebrow="LORE / EVOLUTION" title="세계관 · 아벨 진화 계보" subtitle="고난에서 출발해 극복과 지배에 도달하는 세 단계를 관리합니다."/><div className="world-select-tabs">{data.worlds.map(w=><button key={w.id} className={selectedWorld===w.id?'current':''} onClick={()=>{setSelectedWorld(w.id);setSelectedPhase(0);setWorldDraft(null);}} style={{'--realm':w.accent} as React.CSSProperties}>{w.name}</button>)}</div><div className="world-topline" style={{'--realm':selectedRealm.accent} as React.CSSProperties}><div><span className="micro-label">WORLD / {selectedRealm.shortLabel}</span><h2>{selectedRealm.name}</h2><p>{selectedRealm.mechanism} · {selectedRealm.concept}</p></div><span className="world-emblem">✧</span></div><SectionTitle index="Ⅰ" title="아벨의 3단계 계보" aside="고난 → 극복 → 지배"/><div className="evolution-grid">{[0,1,2].map(index=>{const c=data.cards.find(c=>c.worldId===selectedRealm.id&&c.phase===index);return <button key={index} className={`evolution-stage ${selectedPhase===index?'evolution-stage--active':''}`} onClick={()=>{setSelectedPhase(index as 0|1|2);setWorldDraft(null);}}><span className="micro-label">PHASE / 0{index+1}</span><span className="evolution-number">0{index+1}</span><strong>{PHASES[index]}</strong><small>{c?displayName(c):'미확인'}</small><Status small value={selectedRealm.stages[index].status}/>{index<2&&<ArrowRight className="evolution-arrow" size={17}/>}</button>;})}</div><section className="world-edit-panel"><div className="module-heading"><div><span className="micro-label">PHASE 0{selectedPhase+1} / WORLD STORY</span><h3>{PHASES[selectedPhase]} 단계 · 세계관 기록</h3></div><button className="outline-button" onClick={()=>{
              const item=selectedRealm.stages[selectedPhase];setWorldDraft({lore:item.lore,design:item.design,source:item.source,status:item.status});
            }}><Settings2 size={16}/> 수정</button></div>{worldDraft?<form onSubmit={e=>{e.preventDefault();mutate(d=>updateWorldStage(d,selectedRealm.id,selectedPhase,worldDraft));setWorldDraft(null);inform('세계관 기록을 업데이트했습니다.');}}><Field label="서사 및 사건"><textarea rows={4} value={worldDraft.lore} onChange={e=>setWorldDraft({...worldDraft,lore:e.target.value})}/></Field><Field label="디자인 방향"><textarea rows={3} value={worldDraft.design} onChange={e=>setWorldDraft({...worldDraft,design:e.target.value})}/></Field><Field label="정보 출처"><input value={worldDraft.source} onChange={e=>setWorldDraft({...worldDraft,source:e.target.value})}/></Field><Field label="확인 상태"><select value={worldDraft.status} onChange={e=>setWorldDraft({...worldDraft,status:e.target.value as typeof worldDraft.status})}>{['미확인','제안','검토중','확정'].map(v=><option key={v}>{v}</option>)}</select></Field><div className="form-actions"><button type="button" className="outline-button" onClick={()=>setWorldDraft(null)}>취소</button><button type="submit" className="primary-button"><Save size={15}/> 변경 기록 저장</button></div></form>:<div className="world-story"><div><span>서사 / 고난</span><p>{selectedRealm.stages[selectedPhase].lore||'미확인 · 사건 및 장면 미등록'}</p></div><div><span>캐릭터 디자인</span><p>{selectedRealm.stages[selectedPhase].design||'미확인 · 디자인 원문 미등록'}</p></div><div><span>기록 출처</span><p>{selectedRealm.stages[selectedPhase].source||'미확인'}</p></div></div>}</section><div className="related-card"><span>연결된 카드 문서</span>{data.cards.some(c=>c.worldId===selectedRealm.id&&c.phase===selectedPhase)?<><strong>{displayName(data.cards.find(c=>c.worldId===selectedRealm.id&&c.phase===selectedPhase)!)}</strong><button onClick={()=>{const c=data.cards.find(c=>c.worldId===selectedRealm.id&&c.phase===selectedPhase);if(c)openCard(c.id);}}>카드 작업실로 이동 <ArrowRight size={16}/></button></>:<strong>미확인 · 연결된 카드 없음</strong>}</div></>}
        {page==='reviews'&&<><PageHeading eyebrow="QUALITY CONTROL / QUEUE" title="검수 센터" subtitle="승인 보류, 규칙 검토, 구현 검증이 필요한 문서를 별도로 추적합니다."/><div className="metrics-row"><MiniMetric label="미승인 효과 제안" value={counts.pending} foot="승인 전 원문 변경 금지"/><MiniMetric label="검토 상태 카드" value={counts.reviewing} foot="검토중 상태 기준"/><MiniMetric label="미확인 필드" value={counts.unknown} foot="확정 또는 검증 전"/></div><SectionTitle index="01" title="검수 대상 카드" aside="UNVERIFIED ITEMS"/><div className="review-table">{data.cards.map(c=><button key={c.id} onClick={()=>openCard(c.id)} className="review-row"><div><strong>{displayName(c)}</strong><small>{worldOf(data,c)?.name??'공통'}</small></div><div>OCG <Status small value={c.ocg}/></div><div>밸런스 <Status small value={c.balance}/></div><div>Lua <Status small value={c.lua}/></div><ChevronRight size={16}/></button>)}</div></>}
        {page==='audit'&&<AuditCenter onOpenCard={openImportedCard}/>}
        {page==='files'&&<FileCenter view="files" onOpenCard={openImportedCard}/>}
        {page==='decks'&&<><PageHeading eyebrow="DECK LAB / P5" title="덱 연구실" subtitle="YDK 원본과 분석안을 분리해 40~60장 구성·초동 패 확률·매수 시나리오를 연구합니다."/><Suspense fallback={<div className="not-yet">덱 연구실을 불러오는 중...</div>}><DeckLab/></Suspense></>}
        {page==='history'&&<><PageHeading eyebrow="CHANGE HISTORY / AUDIT LOG" title="변경 이력" subtitle="승인된 카드 원문과 제안, 카드 정보 및 세계관 수정 기록을 추적합니다."/><div className="history-list">{data.history.length===0?<Empty icon={<History size={28}/>} title="기록이 비어 있습니다" detail="카드 정보 수정과 효과 제안, 승인 결과가 이곳에 쌓입니다."/>:shownHistory.map(h=><HistoryItem key={h.id} item={h}/>)}</div>{shownHistory.length<data.history.length&&<div className="more-results"><span>{shownHistory.length.toLocaleString('ko-KR')} / {data.history.length.toLocaleString('ko-KR')}건 표시</span><button className="outline-button" onClick={()=>setHistoryLimit(n=>n+HISTORY_PAGE_SIZE)}>다음 이력 {Math.min(HISTORY_PAGE_SIZE,data.history.length-shownHistory.length)}건 보기 <ChevronDown size={16}/></button></div>}</>}
        {page==='settings'&&<><PageHeading eyebrow="DATA MANAGEMENT" title="백업 · 설정" subtitle="자료는 현재 브라우저에 저장됩니다. 중요한 변경 사항은 정기적으로 JSON 백업을 받아 보관하세요."/><div className="settings-grid"><div className="settings-panel"><Database size={25}/><h2>데이터 보관</h2><p>현재 저장 방식: <strong>{storageMode}</strong></p><small>서버 동기화는 구현되지 않았습니다. 다른 기기에서는 JSON 백업을 가져와야 합니다. 브라우저 데이터 삭제 시 복구할 수 없습니다.</small></div><div className="settings-panel"><Download size={25}/><h2>백업 내보내기</h2><p>《녹투르나》 설계 카드 16종과 효과 제안·승인·변경 이력 JSON을 내보냅니다. 외부 테마 작업 문서는 별도 백업합니다.</p><button className="primary-button" onClick={exportBackup}><Download size={16}/> 녹투르나 설계 JSON 내보내기</button></div><div className="settings-panel"><Upload size={25}/><h2>백업 가져오기</h2><p>구조가 유효한 V1 백업만 읽습니다. 기존 데이터를 교체하기 전에 확인합니다.</p><input ref={filePicker} type="file" accept="application/json,.json" onChange={e=>void importBackup(e.target.files?.[0]??null)} hidden/><button className="outline-button" onClick={()=>filePicker.current?.click()}><Upload size={16}/> JSON 불러오기</button></div><div className="settings-panel"><FileText size={25}/><h2>외부 테마 작업 문서 백업</h2><p>코스모코드 등 업로드 카드의 설계 메모, 승인 효과, 제안·검수·변경 이력을 JSON으로 저장합니다. 원본 바이너리는 제외됩니다.</p><button className="primary-button" onClick={()=>void exportWorkbench()}><Download size={16}/> 작업 문서 내보내기</button><input ref={workbenchPicker} type="file" accept=".json,application/json" hidden onChange={e=>void importWorkbench(e.target.files?.[0]??null)}/><button className="outline-button" onClick={()=>workbenchPicker.current?.click()}><Upload size={16}/> 작업 문서 복원</button></div><div className="settings-panel settings-panel--danger"><ShieldAlert size={25}/><h2>초기 데이터 복원</h2><p>진행 중인 변경 사항이 사라집니다. 먼저 백업을 저장하세요.</p><button className="danger-button" onClick={reset}>초기 상태로 되돌리기</button></div></div><div className="note-line"><Info size={16}/>V2 독립형 HTML 백업은 구조가 다릅니다. V2 → 신규 스키마 이관기는 별도 검증 후 추가합니다.</div></>}
      </main>
      <footer className="footer"><span>YGO CARD STUDIO <em>ALPHA / 0.6.0</em></span><span>확정과 검증은 별도 상태 · 미확인 정보는 추정하지 않습니다.</span></footer>
    </div>
    {notice&&<div className={`toast toast--${notice.kind}`} role="status">{notice.kind==='success'?<CheckCircle2 size={17}/>:notice.kind==='error'?<AlertCircle size={17}/>:<Info size={17}/>}<span>{notice.text}</span><button onClick={()=>setNotice(null)} aria-label="알림 닫기"><X size={15}/></button></div>}
  </div>;
}

function PageHeading({eyebrow,title,subtitle,action}:{eyebrow:string;title:string;subtitle:string;action?:ReactNode}){
  return <div className="page-heading"><div><span className="micro-label"><span className="red-dot"/>{eyebrow}</span><h1>{title}</h1><p>{subtitle}</p></div>{action&&<div>{action}</div>}</div>;
}
function Field({label,children}:{label:string;children:ReactNode}){
  return <label className="field"><span>{label}</span>{children}</label>;
}
function SelectStatus<T extends string>({label,value,options,onChange}:{label:string;value:T;options:T[];onChange:(value:T)=>void}){
  return <div className="check-status-row"><div><span>{label}</span><Status small value={value}/></div><div className="select-wrap"><select aria-label={`${label} 변경`} value={value} onChange={e=>onChange(e.target.value as T)}>{options.map(option=><option key={option}>{option}</option>)}</select><ChevronDown size={13}/></div></div>;
}
function HistoryItem({item}:{item:StudioData['history'][number]}){
  return <div className="history-item"><div className="history-time"><Clock3 size={15}/>{byDate(item.at)}</div><div className="history-body"><div><strong>{item.action}</strong><span>{item.entityName}</span></div><small>{item.field} · 이전: {item.before||'미확인'} → 이후: {item.after||'미확인'}</small>{item.memo&&<p>{item.memo}</p>}</div></div>;
}
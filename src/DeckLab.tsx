import { useEffect,useMemo,useRef,useState } from 'react';
import type { FileCatalog } from './fileCatalog';
import { loadCatalog } from './fileVault';
import { DECK_ROLES,cardCounts,deckWarnings,exportYdk,newDeckStudy,openingMetrics,setMainCopies,toggleDeckRole } from './deckMath';
import type { DeckStudy } from './deckMath';
import { deleteDeckStudy,getDeckStudies,makeDeckBackup,restoreDeckStudies,saveDeckStudy } from './deckVault';
import { Activity, AlertTriangle, Check, Download, FileInput, Plus, Save, SlidersHorizontal, Trash2, Upload } from 'lucide-react';
import './deck-lab.css';

type Notice={kind:'success'|'error'|'info';text:string};
function downloadText(text:string,filename:string,type:string){
  const url=URL.createObjectURL(new Blob([text],{type}));
  const a=document.createElement('a');a.href=url;a.download=filename;a.click();
  window.setTimeout(()=>URL.revokeObjectURL(url),1800);
}
const pct=(v:number|null)=>v===null?'—':(v*100).toFixed(1)+'%';
const delta=(current:number|null,previous:number|null)=>{
  if(current===null||previous===null)return '—';
  const difference=(current-previous)*100;
  return (difference>0?'+':'')+difference.toFixed(1)+'%p';
};
const countGroups=(ids:readonly string[])=>Array.from(cardCounts(ids));
const validId=(id:string)=>/^[1-9]\d{0,11}$/.test(id)&&Number.isSafeInteger(Number(id));
const safeName=(name:string)=>name.replace(/[\\/:*?"<>|]/g,'_').slice(0,64)||'분석안';

function DeckSelector({selected,items,onChange,label}:{selected:string;items:{id:string;name:string}[];onChange:(id:string)=>void;label:string}){
  return <label>{label}<select value={selected} onChange={e=>onChange(e.target.value)} aria-label={label}>
    {items.length===0?<option value="">등록된 데이터 없음</option>:items.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}
  </select></label>;
}
function Probability({label,value,baseline,foot,enabled=true}:{label:string;value:number|null;baseline:number|null;foot:string;enabled?:boolean}){
  const shown=enabled?value:null;
  return <div className="decklab-probability">
    <span>{label}</span><strong>{enabled?pct(shown):'태그 미설정'}</strong>
    <div className="decklab-probability-track"><i style={{width:(shown===null?0:shown*100)+'%'}}/></div>
    <small>원본 대비 {enabled?delta(shown,baseline):'—'} · {foot}</small>
  </div>;
}
export default function DeckLab(){
  const [catalog,setCatalog]=useState<FileCatalog|null>(null);
  const [studies,setStudies]=useState<DeckStudy[]>([]);
  const [themeId,setThemeId]=useState('');
  const [sourceId,setSourceId]=useState('');
  const [study,setStudy]=useState<DeckStudy|null>(null);
  const [changed,setChanged]=useState(false);
  const [hand,setHand]=useState<5|6>(5);
  const [newId,setNewId]=useState('');
  const [note,setNote]=useState<Notice|null>(null);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const restoreRef=useRef<HTMLInputElement>(null);

  useEffect(()=>{
    let alive=true;
    void Promise.all([loadCatalog(),getDeckStudies()]).then(([c,list])=>{
      if(!alive)return;
      setCatalog(c);setStudies(list);
      const preferred=c.decks[0]?.themeId||c.themes[0]?.id||'';
      setThemeId(preferred);
      setSourceId(c.decks.find(d=>d.themeId===preferred)?.id||'');
    }).catch(e=>{if(alive)setNote({kind:'error',text:e instanceof Error?e.message:'덱 데이터 불러오기 실패'});})
      .finally(()=>{if(alive)setLoading(false);});
    return()=>{alive=false;};
  },[]);

  const themeDecks=useMemo(()=>catalog?.decks.filter(d=>d.themeId===themeId)||[],[catalog,themeId]);
  const source=themeDecks.find(d=>d.id===sourceId)||null;
  const visibleStudies=studies.filter(s=>s.themeId===themeId);
  const edit=study;
  const main=edit?.main||source?.main||[];
  const extra=edit?.extra||source?.extra||[];
  const side=edit?.side||source?.side||[];
  const tags=edit?.tags||{};
  const current=useMemo(()=>openingMetrics({main,tags},hand),[main,tags,hand]);
  const baseline=useMemo(()=>source?openingMetrics({main:source.main,tags},hand):null,[source,tags,hand]);
  const warnings=useMemo(()=>deckWarnings({main,extra,side}),[main,extra,side]);
  const cardNames=useMemo(()=>{
    const mapped=new Map<string,string>();
    if(!catalog)return mapped;
    const groups=new Map<string,Set<string>>();
    for(const c of catalog.cards){
      if(c.themeId!==themeId)continue;
      if(!groups.has(c.passcode))groups.set(c.passcode,new Set());
      if(c.name.trim())groups.get(c.passcode)!.add(c.name.trim());
    }
    for(const [id,names] of groups)mapped.set(id,names.size===1?[...names][0]:'원본 이름 충돌');
    return mapped;
  },[catalog,themeId]);

  const inform=(text:string,kind:Notice['kind']='success')=>setNote({text,kind});
  const confirmDiscard=()=>!changed||window.confirm('저장하지 않은 덱 연구안 변경이 사라집니다. 이동할까요?');
  const switchTheme=(id:string)=>{
    if(!confirmDiscard())return;
    setThemeId(id);setSourceId(catalog?.decks.find(d=>d.themeId===id)?.id||'');setStudy(null);setChanged(false);setNote(null);
  };
  const switchSource=(id:string)=>{
    if(!confirmDiscard())return;setSourceId(id);setStudy(null);setChanged(false);setNote(null);
  };
  const openStudy=(id:string)=>{
    if(!confirmDiscard())return;
    if(!id){setStudy(null);setChanged(false);return;}
    const found=studies.find(s=>s.id===id&&s.themeId===themeId);
    if(!found)return;
    setSourceId(found.sourceDeckId);setStudy({...found,main:[...found.main],extra:[...found.extra],side:[...found.side],tags:{...found.tags}});
    setChanged(false);setNote(null);
  };
  const newStudy=()=>{
    if(!source)return inform('분석할 원본 YDK를 먼저 선택하세요.','error');
    if(!confirmDiscard())return;
    setStudy(newDeckStudy(source));setChanged(false);inform('원본 YDK를 복사해 분석안을 만들었어. 원본은 변경되지 않아.','info');
  };
  const modify=(fn:(s:DeckStudy)=>DeckStudy)=>{
    if(!study||busy)return;
    try{setStudy(fn(study));setChanged(true);setNote(null);}
    catch(e){inform(e instanceof Error?e.message:'수정 실패','error');}
  };
  const setCount=(id:string,count:number)=>modify(s=>setMainCopies(s,id,count));
  const save=async()=>{
    if(!study||busy)return;
    setBusy(true);
    try{
      const saved=await saveDeckStudy(study);
      setStudy(saved);setChanged(false);setStudies(old=>[saved,...old.filter(x=>x.id!==saved.id)]);
      inform('덱 연구안을 브라우저에 저장했어. 원본 YDK는 그대로야.');
    }catch(e){inform(e instanceof Error?e.message:'분석안 저장 실패','error');}
    finally{setBusy(false);}
  };
  const remove=async()=>{
    if(!study||busy)return;
    if(study.revision===0){setStudy(null);setChanged(false);return;}
    if(!window.confirm('이 덱 연구안만 삭제할까요? 업로드한 YDK 원본은 삭제되지 않습니다.'))return;
    setBusy(true);
    try{await deleteDeckStudy(study.id,study.revision);
      setStudies(old=>old.filter(s=>s.id!==study.id));setStudy(null);setChanged(false);inform('분석안만 삭제했어.');}
    catch(e){inform(e instanceof Error?e.message:'삭제 실패','error');}
    finally{setBusy(false);}
  };
  const backupAll=()=>{
    try{
      const payload=makeDeckBackup(studies);
      downloadText(JSON.stringify(payload,null,2),'덱연구실_분석안_백업_'+new Date().toISOString().slice(0,10)+'.json','application/json;charset=utf-8');
      inform(studies.length+'개 덱 연구안 JSON 백업을 내보냈어. 업로드된 YDK·CDB·Lua 원본은 포함되지 않아.');
    }catch(e){inform(e instanceof Error?e.message:'백업 실패','error');}
  };
  const restore=async(file:File|null)=>{
    if(!file)return;
    if(file.size>8_000_000){inform('8MB 이하 백업만 복원할 수 있어.','error');return;}
    setBusy(true);
    try{
      const raw:unknown=JSON.parse(await file.text());
      if(!window.confirm('이 백업으로 저장된 모든 덱 연구안을 교체할까요? 기존 연구안을 먼저 JSON으로 백업했는지 확인하세요. 원본 YDK는 유지됩니다.'))return;
      const count=await restoreDeckStudies(raw);
      const list=await getDeckStudies();setStudies(list);setStudy(null);setChanged(false);
      inform(count+'개 분석안을 복원했어. 관련 YDK 원본은 별도로 필요해.');
    }catch(e){inform(e instanceof Error?e.message:'연구안 복원 실패','error');}
    finally{setBusy(false);if(restoreRef.current)restoreRef.current.value='';}
  };
  const appendId=()=>{
    const id=newId.trim();
    if(!validId(id))return inform('1~12자리의 유효한 양의 정수 카드 ID를 입력하세요.','error');
    if(!study)return inform('먼저 새 분석안 또는 저장된 분석안을 여세요.','error');
    const count=study.main.filter(x=>x===id).length;
    setCount(id,count+1);setNewId('');
  };

  if(loading)return <div className="decklab-shell"><p className="decklab-message">YDK와 덱 연구안을 불러오는 중...</p></div>;
  if(!catalog)return <div className="decklab-shell"><p role="alert" className="decklab-message">{note?.text||'파일 센터에 연결하지 못했어.'}</p></div>;
  const themeList=catalog.themes.map(t=>({id:t.id,name:t.name}));
  const sourceList=themeDecks.map(d=>({id:d.id,name:d.name+' · 메인 '+d.main.length+'장'}));
  const savedList=visibleStudies.map(s=>({id:s.id,name:s.name+' · '+s.main.length+'장'+(s.id===study?.id?' (선택됨)':'')}));
  const roleCounts=DECK_ROLES.map(role=>({role,count:[...cardCounts(main)].reduce((n,[id,num])=>n+((tags[id]||[]).includes(role)?num:0),0)}));

  return <section className="decklab-shell" aria-label="덱 연구실">
    <header className="decklab-header">
      <div><span className="micro-label">P5 / YDK RESEARCH · HYPERGEOMETRIC</span><h2>덱 구성 및 초동 확률 연구</h2>
        <p>테마별 YDK를 분석하고 카드 매수·역할을 직접 지정해. <strong>확률은 무작위 패 추출의 수학적 값이며 실제 전개 성공률은 아니야.</strong></p></div>
      <div className="decklab-header-badge"><Activity size={18}/> 40–60 CARDS</div>
    </header>
    <div className="decklab-toolbar">
      <DeckSelector selected={themeId} items={themeList} onChange={switchTheme} label="테마 선택"/>
      <DeckSelector selected={sourceId} items={sourceList} onChange={switchSource} label="원본 YDK 선택"/>
      <label>저장된 분석안<select aria-label="저장된 분석안" value={study?.revision?study.id:''} onChange={e=>openStudy(e.target.value)}>
        <option value="">원본 보기 / 분석안 선택</option>{savedList.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}
      </select></label>
    </div>
    <div className="decklab-actions">
      <button type="button" className="primary-button" onClick={newStudy} disabled={!source||busy}><Plus size={15}/> 원본에서 새 분석안</button>
      {study&&<><button type="button" className="primary-button" disabled={busy||(!changed&&study.revision>0)} onClick={()=>void save()}><Save size={15}/> 분석안 저장</button>
        <button type="button" className="outline-button" onClick={()=>{downloadText(exportYdk(study),'덱연구안_'+safeName(study.name)+'.ydk','text/plain;charset=utf-8');inform('현재 분석안을 YDK 파일로 내보냈어. 실제 금제·대회 규칙은 별도로 검증해야 해.');}}><Download size={15}/> 분석안 YDK 출력</button>
        <button type="button" className="outline-button" disabled={busy} onClick={()=>void remove()}><Trash2 size={15}/> 분석안 삭제</button></>}
      <button type="button" className="outline-button" onClick={backupAll}><Download size={14}/> 연구안 전체 JSON 백업</button>
      <button type="button" className="outline-button" disabled={busy} onClick={()=>restoreRef.current?.click()}><Upload size={14}/> 분석안 복원</button>
      <input ref={restoreRef} hidden type="file" accept=".json,application/json" aria-label="덱 연구안 백업 복원 파일" onChange={e=>void restore(e.target.files?.[0]||null)}/>
      {study&&<span className={'decklab-save-state '+(changed?'is-dirty':'')}>{changed?'저장되지 않은 변경 있음':study.revision?'저장된 분석안':'새 분석안 · 아직 미저장'}</span>}
    </div>
    {note&&<p className={'decklab-notice decklab-notice--'+note.kind} role={note.kind==='error'?'alert':'status'}>{note.text}</p>}
    {!source&&!study?<div className="decklab-empty"><FileInput size={30}/><h3>가져온 YDK가 없어</h3><p>먼저 <strong>파일 센터</strong>에서 원하는 테마를 선택하고 .ydk 또는 YDK가 들어 있는 ZIP 파일을 업로드해 줘. 다른 테마도 모두 지원해.</p></div>:<>
      <div className="decklab-stats">
        <div><span>메인 덱</span><strong>{main.length}</strong><small>40~60장 권장 규격</small></div>
        <div><span>엑스트라</span><strong>{extra.length}</strong><small>최대 15장</small></div>
        <div><span>사이드</span><strong>{side.length}</strong><small>최대 15장</small></div>
        <div><span>서로 다른 메인 카드</span><strong>{cardCounts(main).size}</strong><small>카드 ID 기준</small></div>
      </div>
      {warnings.length>0&&<div className="decklab-warnings" role="status"><AlertTriangle size={17}/><div><strong>덱 구성 검토</strong>{warnings.slice(0,8).map((w,i)=><p key={i}>{w}</p>)}{warnings.length>8&&<p>추가 경고 {warnings.length-8}건</p>}</div></div>}
      {study&&<div className="decklab-notes">
        <label>연구안 이름<input value={study.name} maxLength={180} onChange={e=>modify(s=>({...s,name:e.target.value}))} aria-label="연구안 이름"/></label>
        <label>전개 루트·말림 원인 메모<textarea value={study.notes} maxLength={5000} rows={2} placeholder="초동 후 실제 전개 과정은 실전 테스트로 따로 검증해." onChange={e=>modify(s=>({...s,notes:e.target.value}))}/></label>
      </div>}
      <div className="decklab-subhead"><div><span className="micro-label">DRAW PROBABILITY / EXACT</span><h3>첫 패 확률 계산</h3></div>
        <label><SlidersHorizontal size={14}/> 초기 패 <select aria-label="초기 패 장수" value={hand} onChange={e=>setHand(Number(e.target.value) as 5|6)}>
          <option value="5">5장</option><option value="6">6장</option></select></label></div>
      <div className="decklab-role-strip">{roleCounts.map(x=><span key={x.role}>{x.role} <strong>{x.count}장</strong></span>)}</div>
      <div className="decklab-prob-grid">
        <Probability label="초동 ≥1장" value={current.atLeastStarter} baseline={baseline?.atLeastStarter??null} foot="초동 태그 ≥1" enabled={current.starter>0}/>
        <Probability label="초동 + 전개보조 동시" value={current.starterAndExtender} baseline={baseline?.starterAndExtender??null} foot="두 역할 모두 패에 존재" enabled={current.starter>0&&current.extender>0}/>
        <Probability label="초동 없이 말림 ≥1장" value={current.noStarterWithBrick} baseline={baseline?.noStarterWithBrick??null} foot="지정 역할 기준" enabled={current.starter>0&&current.brick>0}/>
        <Probability label="말림 ≥2장" value={current.atLeastTwoBricks} baseline={baseline?.atLeastTwoBricks??null} foot="말림 태그 ≥2장" enabled={current.brick>0}/>
      </div>
      <p className="decklab-assumption"><AlertTriangle size={15}/> 역할 태그는 사용자가 직접 지정하며, 검색·드로우·덱 특수 소환·카드명 중복 효과와 실제 전개 성공률을 반영하지 않아. 패 5/6장을 비복원 무작위 추출한 정확한 확률이고, 카드군·금제 적법성도 별도 확인이 필요해.</p>
      <div className="decklab-subhead"><div><span className="micro-label">MAIN DECK / MANUAL CLASSIFICATION</span><h3>메인 덱 카드 및 역할</h3></div>
        <span>{study?'채용 매수와 역할 수정 가능':'분류하려면 새 분석안을 만들어 줘'}</span></div>
      {study&&<div className="decklab-add"><label>카드 ID 추가<input aria-label="추가할 카드 ID" value={newId} inputMode="numeric" maxLength={12} placeholder="예: 91008601" onChange={e=>setNewId(e.target.value)}/></label>
        <button type="button" className="outline-button" onClick={appendId}><Plus size={15}/> 메인 덱에 1장 추가</button><small>카드명은 가져온 CDB에 있는 경우만 표시해.</small></div>}
      <div className="decklab-list" role="table" aria-label="메인 덱 카드 역할 표">
        <div role="row" className="decklab-row decklab-row--head"><span>카드 / ID</span><span>매수</span><span>역할 태그 (중복 선택 가능)</span></div>
        {countGroups(main).map(([id,count])=><div key={id} role="row" className="decklab-row">
          <div className="decklab-card-name"><strong>{cardNames.get(id)||'카드명 미확인'}</strong><small>{id}</small></div>
          <div className="decklab-copy"><button aria-label={id+' 1장 줄이기'} disabled={!study||busy} onClick={()=>setCount(id,count-1)}>−</button><strong>{count}</strong><button aria-label={id+' 1장 늘리기'} disabled={!study||busy||count>=3} onClick={()=>setCount(id,count+1)}>+</button></div>
          <div className="decklab-tag-list">{DECK_ROLES.map(role=><label key={role}><input type="checkbox" aria-label={id+' '+role} disabled={!study||busy} checked={(tags[id]||[]).includes(role)} onChange={()=>modify(s=>toggleDeckRole(s,id,role))}/><span>{role}</span></label>)}</div>
        </div>)}
      </div>
      <div className="decklab-extras"><div><h3>엑스트라 덱 · {extra.length}장</h3>{countGroups(extra).map(([id,c])=><p key={id}><code>{id}</code> <span>{cardNames.get(id)||'카드명 미확인'}</span> ×{c}</p>)}{!extra.length&&<small>등록 없음</small>}</div>
        <div><h3>사이드 덱 · {side.length}장</h3>{countGroups(side).map(([id,c])=><p key={id}><code>{id}</code> <span>{cardNames.get(id)||'카드명 미확인'}</span> ×{c}</p>)}{!side.length&&<small>등록 없음</small>}</div></div>
      <p className="decklab-foot"><Check size={14}/> YDK 원본은 변경되지 않고, 연구안만 브라우저에 저장해. 실제 덱 강도·초동의 진짜 활용 가능성은 효과 구현과 EDOPro 테스트가 필요해.</p>
    </>}
  </section>;
}

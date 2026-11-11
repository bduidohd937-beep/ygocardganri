import './filecenter.css';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Check, ChevronDown, Database, Download, FileArchive, FileCode2, FileImage, FileText, FolderOpen, LoaderCircle, Plus, Search, Upload, X } from 'lucide-react';
import { createTheme, emptyFileCatalog, findAssetConflicts, NOCTURNA_ID } from './fileCatalog';
import type { FileCatalog, PreviewBatch, AssetEntry } from './fileCatalog';
import { commitImport, getOriginal, loadCatalog, saveCatalog } from './fileVault';

type Props = { view: 'themes'|'files' };
type Progress = { completed: number; total: number; filename: string };
type Response =
  | { type:'progress'; completed:number; total:number; filename:string }
  | { type:'done'; batch:PreviewBatch }
  | { type:'error'; message:string };
const KINDS = ['전체','CDB','Lua','이미지','YDK','ZIP'] as const;
const shortHash=(hash:string)=>hash.slice(0,12);
const fmt=(n:number)=>n>1024*1024?`${(n/1024/1024).toFixed(2)} MB`:`${(n/1024).toFixed(1)} KB`;

export default function FileCenter({view}:Props){
  const [catalog,setCatalog]=useState<FileCatalog>(emptyFileCatalog);
  const [ready,setReady]=useState(false);
  const [error,setError]=useState('');
  const [selectedTheme,setSelectedTheme]=useState(NOCTURNA_ID);
  const [newTheme,setNewTheme]=useState('');
  const [newDescription,setNewDescription]=useState('');
  const [adding,setAdding]=useState(false);
  const [processing,setProcessing]=useState(false);
  const [progress,setProgress]=useState<Progress|null>(null);
  const [preview,setPreview]=useState<PreviewBatch|null>(null);
  const [saving,setSaving]=useState(false);
  const [notice,setNotice]=useState('');
  const [filter,setFilter]=useState<typeof KINDS[number]>('전체');
  const [query,setQuery]=useState('');
  const fileInput=useRef<HTMLInputElement|null>(null);
  const worker=useRef<Worker|null>(null);
  const mounted=useRef(true);
  useEffect(()=>{
    mounted.current=true;
    void loadCatalog().then(d=>{if(mounted.current){setCatalog(d);setReady(true);}}).catch(e=>{if(mounted.current){setError(e instanceof Error?e.message:'파일 저장소를 열 수 없습니다.');setReady(true);}});
    return()=>{mounted.current=false;worker.current?.terminate();worker.current=null;};
  },[]);
  const themes=useMemo(()=>catalog.themes,[catalog.themes]);
  const activeTheme=themes.find(x=>x.id===selectedTheme)||themes[0];
  const listed=useMemo(()=>catalog.assets.filter(a=>a.themeId===selectedTheme && (filter==='전체'||a.kind===filter) && `${a.filename} ${a.cardId||''}`.toLowerCase().includes(query.toLowerCase())).slice().reverse().slice(0,200),[catalog.assets,selectedTheme,filter,query]);
  const cards=useMemo(()=>catalog.cards.filter(x=>x.themeId===selectedTheme),[catalog.cards,selectedTheme]);
  const decks=useMemo(()=>catalog.decks.filter(x=>x.themeId===selectedTheme),[catalog.decks,selectedTheme]);
  const conflicts=useMemo(()=>preview?findAssetConflicts(catalog,selectedTheme,preview.entries):[],[preview,catalog,selectedTheme]);
  const ambiguities=useMemo(()=>{
    if(!preview)return [];
    const issues:string[]=[];const ids=new Map<string,string>();
    for(const row of [...cards,...preview.entries.flatMap(p=>p.cards.map(c=>({...c,sourceId:p.sha256,themeId:selectedTheme,importedAt:'',confirmed:false as const})))]){
      const previous=ids.get(row.passcode);
      if(previous!==undefined && previous!==row.name+'\n'+row.effectText) issues.push(`CDB 원문 충돌: 카드 ID ${row.passcode}의 이름/효과가 파일마다 다릅니다.`);
      ids.set(row.passcode,row.name+'\n'+row.effectText);
    }
    const known=new Set([...cards.map(c=>c.passcode),...preview.entries.flatMap(e=>e.cards.map(c=>c.passcode))]);
    const ref=new Set(preview.entries.flatMap(e=>e.deck?[...e.deck.main,...e.deck.extra,...e.deck.side]:[]));
    const missing=[...ref].filter(code=>!known.has(code));
    if(missing.length)issues.push(`덱에서 참조한 카드 ${missing.length}종은 현재 이 테마의 CDB 목록에 없습니다 (공식 카드일 수도 있음).`);
    return [...new Set(issues)].slice(0,30);
  },[preview,cards,selectedTheme]);

  const create=async()=>{
    try{const next=createTheme(catalog,newTheme,newDescription);await saveCatalog(next);setCatalog(next);setSelectedTheme(next.themes.at(-1)!.id);setAdding(false);setNewTheme('');setNewDescription('');setNotice('새 테마를 만들었습니다. CDB·Lua·이미지 파일을 등록할 수 있습니다.');setError('');}
    catch(e){setError(e instanceof Error?e.message:String(e));}
  };
  const startParse=useCallback((files:File[])=>{
    if(!files.length||processing||saving)return;
    if(files.length>500){setError('한 번에 500개 파일까지만 가져올 수 있습니다.');return;}
    if(files.reduce((sum,f)=>sum+f.size,0)>60*1024*1024){setError('선택한 파일의 총 용량이 60MB를 넘습니다. 묶음을 나눠 업로드하세요.');return;}
    setError('');setNotice('');setPreview(null);setProcessing(true);setProgress({completed:0,total:files.length,filename:'파일 검사를 시작합니다'});
    const w=new Worker(new URL('./fileWorker.ts',import.meta.url),{type:'module'});
    worker.current=w;
    w.onmessage=(event:MessageEvent<Response>)=>{
      if(!mounted.current||worker.current!==w)return;
      const message=event.data;
      if(message.type==='progress'){setProgress({completed:message.completed,total:message.total,filename:message.filename});}
      if(message.type==='error'){setError(message.message);setProcessing(false);w.terminate();worker.current=null;}
      if(message.type==='done'){setPreview(message.batch);setProcessing(false);w.terminate();worker.current=null;}
    };
    w.onerror=()=>{setError('파서가 중단되었습니다. 파일이 너무 크거나 손상되었을 수 있습니다.');setProcessing(false);w.terminate();worker.current=null;};
    w.postMessage({command:'parse',files});
  },[processing,saving]);
  const cancel=()=>{worker.current?.terminate();worker.current=null;setProcessing(false);setProgress(null);setNotice('파일 분석을 취소했습니다. 저장된 파일은 변경되지 않았습니다.');};
  const commit=async()=>{
    if(!preview?.entries.length||!activeTheme)return;
    if(conflicts.length||ambiguities.length){if(!window.confirm(`중복/충돌 및 미등록 참조 ${conflicts.length+ambiguities.length}건이 있습니다. 기존 원본을 덮어쓰지 않고 별도 파일로 보존할까요?`))return;}
    setSaving(true);setError('');
    try {
      const result=await commitImport(catalog,activeTheme.id,preview.entries);
      if(!mounted.current)return;
      setCatalog(result.catalog);setPreview(null);setNotice(`${result.count}개 원본 파일을 현재 브라우저 IndexedDB에 보관했습니다. 승인 원문은 변경되지 않았습니다.`);
    }catch(e){if(mounted.current)setError(e instanceof Error?e.message:String(e));}
    finally{if(mounted.current)setSaving(false);}
  };
  const download=async(asset:AssetEntry)=>{
    try {
      const blob=await getOriginal(asset.id);
      const url=URL.createObjectURL(blob);
      const a=document.createElement('a');a.href=url;a.download=asset.filename;a.click();
      window.setTimeout(()=>URL.revokeObjectURL(url),1500);
    }catch(e){setError(e instanceof Error?e.message:String(e));}
  };
  if(!ready)return <div className="fc-initial"><LoaderCircle size={22}/> 파일 라이브러리 불러오는 중...</div>;
  return <section className="fc-root">
    {error&&<div className="fc-error" role="alert"><AlertTriangle size={17}/><span>{error}</span><button onClick={()=>setError('')} aria-label="오류 닫기"><X size={16}/></button></div>}
    {notice&&<div className="fc-notice" role="status"><Check size={16}/>{notice}</div>}
    {view==='themes' ? <>
      <div className="fc-section-heading"><div><span className="micro-label">ALL CUSTOM PROJECTS</span><h2>테마 라이브러리</h2><p>《녹투르나》 이외의 테마도 독립적으로 등록하고 파일을 관리합니다.</p></div><button className="primary-button" onClick={()=>setAdding(v=>!v)}><Plus size={16}/> 새 테마</button></div>
      {adding&&<form className="fc-theme-form" onSubmit={e=>{e.preventDefault();void create();}}><label>테마명<input required maxLength={100} placeholder="예: 코스모코드" value={newTheme} onChange={e=>setNewTheme(e.target.value)}/></label><label>설명 (선택)<input maxLength={500} placeholder="설계 메모 또는 카드군 설명" value={newDescription} onChange={e=>setNewDescription(e.target.value)}/></label><button className="primary-button" type="submit">테마 등록</button><button className="outline-button" type="button" onClick={()=>setAdding(false)}>취소</button></form>}
      <div className="fc-theme-grid">{themes.map((t,index)=><button key={t.id} className={`fc-theme-card ${selectedTheme===t.id?'fc-theme-card--active':''}`} onClick={()=>setSelectedTheme(t.id)}><span className="micro-label">THEME / {String(index+1).padStart(2,'0')}</span><strong>{t.name}</strong><span>{t.description||'설명 미확인'}</span><small>등록 파일 {catalog.assets.filter(a=>a.themeId===t.id).length}개 · CDB 카드 {catalog.cards.filter(c=>c.themeId===t.id).length}건</small></button>)}</div>
      <p className="fc-footnote">《녹투르나》의 카드 설계 문서는 기존 카드 작업실에 유지돼. 신규 테마는 현재 파일·카드 ID 목록 관리부터 지원하며, 모든 테마의 효과 편집 통합은 다음 단계야.</p>
    </> : <>
      <div className="fc-section-heading"><div><span className="micro-label">P2 / SAFE ASSET VAULT</span><h2>파일 센터</h2><p>원본을 보존하며 CDB·Lua·이미지·YDK·ZIP을 분석합니다. 자동 승인은 하지 않습니다.</p></div><span className="fc-mode">현재 브라우저 보관 · IndexedDB</span></div>
      <div className="fc-file-select"><label>파일을 보관할 테마 <select value={selectedTheme} onChange={e=>{setSelectedTheme(e.target.value);setPreview(null);}}>{themes.map(t=><option value={t.id} key={t.id}>{t.name}</option>)}</select></label><span>다른 카드군을 추가하려면 먼저 ‘테마 라이브러리’에서 새 테마를 등록하세요.</span></div>
      <div className={`fc-drop ${processing?'fc-drop--busy':''}`} onDragOver={e=>{e.preventDefault();e.dataTransfer.dropEffect='copy';}} onDrop={e=>{e.preventDefault();startParse(Array.from(e.dataTransfer.files));}}>
        <div className="fc-drop-mark"><Upload size={24}/></div>
        <h3>파일을 놓거나 선택해서 분석</h3>
        <p>SQLite CDB · c&lt;ID&gt;.lua · ID명 PNG/JPG/WebP · YDK · ZIP</p>
        <div className="fc-bounds">원본 최대 25MB · 전체 60MB · ZIP 해제 총량 60MB · 최대 500파일</div>
        <input ref={fileInput} type="file" multiple accept=".cdb,.lua,.png,.jpg,.jpeg,.webp,.ydk,.zip" className="fc-hidden" onChange={e=>{startParse(Array.from(e.target.files||[]));e.target.value='';}}/>
        <button className="primary-button" onClick={()=>fileInput.current?.click()} disabled={processing||saving}><FolderOpen size={15}/> 파일 선택</button>
        {processing&&<div className="fc-progress"><LoaderCircle size={17} className="fc-spin"/><span>분석 중 {progress?.completed||0} / {progress?.total||0} · {progress?.filename||''}</span><button onClick={cancel} className="outline-button">분석 중단</button></div>}
      </div>
      {preview&&<div className="fc-preview"><div className="fc-subheading"><div><span className="micro-label">PREVIEW · NO WRITES YET</span><h3>업로드 검토 · {preview.entries.length}개 저장 후보</h3></div><button onClick={()=>setPreview(null)} className="outline-button"><X size={15}/> 취소</button></div>
        <p>분석 결과는 아직 저장되지 않았어. 확인 후 ‘원본 보관 확정’을 누르면 파일과 추출 정보가 함께 저장돼.</p>
        {preview.errors.length>0&&<div className="fc-alert"><strong>파싱 실패 {preview.errors.length}건</strong>{preview.errors.slice(0,20).map((v,i)=><div key={i}>{v}</div>)}</div>}
        {(conflicts.length+ambiguities.length)>0&&<div className="fc-alert"><strong>중복·충돌·참조 확인 {conflicts.length+ambiguities.length}건</strong>{[...conflicts,...ambiguities].slice(0,25).map((v,i)=><div key={i}>{v}</div>)}</div>}
        <div className="fc-preview-list">{preview.entries.slice(0,120).map((e,i)=><div key={i}><span className="fc-kind">{e.kind}</span><strong>{e.filename}</strong><span>카드 ID: {e.cardId||'미확인 / 다중 카드'}</span><small>{fmt(e.size)} · {e.cards.length?`CDB 카드 ${e.cards.length}종`:`SHA256 ${shortHash(e.sha256)}…`}</small>{e.notes.map((n,j)=><em key={j}>{n}</em>)}</div>)}</div>
        {preview.entries.length>120&&<small>파일 목록은 최초 120개만 표시 (총 {preview.entries.length}개)</small>}
        <div className="fc-actions"><span>무시된 확장자: {preview.skipped}건</span><button className="primary-button" disabled={!preview.entries.length||saving} onClick={()=>void commit()}>{saving?'보관 중...':`원본 보관 확정 · ${preview.entries.length}개`}</button></div>
      </div>}
      <div className="fc-stat-grid"><div><span>원본 파일</span><strong>{catalog.assets.filter(a=>a.themeId===selectedTheme).length.toLocaleString('ko-KR')}</strong></div><div><span>CDB 카드 추출</span><strong>{cards.length.toLocaleString('ko-KR')}</strong></div><div><span>YDK 덱</span><strong>{decks.length.toLocaleString('ko-KR')}</strong></div></div>
      <div className="fc-subheading"><div><span className="micro-label">INDEXED ORIGINALS / {activeTheme?.name||''}</span><h3>보관된 파일</h3></div><div className="fc-filter"><Search size={15}/><input placeholder="파일명·카드 ID" value={query} onChange={e=>setQuery(e.target.value)}/><select aria-label="파일 종류" value={filter} onChange={e=>setFilter(e.target.value as typeof KINDS[number])}>{KINDS.map(k=><option key={k}>{k}</option>)}</select><ChevronDown size={13}/></div></div>
      {!listed.length?<div className="fc-empty"><FileArchive size={26}/><strong>아직 보관된 원본 파일이 없습니다.</strong><p>테마를 선택한 뒤 파일을 업로드하면 목록에 나타납니다.</p></div>:<div className="fc-file-list">{listed.map(a=><div className="fc-file-row" key={a.id}><div className="fc-file-icon">{a.kind==='CDB'?<Database size={20}/>:a.kind==='Lua'?<FileCode2 size={20}/>:a.kind==='이미지'?<FileImage size={20}/>:a.kind==='ZIP'?<FileArchive size={20}/>:<FileText size={20}/>}</div><div className="fc-file-meta"><strong>{a.filename}</strong><small>{a.kind} · {a.cardId||'다중/미확인'} · {fmt(a.size)} · SHA256 {shortHash(a.sha256)}…</small>{a.notes.length>0&&<em>{a.notes.join(' · ')}</em>}</div><button className="outline-button" onClick={()=>void download(a)} title="브라우저에 보관된 원본을 내려받습니다"><Download size={14}/> 원본</button></div>)}</div>}
      {catalog.assets.filter(a=>a.themeId===selectedTheme).length>200&&<p className="fc-footnote">성능 보호를 위해 최대 200개 파일만 목록에 표시해. 검색 조건으로 좁혀 봐.</p>}
      {cards.length>0&&<><div className="fc-subheading"><div><span className="micro-label">IMPORTED CARD INDEX · NOT APPROVED</span><h3>CDB 카드 인덱스 · {cards.length}개 추출</h3></div></div><div className="fc-index-list">{cards.slice(-30).reverse().map((c,i)=><div key={`${c.sourceId}-${i}`}><code>{c.passcode}</code><strong>{c.name||'카드명 미확인'}</strong><span>{c.effectText?'원문 추출됨 / 미승인':'효과 미확인'}</span></div>)}</div>{cards.length>30&&<p className="fc-footnote">가장 최근 30개만 표시. 전체 카드 등록·편집은 다음 단계에서 연결해.</p>}</>}
      {decks.length>0&&<><div className="fc-subheading"><div><span className="micro-label">YDK RECIPE INDEX</span><h3>덱 파일</h3></div></div><div className="fc-index-list">{decks.slice(-15).reverse().map(d=><div key={d.id}><strong>{d.name}</strong><span>메인 {d.main.length} / 엑스트라 {d.extra.length} / 사이드 {d.side.length}</span></div>)}</div></>}
      <p className="fc-footnote"><AlertTriangle size={14}/> JSON 카드 백업에는 업로드한 바이너리 원본이 포함되지 않아. 원본 파일은 이 브라우저의 IndexedDB에만 존재하므로 기기·브라우저 데이터를 삭제하기 전에 원본을 따로 보관해야 해. 업로드만으로 OCG·Lua·EDOPro 검증 완료가 되지 않아.</p>
    </>}
  </section>;
}
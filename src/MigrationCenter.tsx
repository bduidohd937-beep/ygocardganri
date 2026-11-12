import { useEffect,useRef,useState, type ChangeEvent } from 'react';
import { Archive,ArrowRight,CheckCircle2,Database,Download,FileArchive,FileCheck,FileInput,HardDrive,Info,Link2,RefreshCw,ShieldAlert,ShieldCheck,Upload } from 'lucide-react';
import JSZip from 'jszip';
import { mergeCatalog, emptyCatalog, validateCatalog, CATALOG_KEY } from './sharedCatalog';
import type { ImportCandidate,MergePreview,SharedCatalog } from './sharedCatalog';
import { MIGRATION_LIMITS, inspectMigrationFile,metadataCandidate,parseMigrationContent,safeBackupFilename } from './migrationModel';
import type { MigrationInspection } from './migrationModel';
import { fetchOriginal,hashFile,listMigrationEntries,markEntryChecked,saveOriginal,verifyOriginal,buildMigrationManifest } from './migrationVault';
import type { MigrationEntry } from './migrationVault';
import type { StudioData } from './data';
import './migration-center.css';

type Pending={file:File;hash:string;inspection:MigrationInspection;duplicate:boolean};
type RestorePreview={entry:MigrationEntry;incoming:ImportCandidate;compare:MergePreview;oldRaw:string|null};
type Props={studioData:StudioData;onNavigate:(target:'shared'|'artlab'|'cardmaker'|'arena'|'settings')=>void};
const legacy=[
  {name:'기존 카드 작업실',repo:'ygocardganri',hint:'백업·설정 → 녹투르나 원장 / 외부 작업 문서 JSON 내보내기'},
  {name:'카드 렌더러',repo:'ygocardmaker',hint:'프로젝트 JSON 내보내기 · 이미지/ZIP은 별도 다운로드'},
  {name:'이미지 연구소',repo:'ygoimeagemaker',hint:'생성 이미지 ZIP과 사용한 CDB·CSV 자료를 각각 백업. 구형 사이트에는 설정 전체 내보내기가 없을 수 있음'},
  {name:'덱·검수 실험실',repo:'YU-GI-OH-DESIGN-LAB',hint:'YDK·분석 보고서·파일 자료실 원본을 별도 내보내기'},
  {name:'AI 검증 관제실',repo:'PSH-AI-ARENA',hint:'기존 관제실 → JSON 전체 백업. 세션/결함 CSV는 보조 자료'},
];
function downloadBlob(blob:Blob,name:string){
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();
  window.setTimeout(()=>URL.revokeObjectURL(url),2000);
}
function fmt(bytes:number){return bytes>=1048576?(bytes/1048576).toFixed(2)+' MiB':Math.ceil(bytes/1024)+' KiB';}
function asObject(v:unknown):v is Record<string,unknown>{return v!==null&&typeof v==='object'&&!Array.isArray(v);}
async function makerProject():Promise<unknown>{
  if(typeof indexedDB.databases==='function'){
    const dbs=await indexedDB.databases();
    if(!dbs.some(d=>d.name==='duelmind-card-studio'))throw Error('통합 카드 렌더러에서 저장한 프로젝트가 없습니다.');
  }
  const db=await new Promise<IDBDatabase>((resolve,reject)=>{
    const req=indexedDB.open('duelmind-card-studio',1);
    req.onupgradeneeded=()=>req.transaction?.abort();
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(Error('카드 렌더러 저장소를 열지 못했습니다.'));
  });
  try{
    if(!db.objectStoreNames.contains('projects'))throw Error('카드 렌더러의 저장 구조를 확인하지 못했습니다.');
    const obj=await new Promise<unknown>((resolve,reject)=>{
      const req=db.transaction('projects','readonly').objectStore('projects').get('current');
      req.onsuccess=()=>resolve(req.result);
      req.onerror=()=>reject(Error('카드 렌더러 자료 읽기 실패'));
    });
    if(!obj)throw Error('카드 렌더러에 현재 저장된 프로젝트가 없습니다.');
    return obj;
  }finally{db.close();}
}
function readCatalog():{data:SharedCatalog;raw:string|null}{
  const raw=localStorage.getItem(CATALOG_KEY);
  if(!raw)return {data:emptyCatalog(),raw:null};
  const parsed:unknown=JSON.parse(raw);
  if(!validateCatalog(parsed))throw Error('현재 공통 카드 보관함 구조가 손상됐습니다. 덮어쓰지 않습니다.');
  return {data:parsed,raw};
}
export default function MigrationCenter({studioData,onNavigate}:Props){
  const [entries,setEntries]=useState<MigrationEntry[]>([]);
  const [pending,setPending]=useState<Pending[]>([]);
  const [restore,setRestore]=useState<RestorePreview|null>(null);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [busy,setBusy]=useState(false);
  const [ready,setReady]=useState(false);
  const fileRef=useRef<HTMLInputElement|null>(null);
  const refresh=async()=>{setEntries(await listMigrationEntries());};
  useEffect(()=>{let mounted=true;listMigrationEntries().then(r=>{if(mounted){setEntries(r);setReady(true);}}).catch(e=>{if(mounted){setError('원본 보관함을 열 수 없습니다: '+String(e));setReady(false);}});return()=>{mounted=false;};},[]);
  async function inspect(files:File[]){
    if(busy||!files.length)return;
    if(files.length>MIGRATION_LIMITS.maxFiles){setError('한 번에 30개 이하의 파일만 선택하세요.');return;}
    setBusy(true);setError('');setNotice('');setRestore(null);
    try{
      const seen=new Set(entries.map(e=>e.hash));
      const results:Pending[]=[];
      for(const file of files){
        if(file.size>MIGRATION_LIMITS.fileBytes)throw Error(file.name+' — 파일당 40MiB 제한');
        const ext=file.name.toLowerCase().split('.').pop();
        const str=['json','ydk'].includes(ext??'')?await file.text():'';
        const inspection=parseMigrationContent(file.name,str);
        const hash=await hashFile(file);
        results.push({file,hash,inspection,duplicate:seen.has(hash)});
        seen.add(hash);
      }
      setPending(results);
      setNotice(results.length+'개 파일 검사 완료. 원본 파일과 해시를 확인한 후 보관을 승인하세요.');
    }catch(e){setError('파일 검사 실패: '+String(e));setPending([]);}
    finally{setBusy(false);}
  }
  async function receive(e:ChangeEvent<HTMLInputElement>){
    const files=Array.from(e.target.files??[]);e.target.value='';
    await inspect(files);
  }
  async function capture(kind:'studio'|'cardmaker'|'artlab'|'psh'|'shared'){
    try{
      let data:unknown,name='';
      switch(kind){
        case 'studio': data={...studioData,app:'YGO CARD STUDIO',exportedAt:new Date().toISOString()};name='YGO_STUDIO_현재_녹투르나_원장.json';break;
        case 'cardmaker':data=await makerProject();name='YGO_STUDIO_현재_카드렌더러_프로젝트.json';break;
        case 'artlab':{
          const txt=localStorage.getItem('ygo-art-lab-v1.1');
          if(!txt)throw Error('현재 이미지 연구소에 저장된 설정이 없습니다.');
          data=JSON.parse(txt);name='YGO_STUDIO_현재_이미지연구소_설정.json';break;
        }
        case 'psh':{
          const txt=localStorage.getItem('psh-ai-arena-control-v1');
          if(!txt)throw Error('현재 검증 관제실에서 저장된 기록을 찾지 못했습니다.');
          const v:unknown=JSON.parse(txt);
          data={app:'PSH AI ARENA 검증 관제실',schemaVersion:1,exportedAt:new Date().toISOString(),data:v};
          name='YGO_STUDIO_현재_PSH관제실_기록.json';break;
        }
        case 'shared':{
          const txt=localStorage.getItem(CATALOG_KEY);
          if(!txt)throw Error('현재 공통 카드·덱 보관함에 저장된 자료가 없습니다.');
          data=JSON.parse(txt);name='YGO_STUDIO_현재_공통카드덱.json';break;
        }
      }
      const f=new File([JSON.stringify(data,null,2)],name,{type:'application/json'});
      await inspect([f]);
    }catch(e){setError('현재 자료 읽기 실패: '+String(e));}
  }
  async function saveBatch(){
    if(!pending.length||busy)return;
    setBusy(true);setError('');setNotice('');
    let added=0,duplicate=0,failed=0;
    const messages:string[]=[];
    for(const p of pending){
      if(p.inspection.blocked){failed++;messages.push(p.file.name+': 데이터 검증 실패');continue;}
      try{
        const v=await saveOriginal(p.file,p.inspection,p.hash);
        if(v.duplicate)duplicate++;
        else if(await verifyOriginal(v.entry.hash))added++;
        else{failed++;messages.push(p.file.name+': 보관 후 해시 검증 실패');}
      }catch(e){failed++;messages.push(p.file.name+': '+String(e));}
    }
    try{await refresh();}catch(e){messages.push('목록 새로고침 실패: '+String(e));}
    setPending([]);
    setBusy(false);
    setNotice('원본 '+added+'개 저장 및 SHA-256 재검증 완료 · 동일 파일 '+duplicate+'개 중복 제외');
    if(failed||messages.length)setError(failed+'개 파일 처리 문제: '+messages.join(' | ').slice(0,1300));
  }
  async function downloadEntry(entry:MigrationEntry){
    try{
      setError('');const verified=await verifyOriginal(entry.hash);
      if(!verified)throw Error('저장 원본과 해시가 일치하지 않습니다. 다운로드를 차단했습니다.');
      const blob=await fetchOriginal(entry.hash);
      downloadBlob(blob,safeBackupFilename(entry.name));
      setNotice(entry.name+' — 저장된 원본 해시 확인 후 다운로드를 시작했습니다.');
    }catch(e){setError('원본 다운로드 실패: '+String(e));}
  }
  async function exportAll(){
    if(!entries.length||busy)return;
    setBusy(true);setError('');setNotice('');
    try{
      const total=entries.reduce((n,e)=>n+e.bytes,0);
      if(total>MIGRATION_LIMITS.zipTotalBytes)throw Error('보관한 파일 총합이 120MiB를 초과합니다. 개별 파일로 내려받으세요.');
      const zip=new JSZip();
      for(const [i,e] of entries.entries()){
        if(!(await verifyOriginal(e.hash)))throw Error(e.name+' 파일이 저장된 해시와 일치하지 않습니다.');
        const blob=await fetchOriginal(e.hash);
        const path='원본/'+String(i+1).padStart(3,'0')+'_'+e.hash.slice(0,10)+'_'+safeBackupFilename(e.name);
        zip.file(path,blob);
      }
      zip.file('검증목록.json',await buildMigrationManifest(entries));
      zip.file('사용안내.txt','YGO STUDIO V2.1 원본 보관 ZIP\n파일 무결성은 검증목록.json SHA-256과 비교해 확인할 수 있습니다.\n앱별 복원은 수동 검증 후 진행하며 자동 원본 덮어쓰기는 수행하지 않습니다.\n브라우저 보관함은 클라우드 백업이 아닙니다.\n');
      const out=await zip.generateAsync({type:'blob',compression:'STORE',streamFiles:true});
      downloadBlob(out,'YGO_STUDIO_기존사이트_원본백업_모음.zip');
      setNotice(entries.length+'개 파일을 SHA-256으로 재검증 후 ZIP 내보내기를 시작했습니다. 다운로드 폴더의 파일을 확인하세요.');
    }catch(e){setError('통합 ZIP 내보내기 실패: '+String(e));}
    finally{setBusy(false);}
  }
  async function previewMetadata(entry:MigrationEntry){
    setError('');setNotice('');setRestore(null);
    try{
      if(!entry.canMergeMetadata)throw Error('이 형식은 공통 카드·덱 메타 병합을 지원하지 않습니다. 원본 보관만 지원합니다.');
      if(!(await verifyOriginal(entry.hash)))throw Error('원본 파일 해시가 일치하지 않습니다.');
      const blob=await fetchOriginal(entry.hash);
      const candidate=metadataCandidate(entry.kind,await blob.text(),entry.name);
      if(!candidate)throw Error('해당 파일의 메타데이터를 추출할 수 없습니다.');
      const {data,raw}=readCatalog();
      const compare=mergeCatalog(data,candidate);
      setRestore({entry,incoming:candidate,compare,oldRaw:raw});
    }catch(e){setError('메타 병합 검토 실패: '+String(e));}
  }
  async function confirmMetadata(){
    if(!restore||busy)return;
    setBusy(true);setError('');
    try{
      const current=readCatalog();
      if(current.raw!==restore.oldRaw)throw Error('검토 후 공통 보관함이 변경됐습니다. 다시 비교하고 승인하세요.');
      const before=new File([current.raw??JSON.stringify(current.data)],'공통카드덱_이전전_자동보존.json',{type:'application/json'});
      const inspected=inspectMigrationFile(before.name,JSON.parse(await before.text()));
      const snapshot=await saveOriginal(before,inspected);
      if(!(await verifyOriginal(snapshot.entry.hash)))throw Error('변경 전 자료 원본 해시 검증에 실패했습니다. 병합하지 않습니다.');
      const compare=mergeCatalog(current.data,restore.incoming);
      const next=JSON.stringify(compare.catalog);
      localStorage.setItem(CATALOG_KEY,next);
      if(localStorage.getItem(CATALOG_KEY)!==next){
        if(current.raw===null)localStorage.removeItem(CATALOG_KEY);else localStorage.setItem(CATALOG_KEY,current.raw);
        throw Error('저장 후 일치 검증 실패. 이전 상태로 복원 시도했습니다.');
      }
      await refresh();
      setNotice('공통 카드 '+compare.addedCards+'장·덱 '+compare.addedDecks+'개 신규 등록. 카드 충돌 '+compare.conflicts+'건은 원본 유지. 변경 전 보관함 원본 사본을 별도로 저장했습니다.');
      setRestore(null);
    }catch(e){setError('메타 병합 실패: '+String(e));}
    finally{setBusy(false);}
  }
  async function markChecked(entry:MigrationEntry){
    try{
      if(!entry.userCheckedAt){
        const verified=await verifyOriginal(entry.hash);
        if(!verified)throw Error('저장된 원본의 SHA-256이 맞지 않습니다.');
        if(!window.confirm('이 원본의 복원/대상 앱 반영 여부를 직접 확인했나요? 앱은 실제 복원 완료를 자동 검증하지 않습니다.'))return;
      }
      await markEntryChecked(entry.hash,!entry.userCheckedAt);
      await refresh();
    }catch(e){setError('확인 상태 변경 실패: '+String(e));}
  }
  const stored=entries.filter(e=>e.userCheckedAt!==null).length;
  return <div className="migration-center">
    <header className="migration-head">
      <div><span className="migration-kicker">YGO STUDIO / DATA MIGRATION · V2.1</span>
      <h1>기존 사이트 데이터 이전 센터</h1>
      <p>구형 사이트 원본을 보존하고 SHA-256으로 검증합니다. 기존 카드·CDB·Lua·리플레이는 자동 덮어쓰지 않습니다.</p></div>
      <button className="migration-primary" disabled={!entries.length||busy} onClick={()=>void exportAll()}><Download size={16}/> 원본 전체 ZIP 내보내기</button>
    </header>
    <div className="migration-stats">
      <div><HardDrive size={17}/><span>보관한 원본</span><strong>{entries.length}</strong></div>
      <div><Archive size={17}/><span>보관 총 용량</span><strong>{fmt(entries.reduce((a,e)=>a+e.bytes,0))}</strong></div>
      <div><CheckCircle2 size={17}/><span>사용자가 복원 확인한 파일</span><strong>{stored}/{entries.length}</strong></div>
    </div>
    <aside className="migration-alert"><ShieldAlert size={19}/><span><strong>사이트 폐쇄 전 확인</strong> 이전 사이트의 브라우저 저장소는 자동으로 읽을 수 없습니다. 원본을 이곳에 등록한 뒤 ZIP을 PC에 내려받고, 대상 모듈에서 실제 열리는 것까지 확인하세요. 이 센터의 저장소도 현재 브라우저에만 존재합니다.</span></aside>
    {!!error&&<p className="migration-error" role="alert">{error}</p>}
    {!!notice&&<p className="migration-message" role="status">{notice}</p>}
    <section className="migration-section">
      <div className="migration-section-heading"><div><span>01 / LEGACY SOURCES</span><h2>구형 사이트별 자료 확보</h2></div><span className="migration-secondary">GitHub 저장소는 삭제하지 않음</span></div>
      <div className="migration-sources">{legacy.map(item=><div key={item.repo} className="migration-source"><div><strong>{item.name}</strong><p>{item.hint}</p></div><a href={'https://github.com/bduidohd937-beep/'+item.repo} target="_blank" rel="noopener noreferrer">원본 저장소 <ArrowRight size={13}/></a></div>)}</div>
      <div className="migration-quick"><strong>현재 통합 사이트에 저장된 항목 빠른 백업</strong><p>내가 지금 사용 중인 브라우저의 기록만 읽습니다. 구형 독립 사이트의 저장 자료는 자동으로 가져오지 않습니다.</p>
      <div className="migration-actions">{([
        ['studio','녹투르나 원장'],['cardmaker','카드 렌더러'],['artlab','이미지 연구소 설정'],['psh','PSH 관제 기록'],['shared','공통 카드·덱']
      ] as const).map(([k,label])=><button key={k} disabled={busy} onClick={()=>void capture(k)}><FileInput size={14}/> {label} 읽기</button>)}</div></div>
    </section>
    <section className="migration-section">
      <div className="migration-section-heading"><div><span>02 / REVIEW FILES</span><h2>원본 파일 검사 · 보관 승인</h2></div><span className="migration-secondary">파일당 40MiB · 최대 30개</span></div>
      <div className="migration-upload"><Upload size={23}/><strong>구형 사이트에서 내보낸 파일을 선택하세요</strong><p>JSON · YDK · CSV · ZIP · 이미지 · CDB · Lua · YRP(X) 등 원본을 지원합니다. 서버로 업로드하지 않고 이 브라우저에서 보관합니다.</p>
        <input ref={fileRef} type="file" multiple aria-label="이전 원본 파일 선택" onChange={e=>void receive(e)} accept=".json,.ydk,.csv,.zip,.png,.jpg,.jpeg,.webp,.cdb,.lua,.yrp,.yrpx,.txt,.log" hidden/>
        <button disabled={busy} onClick={()=>fileRef.current?.click()}>파일 여러 개 선택</button>
      </div>
      {pending.length>0&&<div className="migration-pending">
        <h3>보관 전 검토 · {pending.length}개</h3>
        {pending.map((p,i)=><div className="migration-pending-item" key={p.hash+'-'+i}>
          <div><strong>{p.file.name}</strong><small>{p.inspection.label} · {fmt(p.file.size)} · {p.inspection.count===null?'자료 수 미확인':p.inspection.count+'건'}</small>
          <p>{p.inspection.note}</p><code>SHA-256 {p.hash.slice(0,20)}…</code></div>
          <span className={p.inspection.blocked?'migration-danger':p.duplicate?'migration-muted':'migration-good'}>{p.inspection.blocked?'검증 실패':p.duplicate?'중복 원본':'보관 가능'}</span>
        </div>)}
        <div className="migration-actions"><button className="migration-primary" disabled={busy||!pending.some(p=>!p.inspection.blocked)} onClick={()=>void saveBatch()}><ShieldCheck size={15}/> 정상 파일을 원본 그대로 보관</button><button onClick={()=>setPending([])}>취소</button></div>
      </div>}
    </section>
    <section className="migration-section">
      <div className="migration-section-heading"><div><span>03 / HASH-VERIFIED ARCHIVE</span><h2>보관된 원본 · 복원 검토</h2></div><button onClick={()=>void refresh().catch(e=>setError(String(e)))}><RefreshCw size={14}/> 새로고침</button></div>
      {!ready?<p className="migration-empty">원본 보관함 상태를 확인하는 중이거나 브라우저 저장소를 열 수 없습니다.</p>:
      !entries.length?<p className="migration-empty">보관된 원본이 없습니다. 구형 사이트에서 파일을 다운로드한 뒤 위에서 가져오세요.</p>:
      <div className="migration-entries">{entries.map(entry=><article className="migration-entry" key={entry.hash}>
        <div className="migration-entry-main"><div className="migration-entry-title"><FileArchive size={18}/><strong>{entry.name}</strong><span>{entry.label}</span></div>
          <p>{entry.note}</p>
          <div className="migration-entry-meta"><span>{fmt(entry.bytes)}</span><code>SHA-256 {entry.hash.slice(0,16)}…</code><span>{entry.count===null?'내부 자료 수 미검증':entry.count+'건 추정'}</span></div>
          <small>{entry.userCheckedAt?'사용자 복원 확인 기록 있음 · 자동 앱 검증 아님':'원본 해시 보관됨 · 대상 앱 복원 미확인'}</small></div>
        <div className="migration-entry-actions">
          <button onClick={()=>void downloadEntry(entry)}><Download size={14}/> 원본 내려받기</button>
          {entry.canMergeMetadata&&<button onClick={()=>void previewMetadata(entry)}><Database size={14}/> 공통 메타 병합 검토</button>}
          <button onClick={()=>void markChecked(entry)}><FileCheck size={14}/>{entry.userCheckedAt?'확인 취소':'복원 확인 표시'}</button>
        </div>
      </article>)}</div>}
      {restore&&<div className="migration-compare" role="region" aria-label="데이터 병합 검토">
        <h3>공통 카드·덱 메타 병합 검토</h3><p><strong>{restore.entry.name}</strong> · 원본 파일은 유지되며 새 카드 메타만 추가합니다.</p>
        <div className="migration-compare-grid">
          <div><span>신규 카드</span><strong>{restore.compare.addedCards}</strong></div>
          <div><span>신규 덱</span><strong>{restore.compare.addedDecks}</strong></div>
          <div><span>동일 카드</span><strong>{restore.compare.duplicateCards}</strong></div>
          <div><span>카드 ID 충돌</span><strong>{restore.compare.conflicts}</strong></div>
          <div><span>유효하지 않은 자료</span><strong>{restore.compare.skippedInvalid}</strong></div>
        </div>
        <p className="migration-warning">카드 ID가 같고 원문이 다른 데이터는 기존 내용을 보존합니다. 원래 보관함을 SHA-256 백업한 뒤 신규 자료만 반영합니다. 이미지·승인·검증·리플레이는 이 작업으로 이전되지 않습니다.</p>
        <div className="migration-actions"><button className="migration-primary" disabled={busy} onClick={()=>void confirmMetadata()}>검토 내용대로 신규 메타만 병합</button><button onClick={()=>setRestore(null)}>취소</button></div>
      </div>}
    </section>
    <section className="migration-section">
      <div className="migration-section-heading"><div><span>04 / VERIFY BEFORE SHUTDOWN</span><h2>구형 사이트 종료 전 최종 확인</h2></div></div>
      <div className="migration-checks">
        <div><ShieldCheck size={17}/><span>모든 관련 원본을 수집하고 **PC에 ZIP을 다운로드**했는가?</span></div>
        <div><Link2 size={17}/><span>통합 사이트의 카드·덱·이미지·검수 도구에서 실제 자료를 열어 보았는가?</span></div>
        <div><FileCheck size={17}/><span>원본의 SHA-256과 파일 개수, 충돌 항목을 직접 확인했는가?</span></div>
        <div><Info size={17}/><span>구형 사이트의 데이터가 남아 있다면 **지금은 종료하지 않는다.** GitHub 소스 저장소는 유지한다.</span></div>
      </div>
      <div className="migration-actions"><button onClick={()=>onNavigate('shared')}>공통 카드·덱 보관함 열기 <ArrowRight size={14}/></button>
        <button onClick={()=>onNavigate('cardmaker')}>카드 렌더러 열기 <ArrowRight size={14}/></button>
        <button onClick={()=>onNavigate('arena')}>PSH 검증 관제실 열기 <ArrowRight size={14}/></button>
        <button onClick={()=>onNavigate('settings')}>현재 사이트 백업 설정 <ArrowRight size={14}/></button></div>
    </section>
  </div>;
}

import {useEffect,useMemo,useState} from 'react';
import {BookOpen,Download,FileCode2,FileJson,ImagePlus,Plus,RefreshCcw,Search,Upload} from 'lucide-react';
import JSZip from 'jszip';
import type {SharedCatalog} from './sharedCatalog';
import {emptyCatalog,validCardId} from './sharedCatalog';
import {loadCatalog,getOriginal} from './fileVault';
import type {FileCatalog} from './fileCatalog';
import {listMedia,type MediaItem} from './sharedMedia';
import {buildUnifiedIndex} from './unifiedCardIndex';
import {
  genericBackup,genericCsv,genericFolder,genericRecordsOrSeed,parseGenericBackup,
  searchGeneric,validateGenericRecords,type GenericRecord,type GenericAdoption,
  type GenericBuild,type GenericDuel,type GenericSlot
} from './genericCatalog';
import {loadGenericAssets,makeGenericAsset,restoreGenericAssets,saveGenericAsset,type GenericAsset} from './genericVault';
import './generic-encyclopedia.css';

type Props={
  records:GenericRecord[]|undefined;
  sharedCatalog:SharedCatalog|null;
  onChange:(next:GenericRecord[])=>void;
  onOpenFiles:()=>void;
};
const SLOTS:{key:GenericSlot;label:string}[]=[
  {key:'original',label:'원본 일러스트'},
  {key:'overframe',label:'오버프레임'},
  {key:'final',label:'최종본'},
];
const ADOPTIONS:GenericAdoption[]=['채택','보류','폐기'];
const BUILDS:GenericBuild[]=['미확인','제작 기록','파일 확인'];
const DUELS:GenericDuel[]=['미검증','검증 중','통과','오류'];
function download(name:string,blob:Blob){
  const url=URL.createObjectURL(blob);
  const link=document.createElement('a');link.href=url;link.download=name;
  document.body.appendChild(link);link.click();link.remove();
  window.setTimeout(()=>URL.revokeObjectURL(url),1200);
}
function assetFileName(slot:GenericSlot,mime:string,cardId:string):string{
  if(slot==='lua')return cardId?'c'+cardId+'.lua':'Lua_원문.lua';
  const prefix=slot==='original'?'원본_일러스트':slot==='overframe'?'오버프레임_이미지':'최종본';
  return prefix+(mime==='image/png'?'.png':mime==='image/webp'?'.webp':'.jpg');
}
export default function GenericEncyclopedia({records:input,sharedCatalog,onChange,onOpenFiles}:Props){
  const records=useMemo(()=>genericRecordsOrSeed(input),[input]);
  const [query,setQuery]=useState('');
  const [filter,setFilter]=useState<GenericAdoption|'전체'>('전체');
  const [selectedKey,setSelectedKey]=useState('card-990470201');
  const [assets,setAssets]=useState<GenericAsset[]>([]);
  const [files,setFiles]=useState<FileCatalog|null>(null);
  const [media,setMedia]=useState<MediaItem[]>([]);
  const [loading,setLoading]=useState(false);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [memo,setMemo]=useState('');
  const [nameDraft,setNameDraft]=useState('');
  const [linkedUrl,setLinkedUrl]=useState('');
  const [urls,setUrls]=useState<Record<string,string>>({});
  const shared=useMemo(()=>sharedCatalog||emptyCatalog(),[sharedCatalog]);
  const index=useMemo(()=>files?buildUnifiedIndex(shared,media,files):null,[sharedCatalog,files,media]);
  const byId=useMemo(()=>new Map((index?.rows||[]).map(r=>[r.id,r])),[index]);
  const references=useMemo(()=>new Map((index?.rows||[]).map(r=>[
    r.id,{name:r.name,effect:r.card?.effect||r.cdb[0]?.effectText||'',attribute:''}
  ])),[index]);
  const shown=useMemo(()=>searchGeneric(records,query,filter,references),[records,query,filter,references]);
  const current=records.find(r=>r.key===selectedKey)||records[0];
  const linked=current?.id?byId.get(current.id):undefined;
  const assetByKey=useMemo(()=>new Map(assets.map(a=>[a.id,a])),[assets]);
  const getAsset=(slot:GenericSlot)=>current&&assetByKey.get(current.key+'::'+slot);
  const summary={
    adopted:records.filter(r=>r.adoption==='채택').length,
    pending:records.filter(r=>r.adoption==='보류').length,
    rejected:records.filter(r=>r.adoption==='폐기').length,
    verified:records.filter(r=>r.duel==='통과').length,
  };
  const refresh=async()=>{
    setLoading(true);
    try{
      const [f,m,a]=await Promise.all([loadCatalog(),listMedia(),loadGenericAssets()]);
      setFiles(f);setMedia(m);setAssets(a);setMessage('');
    }catch(e){setMessage('연결 자료 일부를 읽지 못했습니다. 기존 파일은 변경하지 않았습니다: '+String(e));}
    finally{setLoading(false);}
  };
  useEffect(()=>{void refresh();},[]);
  useEffect(()=>{setNameDraft(current?.name||'');setMemo('');},[current?.key]);
  useEffect(()=>{
    const paths:Record<string,string>={};
    const genericKeys=new Set(records.map(r=>r.key));
    const genericIds=new Set(records.map(r=>r.id).filter(Boolean));
    for(const a of assets)if(a.slot!=='lua'&&genericKeys.has(a.key))paths[a.id]=URL.createObjectURL(a.blob);
    for(const m of media)if(genericIds.has(m.id))paths['shared-'+m.id]=URL.createObjectURL(m.blob);
    setUrls(paths);
    return()=>Object.values(paths).forEach(url=>URL.revokeObjectURL(url));
  },[assets,media,records]);
  useEffect(()=>{
    let active=true;let url='';
    setLinkedUrl('');
    if(!linked?.image&&linked?.fileImages.length){
      void getOriginal(linked.fileImages[0].id).then(blob=>{
        if(!active)return;
        url=URL.createObjectURL(blob);setLinkedUrl(url);
      }).catch(()=>{if(active)setLinkedUrl('');});
    }
    return()=>{active=false;if(url)URL.revokeObjectURL(url);};
  },[current?.id,linked?.fileImages[0]?.id,linked?.image]);
  const mutate=(patch:Partial<GenericRecord>)=>{
    if(!current)return;
    const next=records.map(r=>r.key===current.key?{...r,...patch}:r);
    if(!validateGenericRecords(next)){setMessage('저장할 값이 올바르지 않습니다. 중복 ID·필드 길이를 확인하세요.');return;}
    onChange(next);
  };
  const changeId=(value:string)=>{
    if(!current)return;
    if(value&&(!validCardId(value)||records.some(r=>r.key!==current.key&&r.id===value))){
      setMessage('카드 ID가 올바르지 않거나 이미 등록되어 있습니다.');return;
    }
    setMessage('');mutate({id:value});
  };
  const changeName=()=>{
    if(nameDraft.trim()&&nameDraft.trim()!==current?.name)mutate({name:nameDraft.trim()});
    else setNameDraft(current?.name||'');
  };
  const add=()=>{
    const key='new-'+(crypto.randomUUID?.()||Date.now().toString(36));
    const record:GenericRecord={key,id:'',name:'신규 범용 카드',role:'',attribute:'',effect:'',
      version:'V0.1',adoption:'보류',cdb:'미확인',lua:'미확인',duel:'미검증',issues:'',history:[]};
    onChange([...records,record]);
    setSelectedKey(key);setQuery('');setFilter('전체');setMessage('신규 카드를 보류 상태로 등록했습니다.');
  };
  const history=()=>{
    if(!memo.trim()||!current){setMessage('버전 이력의 변경 내용을 입력하세요.');return;}
    mutate({history:[...current.history,{
      at:new Date().toISOString(),version:current.version,note:memo.trim().slice(0,2000),
    }]});setMemo('');setMessage('버전 기록을 추가했습니다.');
  };
  const attach=async(slot:GenericSlot,file?:File)=>{
    if(!current||!file)return;
    if(file.size>(slot==='lua'?1:10)*1024*1024||!file.size||
      (slot==='lua'?!/\.lua$/i.test(file.name):!['image/png','image/jpeg','image/webp'].includes(file.type))){
      setMessage('이미지 10MB 이하 PNG/JPG/WebP · Lua 1MB 이하 .lua만 지원합니다.');return;
    }
    if(getAsset(slot)&&!window.confirm('이 카드의 기존 '+(slot==='lua'?'Lua':'이미지')+' 첨부파일을 교체할까요? 파일 센터의 원본은 유지됩니다.'))return;
    try{
      setBusy(true);
      await saveGenericAsset(current.key,slot,file);
      setAssets(await loadGenericAssets());
      setMessage('도감 첨부파일을 저장했습니다. 원본 카드/파일 센터와 실전 검증 상태는 변경되지 않았습니다.');
    }catch(e){setMessage('파일 저장 실패: '+String(e));}finally{setBusy(false);}
  };
  const saveCsv=()=>download('범용카드_마스터목록.csv',new Blob([genericCsv(records)],{type:'text/csv;charset=utf-8'}));
  const saveJson=()=>download('범용카드_도감_백업.json',new Blob([genericBackup(records)],{type:'application/json'}));
  const saveZip=async()=>{
    if(busy)return;setBusy(true);
    try{
      if(assets.reduce((n,a)=>n+a.blob.size,0)>150*1024*1024)throw Error('첨부파일이 150MB를 넘습니다. 일부를 따로 백업하세요.');
      const zip=new JSZip(),root='범용카드_도감/';
      zip.file(root+'범용카드_마스터목록.csv',genericCsv(records));
      zip.file(root+'범용카드_도감_백업.json',genericBackup(records));
      const effects=['# 범용 카드 효과 원문','', '미확인 원문을 임의로 채우지 않았습니다.',''];
      const adopted=['# 범용 카드 채택 기록',''];
      const manifest:{key:string;slot:GenericSlot;path:string;filename:string;mime:string}[]=[];
      for(const r of records){
        const folder=root+genericFolder(r);
        effects.push('## '+r.name+' ('+(r.id||'ID 미정')+')','',r.effect||'효과 원문 미확인','');
        adopted.push('## '+r.name,'','채택: '+r.adoption,'CDB: '+r.cdb,'Lua: '+r.lua,'실전: '+r.duel,'');
        zip.file(folder+'효과원문.md','# '+r.name+'\n\n'+(r.effect||'효과 원문 미확인')+'\n');
        zip.file(folder+'검증기록.md',[
          '# '+r.name+' 검증 기록','',
          '카드 ID: '+(r.id||'미정'),'채택: '+r.adoption,'CDB: '+r.cdb,'Lua: '+r.lua,
          '실전: '+r.duel,'버전: '+r.version,'오류: '+(r.issues||'기록 없음'),'',
          ...r.history.map(h=>h.at+' / '+h.version+' / '+h.note),
        ].join('\n'));
        for(const slot of ['original','overframe','final','lua'] as GenericSlot[]){
          const asset=assets.find(a=>a.key===r.key&&a.slot===slot);
          if(!asset)continue;
          const path=folder+assetFileName(slot,asset.blob.type,r.id);
          zip.file(path,asset.blob);
          manifest.push({key:r.key,slot,path,filename:asset.filename,mime:asset.blob.type});
        }
      }
      zip.file(root+'범용카드_효과원문.md',effects.join('\n'));
      zip.file(root+'범용카드_채택기록.md',adopted.join('\n'));
      zip.file(root+'배포본/README.md','이 ZIP의 CDB·Lua 제작 기록은 대전 검증을 의미하지 않습니다. 도감에 직접 첨부한 원본만 포함됩니다.');
      zip.file(root+'첨부목록.json',JSON.stringify({schemaVersion:1,assets:manifest},null,2));
      const blob=await zip.generateAsync({type:'blob',compression:'DEFLATE',compressionOptions:{level:3}});
      download('범용카드_도감_전체백업.zip',blob);
      setMessage('한글 폴더의 도감 ZIP을 다운로드했습니다. 파일 센터 원본은 별도 보존됩니다.');
    }catch(e){setMessage('ZIP 내보내기 실패: '+String(e));}finally{setBusy(false);}
  };
  const importFile=async(file?:File)=>{
    if(!file)return;
    if(file.size>160*1024*1024){setMessage('160MB 이하의 도감 JSON/ZIP만 복원할 수 있습니다.');return;}
    setBusy(true);
    try{
      let incoming:GenericRecord[];
      let restore:GenericAsset[]=[];
      if(file.name.toLowerCase().endsWith('.zip')){
        const zip=await JSZip.loadAsync(file);
        const root='범용카드_도감/';
        const json=zip.file(root+'범용카드_도감_백업.json');
        if(!json)throw Error('도감 백업 JSON이 없습니다.');
        incoming=parseGenericBackup(JSON.parse(await json.async('string')));
        const manifestFile=zip.file(root+'첨부목록.json');
        if(!manifestFile)throw Error('첨부목록.json이 없습니다.');
        const manifest:unknown=JSON.parse(await manifestFile.async('string'));
        if(!manifest||typeof manifest!=='object'||Array.isArray(manifest)||
          (manifest as {schemaVersion?:unknown}).schemaVersion!==1||
          !Array.isArray((manifest as {assets?:unknown}).assets))throw Error('도감 첨부 목록이 잘못되었습니다.');
        const entries=(manifest as {assets:Array<{key:string;slot:GenericSlot;path:string;filename:string;mime:string}>}).assets;
        if(entries.length>8000)throw Error('도감 첨부파일이 너무 많습니다.');
        const keys=new Set(incoming.map(r=>r.key));
        let total=0;
        for(const e of entries){
          if(!e||!keys.has(e.key)||!(['original','overframe','final','lua'] as string[]).includes(e.slot)||
            typeof e.path!=='string'||!e.path.startsWith(root)||e.path.includes('..')||
            typeof e.filename!=='string'||e.filename.length>160)throw Error('안전하지 않은 첨부파일 경로');
          const item=zip.file(e.path);
          if(!item||item.dir)throw Error('첨부 원본 누락: '+e.path);
          const bytes=await item.async('uint8array');
          total+=bytes.byteLength;
          if(total>150*1024*1024)throw Error('도감 첨부의 압축 해제 용량이 너무 큽니다.');
          restore.push(makeGenericAsset(e.key,e.slot,new Blob([new Uint8Array(bytes)],{type:e.mime}),e.filename));
        }
      }else{
        incoming=parseGenericBackup(JSON.parse(await file.text()));
      }
      if(!window.confirm('현재 범용 카드 도감 '+records.length+'종을 '+incoming.length+'종으로 교체하고, 첨부파일 '+restore.length+'개를 복원할까요? 기존 도감은 먼저 백업하는 것을 권장합니다.'))return;
      if(restore.length)await restoreGenericAssets(restore);
      onChange(incoming);setSelectedKey(incoming[0]?.key||'');setAssets(await loadGenericAssets());
      setMessage('도감 '+incoming.length+'종과 첨부 '+restore.length+'개를 복원했습니다. 기존 CDB·Lua 파일 센터는 변경하지 않았습니다.');
    }catch(e){setMessage('도감 복원 실패: '+String(e));}finally{setBusy(false);}
  };
  const ownThumbnail=(r:GenericRecord)=>urls[r.key+'::original']||urls['shared-'+r.id];
  const linkedEffect=linked?.card?.effect||linked?.cdb[0]?.effectText||'';
  return <section className="generic-encyclopedia" aria-label="범용 카드 도감">
    <div className="ge-heading">
      <div><span className="micro-label">GENERIC CARD ENCYCLOPEDIA / V1.0</span>
        <h1><BookOpen size={26}/> 범용 카드 도감</h1>
        <p>범용 카드를 ID·효과·역할로 검색하고, 채택·구현·검증 상태를 따로 관리합니다.</p>
      </div>
      <button type="button" className="primary-button" onClick={add}><Plus size={16}/> 범용 카드 추가</button>
    </div>
    <div className="ge-stats"><span>전체 <strong>{records.length}</strong></span>
      <span>채택 <strong>{summary.adopted}</strong></span>
      <span>보류 <strong>{summary.pending}</strong></span>
      <span>폐기 <strong>{summary.rejected}</strong></span>
      <span>실전 통과 <strong>{summary.verified}</strong></span></div>
    <div className="ge-toolbar">
      <label className="ge-search"><Search size={16}/><input aria-label="범용 카드 검색"
        placeholder="카드명 · ID · 역할 · 효과 · 속성" value={query} onChange={e=>setQuery(e.target.value)}/></label>
      <select aria-label="범용 채택 상태 필터" value={filter}
        onChange={e=>setFilter(e.target.value as GenericAdoption|'전체')}>
        <option value="전체">전체 상태</option>{ADOPTIONS.map(s=><option key={s}>{s}</option>)}
      </select>
      <button type="button" onClick={saveCsv}><Download size={15}/> CSV</button>
      <button type="button" onClick={saveJson}><FileJson size={15}/> JSON</button>
      <button type="button" disabled={busy} onClick={()=>void saveZip()}><Download size={15}/> 전체 ZIP</button>
      <label className="ge-import"><Upload size={15}/> JSON/ZIP 복원<input type="file"
        aria-label="범용 도감 백업 복원" accept=".json,.zip" disabled={busy}
        onChange={e=>{void importFile(e.target.files?.[0]);e.target.value='';}}/></label>
      <button type="button" disabled={loading} onClick={()=>void refresh()}><RefreshCcw size={15}/> 연결 새로고침</button>
    </div>
    <div className="ge-body">
      <div className="ge-list" aria-label="범용 카드 목록">
        <div className="ge-list-header">검색 결과 {shown.length}건</div>
        {shown.map(r=><button type="button" key={r.key} className={'ge-item'+(current?.key===r.key?' ge-item--active':'')}
          onClick={()=>{setSelectedKey(r.key);setMessage('');}}>
          <span className="ge-thumb">{ownThumbnail(r)?<img src={ownThumbnail(r)} alt=""/>:<ImagePlus size={19}/>}</span>
          <span className="ge-item-main"><strong>{r.name}</strong>
            <small>{r.id||'ID 미정'} · {r.role||'역할 미확인'}</small>
            <small>CDB {r.cdb} · 실전 {r.duel}</small></span>
          <em>{r.adoption}</em>
        </button>)}
        {!shown.length&&<p className="ge-empty">일치하는 카드가 없습니다.</p>}
      </div>
      {current?<div className="ge-detail">
        <div className="ge-detail-head"><div><h2>{current.name}</h2><small>{current.id||'ID 미정'} · {current.version}</small></div>
          <span>{linked?'기존 카드 자료 연결됨':'연결 자료 미확인'}</span></div>
        <div className="ge-fields">
          <label>카드명<input aria-label="도감 카드명" value={nameDraft} onChange={e=>setNameDraft(e.target.value.slice(0,120))}
            onBlur={changeName} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();}}/></label>
          <label>카드 ID<input aria-label="도감 카드 ID" inputMode="numeric" placeholder="미정"
            value={current.id} onChange={e=>changeId(e.target.value)}/></label>
          <label>역할<input aria-label="도감 역할" value={current.role} onChange={e=>mutate({role:e.target.value.slice(0,200)})}/></label>
          <label>속성<input aria-label="도감 속성" value={current.attribute} placeholder="미확인"
            onChange={e=>mutate({attribute:e.target.value.slice(0,40)})}/></label>
          <label>채택 상태<select aria-label="도감 채택 상태" value={current.adoption}
            onChange={e=>mutate({adoption:e.target.value as GenericAdoption})}>{ADOPTIONS.map(s=><option key={s}>{s}</option>)}</select></label>
          <label>효과 버전<input aria-label="도감 효과 버전" value={current.version}
            onChange={e=>mutate({version:e.target.value.slice(0,80)})}/></label>
          <label>CDB 구현<select aria-label="도감 CDB 상태" value={current.cdb}
            onChange={e=>mutate({cdb:e.target.value as GenericBuild})}>{BUILDS.map(s=><option key={s}>{s}</option>)}</select></label>
          <label>Lua 구현<select aria-label="도감 Lua 상태" value={current.lua}
            onChange={e=>mutate({lua:e.target.value as GenericBuild})}>{BUILDS.map(s=><option key={s}>{s}</option>)}</select></label>
          <label>EDOPro 실전 검증<select aria-label="도감 실전 상태" value={current.duel}
            onChange={e=>mutate({duel:e.target.value as GenericDuel})}>{DUELS.map(s=><option key={s}>{s}</option>)}</select></label>
        </div>
        <label className="ge-textarea">도감 최신 효과 원문
          <textarea aria-label="도감 효과 원문" rows={6} value={current.effect}
            placeholder="확정된 효과만 입력하세요. 파일 센터의 효과는 아래 참조 영역에서 확인합니다."
            onChange={e=>mutate({effect:e.target.value.slice(0,30000)})}/>
        </label>
        <details className="ge-linked" open>
          <summary>기존 YGO STUDIO 자료 연결 · {loading?'불러오는 중':linked?'조회 완료':'자료 없음'}</summary>
          <div className="ge-links"><span>CDB 원문 {linked?.cdb.length||0}건</span>
            <span>Lua 파일 {linked?.lua.length||0}건</span>
            <span>기존 이미지 {Number(!!linked?.image)+(linked?.fileImages.length||0)}건</span>
            <span>YDK 사용 {linked?.deckUses.length||0}개 덱</span></div>
          {linkedEffect&&<div className="ge-linked-effect"><strong>파일 센터/공통 보관함 효과 (참조용 · 미승인)</strong>
            <pre>{linkedEffect}</pre>
            <button type="button" onClick={()=>{
              if(window.confirm('참조 효과를 도감 최신 효과 원문에 복사할까요? 자동 승인이나 Lua 적용은 하지 않습니다.'))mutate({effect:linkedEffect.slice(0,30000)});
            }}>도감 원문으로 복사</button></div>}
          <button type="button" onClick={onOpenFiles}>파일 센터에서 CDB·Lua·원화 확인</button>
        </details>
        <div className="ge-images">
          {SLOTS.map(({key,label})=>{
            const own=getAsset(key),ownSrc=own&&urls[own.id];
            const src=ownSrc||(key==='original'?(linked?.image?urls['shared-'+current.id]:linkedUrl):'');
            return <div className="ge-image" key={key}><strong>{label}</strong>
              <div className="ge-preview">{src?<img src={src} alt={current.name+' '+label}/>:<span><ImagePlus size={24}/> 이미지 없음</span>}</div>
              <label>{own?'이미지 교체':'이미지 등록'}<input type="file" aria-label={label+' 등록'} accept="image/png,image/jpeg,image/webp"
                disabled={busy} onChange={e=>{void attach(key,e.target.files?.[0]);e.target.value='';}}/></label>
              <small>{own?'도감 전용 원본':src?'기존 자료 연결':'미등록'}</small>
            </div>;
          })}
        </div>
        <div className="ge-lua"><FileCode2 size={18}/>
          <div><strong>Lua 원본 {current.id&&'c'+current.id+'.lua'}</strong>
            <small>{getAsset('lua')?'도감에 Lua 첨부됨 · 실행 검증과 별개':'파일센터 Lua 존재 여부: '+(linked?.lua.length||0)+'개 · 도감 미첨부'}</small></div>
          <label>Lua 첨부<input type="file" accept=".lua" aria-label="도감 Lua 첨부" disabled={busy}
            onChange={e=>{void attach('lua',e.target.files?.[0]);e.target.value='';}}/></label>
        </div>
        <label className="ge-textarea">오류·실전 검증 메모<textarea rows={3} aria-label="도감 검증 메모"
          value={current.issues} onChange={e=>mutate({issues:e.target.value.slice(0,10000)})}/></label>
        <div className="ge-history"><strong>버전 변경 이력</strong>
          <div><input aria-label="도감 이력 내용" placeholder="변경사항 기록" value={memo} onChange={e=>setMemo(e.target.value)}/>
            <button type="button" onClick={history}>추가</button></div>
          {current.history.slice(-8).reverse().map((h,i)=><p key={i}>{h.at.slice(0,10)} · {h.version} · {h.note}</p>)}
          {!current.history.length&&<small>기록 없음</small>}
        </div>
      </div>:<p>카드가 없습니다.</p>}
    </div>
    {message&&<p className="ge-message" role="status">{message}</p>}
    <p className="ge-note">채택은 CDB/Lua 제작 또는 EDOPro 실전 통과를 의미하지 않습니다. 도감·파일 센터·공통 보관함의 자료는 서로 덮어쓰지 않습니다. 전체 프로젝트 JSON에는 도감 목록이, 도감 ZIP에는 별도로 첨부한 이미지·Lua도 포함됩니다.</p>
  </section>;
}

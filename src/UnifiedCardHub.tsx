import {useEffect,useMemo,useState} from 'react';
import type {SharedCatalog} from './sharedCatalog';
import type {MediaItem} from './sharedMedia';
import type {AssetEntry,FileCatalog} from './fileCatalog';
import {loadCatalog,getOriginal} from './fileVault';
import {buildUnifiedIndex,filterUnifiedRows,unifiedReport,type UnifiedCardRow,type UnifiedFilter} from './unifiedCardIndex';

type Props={
  catalog:SharedCatalog;media:MediaItem[];onOpenFiles:()=>void;
  onOpenImportedCard:(themeId:string,passcode:string)=>void;
};
const filters:ReadonlyArray<{id:UnifiedFilter;name:string}>=[
  {id:'all',name:'전체'},{id:'missing',name:'누락'},{id:'conflict',name:'충돌'},
  {id:'deck',name:'덱 사용'},{id:'complete',name:'4종 자료 연결'}
];
function downloadReport(content:string){
  const url=URL.createObjectURL(new Blob([content],{type:'text/csv;charset=utf-8'}));
  const a=document.createElement('a');a.href=url;a.download='통합카드_ID별_연결진단_V3.0.csv';
  document.body.appendChild(a);a.click();a.remove();
  window.setTimeout(()=>URL.revokeObjectURL(url),1500);
}
async function downloadOriginal(asset:AssetEntry){
  const original=await getOriginal(asset.id);
  const url=URL.createObjectURL(original);
  const a=document.createElement('a');a.href=url;a.download=asset.filename.replace(/[\\/:*?"<>|]/g,'_').slice(0,120);
  document.body.appendChild(a);a.click();a.remove();
  window.setTimeout(()=>URL.revokeObjectURL(url),1500);
}
const hasConflict=(row:UnifiedCardRow)=>row.issues.some(i=>i.includes('충돌')||i==='카드 원문 불일치');
export default function UnifiedCardHub({catalog,media,onOpenFiles,onOpenImportedCard}:Props){
  const [fileCatalog,setFileCatalog]=useState<FileCatalog|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');
  const [query,setQuery]=useState('');
  const [filter,setFilter]=useState<UnifiedFilter>('all');
  const [selectedId,setSelectedId]=useState('');
  const [imageUrl,setImageUrl]=useState('');
  const [imageSource,setImageSource]=useState('');
  const refresh=async()=>{
    setLoading(true);setError('');
    try{setFileCatalog(await loadCatalog());}
    catch(err){setFileCatalog(null);setError(String(err));}
    finally{setLoading(false);}
  };
  useEffect(()=>{void refresh();},[]);
  const index=useMemo(()=>fileCatalog?buildUnifiedIndex(catalog,media,fileCatalog):null,[catalog,media,fileCatalog]);
  const results=useMemo(()=>index?filterUnifiedRows(index.rows,filter,query):[],[index,filter,query]);
  const selected=index?.rows.find(row=>row.id===selectedId)||results[0]||null;
  const fileImages=selected?.fileImages;
  const sharedImage=selected?.image;
  useEffect(()=>{
    let active=true;
    let url='';
    setImageUrl('');setImageSource('');
    if(sharedImage){
      url=URL.createObjectURL(sharedImage.blob);
      setImageUrl(url);setImageSource('공통 이미지 보관함');
    }else if(fileImages?.length){
      const asset=fileImages[0];
      void getOriginal(asset.id).then(blob=>{
        if(!active)return;
        const mime=/\.png$/i.test(asset.filename)?'image/png':/\.webp$/i.test(asset.filename)?'image/webp':'image/jpeg';
        url=URL.createObjectURL(new Blob([blob],{type:mime}));
        setImageUrl(url);setImageSource('파일 센터 원본 · 공통 보관함에 미복사');
      }).catch(e=>{if(active)setMessage('이미지 원본 확인 실패: '+String(e));});
    }
    return()=>{active=false;if(url)URL.revokeObjectURL(url);};
  },[selected?.id,sharedImage,fileImages]);
  const fileLookup=useMemo(()=>{
    const themes=fileCatalog?.themes||[];
    const assets=fileCatalog?.assets||[];
    return {themes:new Map(themes.map(t=>[t.id,t.name])),assets:new Map(assets.map(a=>[a.id,a]))};
  },[fileCatalog]);
  const preview=selected;
  return <section className="shared-panel" role="region" aria-label="V3.0 카드 ID 통합 관리">
    <div className="shared-section-title">
      <h2>05 · V3.0 카드 ID 통합 관리</h2>
      <span className="deck-link-caption">카드 · 이미지 · CDB · Lua · 덱 연결 현황</span>
    </div>
    <p className="shared-help">기존 공통 보관함·이미지 보관함·파일 센터에 이미 등록된 자료를 숫자 카드 ID로 모아봅니다. CDB 원문은 미승인 출처이며 Lua는 파일 존재 여부만 확인합니다. 이 화면은 어떠한 원본 파일도 변경하지 않습니다.</p>
    <div className="shared-actions">
      <button type="button" onClick={onOpenFiles}>파일 센터에서 CDB · Lua · 이미지 등록</button>
      <button type="button" onClick={()=>void refresh()} disabled={loading}>파일 센터 자료 다시 읽기</button>
      <button type="button" disabled={!index||!results.length}
        onClick={()=>downloadReport(unifiedReport(results))}>현재 검색 결과 CSV 내보내기</button>
    </div>
    {error&&<p className="shared-error" role="alert">파일 센터 조회에 실패해 통합 진단을 중단했습니다. 원본은 그대로입니다. {error}</p>}
    {message&&<p className="shared-message" role="status">{message}</p>}
    {loading&&<p className="shared-help">브라우저에 등록된 파일 센터 자료를 읽고 있습니다.</p>}
    {index&&<>
      <div className="shared-preview-grid" aria-label="ID 연결 현황 요약">
        <span>전체 ID <strong>{index.summary.total}</strong></span>
        <span>4종 자료 연결 <strong>{index.summary.complete}</strong></span>
        <span>자료 누락 <strong>{index.summary.incomplete}</strong></span>
        <span>충돌·불일치 <strong>{index.summary.conflicts}</strong></span>
        <span>YDK 사용 ID <strong>{index.summary.inDeck}</strong></span>
      </div>
      <div className="shared-actions" aria-label="통합 카드 필터">
        {filters.map(f=><button type="button" key={f.id} aria-pressed={filter===f.id}
          onClick={()=>setFilter(f.id)}>{f.name}</button>)}
        <input aria-label="통합 카드 ID·이름·테마 검색" placeholder="ID · 카드명 · 테마 검색" value={query}
          onChange={e=>setQuery(e.target.value)}
          style={{background:'#0c1725',border:'1px solid #526174',borderRadius:8,padding:'10px 12px',color:'#fff',minWidth:160,flex:'1 1 180px'}}/>
      </div>
      <p className="shared-help">검색 결과 {results.length}종 · 최대 150종을 화면에 표시하며, CSV에는 현재 필터의 전체 검색 결과가 들어갑니다. 4/4는 자료 연결 상태일 뿐 효과·Lua 동작 검증 완료를 뜻하지 않습니다.</p>
      <div className="shared-tablewrap">
        <table className="shared-table" aria-label="ID별 통합 연결 목록">
          <thead><tr><th>ID</th><th>카드명</th><th>연결 상태</th><th>덱</th><th>진단</th></tr></thead>
          <tbody>{results.slice(0,150).map(row=><tr key={row.id}>
            <td><button type="button" aria-label={row.id+' 통합 상세 보기'}
              aria-pressed={preview?.id===row.id} onClick={()=>setSelectedId(row.id)}>{row.id}</button></td>
            <td>{row.name}<small style={{display:'block',opacity:.7}}>{row.theme}</small></td>
            <td>{row.linkedCount}/4 · {row.card?'카드':''}{row.image||row.fileImages.length?' 이미지':''}{row.cdb.length?' CDB':''}{row.lua.length?' Lua':''}</td>
            <td>{row.deckUses.length}개 덱</td>
            <td>{hasConflict(row)?'충돌 검토':row.linkedCount===4?'자료 연결':'누락 '+(4-row.linkedCount)+'종'}</td>
          </tr>)}
          {!results.length&&<tr><td colSpan={5}>조건에 맞는 카드 ID가 없습니다. 공통 보관함 또는 파일 센터에서 자료를 먼저 등록해 주세요.</td></tr>}</tbody>
        </table>
      </div>
      {preview&&<div className="shared-preview" role="region" aria-label="선택 카드 통합 상세">
        <div className="shared-section-title"><h3>{preview.name} · {preview.id}</h3><span>{preview.linkedCount}/4 자료 연결</span></div>
        <div className="shared-actions">
          {imageUrl&&<img src={imageUrl} alt={preview.name+' 통합 이미지'} style={{maxWidth:165,maxHeight:165,objectFit:'contain',borderRadius:7}}/>}
          <div style={{flex:'1 1 240px',minWidth:0}}>
            <p className="shared-help">테마: {preview.theme} · 이미지 출처: {imageSource||'없음'}</p>
            <p className="shared-help">카드 원장: {preview.card?'등록':'미등록'} · 이미지: {preview.image?'공통 보관함':preview.fileImages.length?'파일 센터만':'없음'} · CDB {preview.cdb.length}건 · Lua {preview.lua.length}개</p>
            <p className="shared-help">진단: {preview.issues.length?preview.issues.join(' · '):'4종 자료 연결됨 (검증 상태와 무관)'}</p>
          </div>
        </div>
        {preview.card&&<details open><summary>공통 카드 원문 · 출처: {preview.card.source||'미확인'}</summary>
          <p className="shared-help">{preview.card.name} / {preview.card.theme||'미확인'}</p>
          <pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere',fontSize:12}}>{preview.card.effect||'보관된 효과 원문 없음'}</pre>
        </details>}
        <details open={preview.cdbVariants>1}>
          <summary>CDB에서 가져온 미승인 원문 ({preview.cdb.length}건){preview.cdbVariants>1?' · 서로 다른 버전 존재':''}</summary>
          {preview.cdb.length?preview.cdb.slice(0,20).map((c,i)=>{
            const src=fileLookup.assets.get(c.sourceId);
            return <div key={c.sourceId+'-'+i} style={{borderTop:'1px solid #42566b',padding:'10px 0'}}>
              <p className="shared-help">{c.name||'카드명 없음'} · {fileLookup.themes.get(c.themeId)||'테마 미확인'} · {src?.filename||'출처 미확인'} · SHA {src?.sha256.slice(0,12)||'미확인'}</p>
              <pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere',fontSize:12}}>{c.effectText||'효과 텍스트 없음'}</pre>
              <button type="button" onClick={()=>onOpenImportedCard(c.themeId,preview.id)}>원문·검수 작업실 열기</button>
            </div>;
          }):<p className="shared-help">해당 ID의 CDB 자료가 파일 센터에 없습니다.</p>}
          {preview.cdb.length>20&&<p className="shared-help">원문은 상위 20건만 표시합니다. 파일 센터에서 나머지를 검토할 수 있습니다.</p>}
        </details>
        <details><summary>Lua 스크립트 ({preview.lua.length}개) · 파일 존재만 확인</summary>
          {preview.lua.length?preview.lua.map(asset=><div key={asset.id} style={{borderTop:'1px solid #42566b',padding:'9px 0'}}>
            <p className="shared-help">{asset.filename} · {fileLookup.themes.get(asset.themeId)||'테마 미확인'} · SHA {asset.sha256.slice(0,12)} · {asset.notes.join(' / ')||'정적 경고 기록 없음'}</p>
            <button type="button" onClick={()=>void downloadOriginal(asset).catch(e=>setMessage('Lua 다운로드 실패: '+String(e)))}>Lua 원본 다운로드</button>
          </div>):<p className="shared-help">해당 ID의 Lua 스크립트가 없습니다.</p>}
        </details>
        <details><summary>이미지 파일 출처 ({preview.fileImages.length}건) · 공통 이미지 {preview.image?'1건':'0건'}</summary>
          {preview.fileImages.map(asset=><p className="shared-help" key={asset.id}>{asset.filename} · SHA {asset.sha256.slice(0,12)} · {fileLookup.themes.get(asset.themeId)||'테마 미확인'}</p>)}
          {!preview.fileImages.length&&<p className="shared-help">파일 센터 이미지 원본은 없습니다.</p>}
        </details>
        <details open><summary>덱 포함 내역 ({preview.deckUses.length}개 덱)</summary>
          {preview.deckUses.length?preview.deckUses.slice(0,50).map((deck,i)=><p className="shared-help" key={i}>
            {deck.source} · {deck.name} · {deck.theme} · 메인 {deck.main} / 엑스트라 {deck.extra} / 사이드 {deck.side}
          </p>):<p className="shared-help">등록된 덱에서 사용된 기록이 없습니다.</p>}
          {preview.deckUses.length>50&&<p className="shared-help">상위 50개 덱만 표시했습니다.</p>}
        </details>
      </div>}
    </>}
  </section>;
}

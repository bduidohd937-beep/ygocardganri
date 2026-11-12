import {useEffect,useMemo,useState} from 'react';
import type {SharedCatalog,SharedDeck} from './sharedCatalog';
import {CATALOG_KEY,emptyCatalog,mergeCatalog} from './sharedCatalog';
import {scanDeckRecovery,addRecoveryImages} from './recoveryService';
import type {RecoveryRow,CardRecoveryState,ArtRecoveryState} from './recoveryModel';

const CARD_LABEL:Record<CardRecoveryState,string>={
  new:'신규 카드 후보',same:'기존과 동일',conflict:'기존 카드와 충돌',
  'source-conflict':'원본 자료실 간 충돌',unavailable:'원본 카드 없음'
};
const ART_LABEL:Record<ArtRecoveryState,string>={
  new:'신규 일러스트 후보',same:'기존 이미지와 동일',
  conflict:'기존 이미지와 충돌',unavailable:'원본 이미지 없음'
};
type Props={
  deck:SharedDeck;catalog:SharedCatalog;blocked:boolean;
  onSave:(catalog:SharedCatalog,expected:string)=>void;
  onImagesChanged:()=>Promise<void>;
};
export default function RecoveryPanel({deck,catalog,blocked,onSave,onImagesChanged}:Props){
  const [scan,setScan]=useState<{rows:RecoveryRow[];warnings:string[]}|null>(null);
  const [basis,setBasis]=useState('');
  const [cards,setCards]=useState<string[]>([]);
  const [images,setImages]=useState<string[]>([]);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [urls,setUrls]=useState<Record<string,string>>({});
  useEffect(()=>{setScan(null);setCards([]);setImages([]);},[deck,catalog]);
  useEffect(()=>{
    const next:Record<string,string>={};
    for(const row of scan?.rows.slice(0,40)||[]){
      if(row.image)next[row.id]=URL.createObjectURL(row.image.blob);
    }
    setUrls(next);
    return ()=>Object.values(next).forEach(url=>URL.revokeObjectURL(url));
  },[scan]);
  const wantedCards=useMemo(()=>new Set(cards),[cards]);
  const eligibleImages=useMemo(()=>new Set((scan?.rows||[]).filter(r=>
    r.artState==='new'&&(!!r.existingCard||wantedCards.has(r.id))).map(r=>r.id)),[scan,wantedCards]);
  const eligibleCardCount=scan?.rows.filter(x=>x.cardState==='new').length||0;
  const eligibleArtCount=scan?.rows.filter(x=>x.artState==='new').length||0;
  const scanSources=async()=>{
    if(busy)return;
    setBusy(true);setMessage('');setScan(null);setCards([]);setImages([]);
    try{
      const starting=JSON.stringify(catalog);
      const current=localStorage.getItem(CATALOG_KEY)||JSON.stringify(emptyCatalog());
      if(starting!==current)throw Error('다른 탭에서 공통 카드 정보가 변경됐습니다. 새로고침 후 검사하세요.');
      const result=await scanDeckRecovery(deck,catalog);
      setBasis(starting);setScan(result);
      setMessage('읽기 전용 검사가 완료됐습니다. 체크한 신규 자료만 아래 확정 버튼으로 복구할 수 있습니다.');
    }catch(err){setMessage('자료 검사 실패: '+String(err));}
    finally{setBusy(false);}
  };
  const confirm=async()=>{
    if(!scan||busy||blocked)return;
    const selectedCards=scan.rows.filter(row=>cards.includes(row.id)&&row.cardState==='new'&&row.candidateCard);
    const selectedImages=scan.rows.filter(row=>images.includes(row.id)&&eligibleImages.has(row.id)&&row.image);
    if(selectedCards.length!==cards.length||selectedImages.length!==images.length){
      setMessage('선택 조건이 변경됐습니다. 자료를 다시 검사하세요.');return;
    }
    if(!selectedCards.length&&!selectedImages.length){setMessage('복구할 카드 또는 이미지를 선택하세요.');return;}
    if(!window.confirm('선택 카드 '+selectedCards.length+'종·이미지 '+selectedImages.length+'장을 공통 보관함에 신규 추가할까요? 원본은 변경하지 않으며 기존 동일 ID는 덮어쓰지 않습니다.'))return;
    setBusy(true);setMessage('');
    let committedCards=0;
    try{
      const current=localStorage.getItem(CATALOG_KEY)||JSON.stringify(emptyCatalog());
      if(current!==basis||basis!==JSON.stringify(catalog))
        throw Error('검사 이후 공통 원장이 변경됐습니다. 기존 자료를 보호하기 위해 복구를 중단합니다.');
      if(selectedCards.length){
        const candidate={cards:selectedCards.map(r=>r.candidateCard!),decks:[],invalid:0};
        const merged=mergeCatalog(catalog,candidate);
        if(merged.addedCards!==selectedCards.length||merged.conflicts)
          throw Error('카드 ID 충돌이 새로 발견됐습니다. 다시 검사하세요.');
        onSave(merged.catalog,basis);
        committedCards=selectedCards.length;
      }
      if(selectedImages.length){
        // Add-only IndexedDB transaction fails on any same-ID race, without replacing existing images.
        await addRecoveryImages(selectedImages.map(r=>r.image!));
        await onImagesChanged();
      }
      setScan(null);setCards([]);setImages([]);
      setMessage('선택 복구 완료: 카드 '+committedCards+'종 · 이미지 '+selectedImages.length+'장. YDK·CDB·Lua·원본 프로젝트는 변경하지 않았습니다.');
    }catch(err){
      setScan(null);setCards([]);setImages([]);
      setMessage((committedCards?'카드 '+committedCards+'종은 저장됐지만 이미지 복구는 완료되지 않았습니다. ':'복구 중단: ')+String(err)+' 재검사 후 남은 자료만 다시 선택하세요.');
    }finally{setBusy(false);}
  };
  return <section className="shared-panel" role="region" aria-label="누락 카드·일러스트 선택 복구">
    <div className="shared-section-title"><h2>04 · V2.9 원본 자료실 선택 복구</h2>
      <span className="deck-link-caption">읽기 → 충돌 검토 → 개별 체크 → 승인</span></div>
    <p className="shared-help">선택한 덱의 카드 ID만 통합 카드 렌더러와 이미지 연구소의 동일 출처 브라우저 저장소에서 검색합니다. 외부 사이트·로컬 EDOPro 폴더에는 접근하지 않습니다. 이미지 원본은 카드 렌더러에 저장된 것만 검색합니다.</p>
    <div className="shared-actions">
      <button type="button" disabled={busy} onClick={()=>void scanSources()}>{busy?'검사·복구 처리 중...':'원본 자료실 복구 후보 검사'}</button>
      {scan&&<button type="button" disabled={busy} onClick={()=>{setScan(null);setCards([]);setImages([]);}}>검토 취소</button>}
    </div>
    {message&&<p className="shared-message" role="status">{message}</p>}
    {scan&&<>
      <div className="shared-preview-grid" aria-label="복구 후보 집계">
        <span>조회한 카드 ID <strong>{scan.rows.length}</strong></span>
        <span>신규 카드 후보 <strong>{eligibleCardCount}</strong></span>
        <span>신규 일러스트 후보 <strong>{eligibleArtCount}</strong></span>
        <span>카드 충돌 <strong>{scan.rows.filter(x=>x.cardState==='conflict'||x.cardState==='source-conflict').length}</strong></span>
        <span>이미지 충돌 <strong>{scan.rows.filter(x=>x.artState==='conflict').length}</strong></span>
      </div>
      {scan.warnings.map((w,i)=><p className="shared-help" key={i} role="note">{w}</p>)}
      <p className="shared-help">기존 데이터가 있는 ID는 자동 덮어쓰지 않습니다. 원문 출처가 서로 다르면 해당 카드 후보는 차단합니다. 이미지 충돌은 SHA-256 기준이며, 카드 데이터와 이미지를 각각 선택할 수 있습니다.</p>
      <div className="deck-link-entries">
        {scan.rows.map(row=><div className="deck-link-entry" key={row.id}>
          {urls[row.id]?<img src={urls[row.id]} alt={row.id+' 복구 후보 이미지'}/>:<span className="deck-link-noart">후보 없음</span>}
          <div className="deck-link-entry-meta">
            <strong>{row.candidateCard?.name||row.existingCard?.name||'미등록 카드'} · ID {row.id}</strong>
            <small>카드: {CARD_LABEL[row.cardState]} {row.candidateSources.length?'· '+row.candidateSources.join(', '):''}</small>
            <small>이미지: {ART_LABEL[row.artState]} {row.image?'· SHA-256 '+row.image.sha256.slice(0,12)+'…':''}</small>
            <div className="shared-actions">
              <label><input type="checkbox" aria-label={row.id+' 카드 복구 선택'}
                checked={cards.includes(row.id)} disabled={busy||blocked||row.cardState!=='new'}
                onChange={e=>{setCards(v=>e.target.checked?[...v,row.id]:v.filter(id=>id!==row.id));
                  if(!e.target.checked&&!row.existingCard)setImages(v=>v.filter(id=>id!==row.id));}}/> 카드 정보</label>
              <label><input type="checkbox" aria-label={row.id+' 이미지 복구 선택'}
                checked={images.includes(row.id)} disabled={busy||blocked||!eligibleImages.has(row.id)}
                onChange={e=>setImages(v=>e.target.checked?[...v,row.id]:v.filter(id=>id!==row.id))}/> 일러스트</label>
            </div>
            {(row.cardState==='conflict'||row.cardState==='source-conflict')&&<details>
              <summary>카드명·테마·효과 원문 충돌 내용 비교</summary>
              {row.existingCard&&<div><strong>기존 저장 정보</strong><p>{row.existingCard.name} / {row.existingCard.theme}</p><p>{row.existingCard.effect||'(효과 없음)'}</p></div>}
              {row.conflictCards.map((c,i)=><div key={i}><strong>후보: {c.source}</strong><p>{c.name} / {c.theme}</p><p>{c.effect||'(효과 없음)'}</p></div>)}
            </details>}
            {row.artState==='conflict'&&<small>기존 이미지 유지 · 기존 해시 {row.oldImageHash?row.oldImageHash.slice(0,12)+'…':'확인 불가'} · 후보 이미지는 가져오지 않음</small>}
          </div>
        </div>)}
      </div>
      <div className="shared-actions">
        <button className="shared-positive" disabled={busy||blocked||!(cards.length||images.length)}
          onClick={()=>void confirm()}>선택 복구 승인 (카드 {cards.length} · 이미지 {images.length})</button>
      </div>
    </>}
  </section>;
}

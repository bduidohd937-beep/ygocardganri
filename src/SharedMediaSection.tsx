import {useEffect,useState} from 'react';
import type {SharedCard} from './sharedCatalog';
import {listMedia,syncMakerImages,type MediaItem} from './sharedMedia';
import './shared-media.css';

type Preview={id:string;name:string;url:string;blob:Blob;mime:string};
function downloadMedia(item:Preview){
  const a=document.createElement('a');a.href=item.url;
  a.download=item.id+'_'+item.name.replace(/[\\/:*?"<>|]/g,'_').slice(0,35)
    +(item.mime==='image/png'?'.png':item.mime==='image/jpeg'?'.jpg':'.webp');
  document.body.append(a);a.click();a.remove();
}
export default function SharedMediaSection({cards,blocked}:{cards:SharedCard[];blocked:boolean}){
  const [items,setItems]=useState<MediaItem[]>([]);
  const [previews,setPreviews]=useState<Preview[]>([]);
  const [message,setMessage]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const refresh=async()=>{setItems(await listMedia());};
  useEffect(()=>{let mounted=true;listMedia().then(v=>{if(mounted)setItems(v);}).catch(e=>{if(mounted)setError(String(e));});return()=>{mounted=false;};},[]);
  useEffect(()=>{
    const next=items.slice(0,24).map(item=>({
      id:item.id,name:item.name,mime:item.mime,blob:item.blob,url:URL.createObjectURL(item.blob)
    }));
    setPreviews(next);
    return()=>next.forEach(item=>URL.revokeObjectURL(item.url));
  },[items]);
  const sync=async()=>{
    if(busy||blocked)return;
    if(!window.confirm('공통 카드 ID와 일치하는 카드 렌더러의 일러스트만 공통 이미지 보관함에 복사할까요? 기존 이미지와 원본 카드 프로젝트는 변경하지 않습니다.'))return;
    setBusy(true);setError('');setMessage('');
    try{
      const result=await syncMakerImages(cards);
      await refresh();
      setMessage('신규 '+result.added+'장 연결 · 이미 등록됨 '+result.duplicate+'장 보존 · 공통 카드 ID 미등록 '+result.unmatched+'장 · 이미지 미등록/제외 '+result.invalid+'장. 카드 원본과 효과 승인은 변경하지 않았습니다.');
    }catch(e){setError('일러스트 연결 실패: '+String(e));}
    finally{setBusy(false);}
  };
  return <section className="shared-media" aria-label="카드 ID 연결 이미지 보관함">
    <div className="shared-media-heading">
      <div><span>V2.7 / SHARED CARD ART</span><h2>카드 ID 연결 이미지 보관함</h2>
        <p>통합 카드 렌더러에 등록한 일러스트를 공통 카드 ID 기준으로 연결해 미리보고 내려받습니다. 원본은 변경하지 않습니다.</p></div>
      <button type="button" disabled={busy||blocked||!cards.length} onClick={()=>void sync()}>
        {busy?'이미지 검사 중...':'렌더러 일러스트 신규 연결'}
      </button>
    </div>
    <div className="shared-media-status">연결된 이미지 <strong>{items.length}장</strong> · 미리보기 최대 24장 · 기존 카드 데이터/프레임에는 영향 없음</div>
    {!!message&&<p className="shared-media-message" role="status">{message}</p>}
    {!!error&&<p className="shared-media-error" role="alert">{error}</p>}
    {previews.length?<div className="shared-media-grid">{previews.map(v=><div className="shared-media-item" key={v.id}>
      <img src={v.url} alt={v.name+' 일러스트'}/>
      <div><strong>{v.name}</strong><small>{v.id}</small><button type="button" onClick={()=>downloadMedia(v)}>원본 이미지 다운로드</button></div>
    </div>)}</div>:<p className="shared-media-empty">현재 연결된 이미지가 없습니다. 먼저 공통 보관함에 카드 ID를 등록하고, 통합 카드 렌더러에서 일러스트를 설정해 주세요.</p>}
    <p className="shared-media-note">이 기능은 통합 웹의 카드 렌더러만 읽습니다. 로컬 127.0.0.1 에셋이나 아직 저장하지 않은 이미지 연구소 캔버스는 자동 가져오지 않습니다. 연결된 Blob도 V2.7 통합 ZIP 백업에 포함됩니다.</p>
  </section>;
}

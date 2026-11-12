import {useEffect,useMemo,useState} from 'react';
import type {SharedCard,SharedDeck} from './sharedCatalog';
import {toYdk,type SharedCatalog} from './sharedCatalog';
import RecoveryPanel from './RecoveryPanel';
import type {MediaItem} from './sharedMedia';
import {buildDeckLinkReport,type ZoneKey} from './deckLinking';
import './deck-link-panel.css';

const cleanName=(name:string)=>name.replace(/[\\/:*?"<>|]/g,'_').slice(0,60)||'덱';
function downloadText(name:string,text:string,mime='text/plain;charset=utf-8'){
  const url=URL.createObjectURL(new Blob([text],{type:mime}));
  const a=document.createElement('a');
  a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();
  window.setTimeout(()=>URL.revokeObjectURL(url),1500);
}
type Props={decks:SharedDeck[];cards:SharedCard[];media:MediaItem[];catalog:SharedCatalog;blocked:boolean;
  onSave:(catalog:SharedCatalog,expected:string)=>void;onImagesChanged:()=>Promise<void>};
export default function DeckLinkPanel({decks,cards,media,catalog,blocked,onSave,onImagesChanged}:Props){
  const [selected,setSelected]=useState(0);
  const [activeZone,setActiveZone]=useState<ZoneKey>('main');
  const [urls,setUrls]=useState<Record<string,string>>({});
  const deck=decks[selected]||decks[0]||null;
  const imageIds=useMemo(()=>new Set(media.map(x=>x.id)),[media]);
  const report=useMemo(()=>deck?buildDeckLinkReport(deck,cards,imageIds):null,[deck,cards,imageIds]);
  const zone=report?.zones.find(x=>x.key===activeZone)||report?.zones[0]||null;
  useEffect(()=>{
    if(selected>=decks.length)setSelected(0);
  },[decks.length,selected]);
  useEffect(()=>{
    const ids=new Set(zone?.entries.slice(0,40).filter(x=>x.hasImage).map(x=>x.id)||[]);
    const next:Record<string,string>={};
    for(const item of media){
      if(ids.has(item.id)&&item.blob instanceof Blob&&!next[item.id]){
        next[item.id]=URL.createObjectURL(item.blob);
      }
    }
    setUrls(next);
    return ()=>{for(const url of Object.values(next))URL.revokeObjectURL(url);};
  },[zone,media]);
  return <><section className="shared-panel deck-link-panel" role="region" aria-label="덱 카드·일러스트 연결 진단">
    <div className="shared-section-title">
      <h2>03 · 덱 ↔ 카드 ↔ 일러스트 연결 진단</h2>
      <span className="deck-link-caption">읽기 전용 · 원본 YDK/이미지 변경 없음</span>
    </div>
    <p className="shared-help">덱의 카드 ID를 공통 카드 원장·이미지 보관함과 대조합니다. 같은 카드는 YDK 매수로 집계하며, CDB/Lua 구현·효과 승인·실전 승률을 판정하지 않습니다.</p>
    {decks.length===0?<p className="shared-empty">등록한 덱이 없습니다. YDK 파일을 불러오면 메인·엑스트라·사이드의 카드와 일러스트 연결 상태가 표시됩니다.</p>:<>
      <div className="deck-link-chooser" aria-label="검토할 덱">
        {decks.map((d,i)=><button type="button" key={i} aria-pressed={deck===d}
          onClick={()=>{setSelected(i);setActiveZone('main');}}>{d.name}</button>)}
      </div>
      {deck&&report&&<div className="deck-link-body">
        <div className="deck-link-summary">
          <div><strong>{deck.name}</strong><small>메인 {deck.main.length} / 엑스트라 {deck.extra.length} / 사이드 {deck.side.length}</small></div>
          <span>카드명 연결 <strong>{report.named}/{report.total}장</strong></span>
          <span>이미지 연결 <strong>{report.illustrated}/{report.total}장</strong></span>
          <span>미등록 카드 ID <strong>{report.missingIds.length}종</strong></span>
        </div>
        <div className="shared-actions">
          <button type="button" onClick={()=>downloadText(cleanName(deck.name)+'_공통보관함.ydk',toYdk(deck))}>원본 구성 YDK 다운로드</button>
          <button type="button" disabled={!report.missingIds.length} onClick={()=>downloadText(cleanName(deck.name)+'_누락카드ID.txt',report.missingIds.join('\n')+'\n')}>미등록 카드 ID TXT 저장 ({report.missingIds.length})</button>
        </div>
        {report.missingIds.length>0&&<p className="deck-link-missing" role="note">공통 카드 원장에 없는 ID: {report.missingIds.join(', ')}. EDOPro 카드가 존재하지 않는다는 의미는 아닙니다.</p>}
        <div className="deck-link-zones" role="group" aria-label="덱 영역 선택">
          {report.zones.map(x=><button type="button" key={x.key} aria-pressed={x.key===activeZone}
            onClick={()=>setActiveZone(x.key)}>{x.label} {x.named}/{x.total} · 이미지 {x.illustrated}</button>)}
        </div>
        {zone&&<div className="deck-link-entries">
          {zone.entries.slice(0,40).map(entry=><div className="deck-link-entry" key={entry.id}>
            {urls[entry.id]?<img src={urls[entry.id]} alt={(entry.card?.name||entry.id)+' 덱 연결 이미지'}/>:<span className="deck-link-noart">이미지 없음</span>}
            <div className="deck-link-entry-meta">
              <strong>{entry.card?.name||'공통 카드명 미등록'}</strong>
              <small>ID {entry.id} · {entry.copies}장 · {entry.card?(entry.hasImage?'이미지 연결됨':'이미지 미연결'):'카드 원장 미등록'}</small>
              {entry.card?.theme&&<small>테마: {entry.card.theme}</small>}
              {entry.card?.effect&&<details><summary>보관된 효과 텍스트</summary><p>{entry.card.effect}</p></details>}
            </div>
          </div>)}
          {zone.entries.length===0&&<p className="shared-empty">이 덱 영역에 등록된 카드가 없습니다.</p>}
          {zone.entries.length>40&&<p className="shared-help">한 번에 최대 40종까지 표시합니다. 집계는 해당 영역 전체를 기준으로 계산했습니다.</p>}
        </div>}
      </div>}
    </>}
  </section>
    {deck&&<RecoveryPanel deck={deck} catalog={catalog} blocked={blocked} onSave={onSave} onImagesChanged={onImagesChanged}/>}
  </>;
}

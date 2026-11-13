import { useEffect, useRef, useState } from 'react';
import { HANDOFF_KEY, cardMakerPayload, validHandoff } from './sharedCatalog';
import type { Handoff, SharedCard } from './sharedCatalog';
import './integration-modules.css';

export type IntegrationKey = 'artlab' | 'cardmaker' | 'designlab' | 'arena';

const MODULES: Record<IntegrationKey, { name: string; path: string; description: string; version: string }> = {
  artlab: { name: '이미지 연구소', path: 'modules/artlab/', description: '임시 일러스트 제작 · 카드별 SVG 합성 · ZIP 이미지 저장', version: 'YGO ART LAB V1.4' },
  cardmaker: { name: '카드 렌더러', path: 'modules/cardmaker/', description: '유희왕 카드 프레임 편집 · 오버프레임 돌출 PNG · 이미지 크롭 · 카드 PNG/JPG/ZIP 출력', version: 'CARD MAKER / main 기준' },
  designlab: { name: '디자인·덱 실험실', path: 'modules/designlab/', description: 'CDB·Lua 교차 검수 · 덱 매수 편집 · YDK 실험', version: 'DESIGN LAB V0.8.3.1' },
  arena: { name: 'PSH 검증 관제실', path: 'modules/arena/', description: '세션·회귀 테스트·MSG16 교착·로그 증거·주간 우선순위', version: 'PSH 관제실 V1.2' },
};

function pendingHandoff(target:IntegrationKey):Handoff|null{
  if(target!=='artlab'&&target!=='cardmaker')return null;
  try{const raw=JSON.parse(localStorage.getItem(HANDOFF_KEY)||'null');return validHandoff(raw)&&raw.target===target?raw:null;}catch{return null;}
}
const csv=(s:string)=>'"'+s.replace(/"/g,'""').replace(/[\r\n]/g,' ')+'"';
async function currentMakerIds():Promise<Set<string>>{
  return new Promise((resolve,reject)=>{
    const open=indexedDB.open('duelmind-card-studio',1);
    // Existing data is never created or overwritten by this check.
    open.onupgradeneeded=()=>open.transaction?.abort();
    open.onerror=()=>reject(Error('카드 렌더러의 기존 저장소를 확인할 수 없습니다. 화면을 다시 불러온 뒤 시도하세요.'));
    open.onsuccess=()=>{
      const db=open.result;
      if(!db.objectStoreNames.contains('projects')){db.close();reject(Error('카드 렌더러 데이터 구조를 확인할 수 없습니다.'));return;}
      const req=db.transaction('projects','readonly').objectStore('projects').get('current');
      req.onsuccess=()=>{
        const project=req.result as {cards?:{id:unknown}[]}|undefined;
        db.close();
        if(!project||!Array.isArray(project.cards)){reject(Error('카드 렌더러의 저장된 카드 목록을 확인할 수 없습니다.'));return;}
        resolve(new Set(project.cards.map(c=>String(c.id))));
      };
      req.onerror=()=>{db.close();reject(Error('기존 카드 목록 읽기 실패'));};
    };
  });
}
/** P2 단계: 같은 출처에서 별도 브라우저 모듈로 카드 ID를 **사용자 명시 승인 후** 전달한다. */
export default function IntegrationModule({ moduleId }: { moduleId: IntegrationKey }) {
  const module = MODULES[moduleId];
  const base = import.meta.env.BASE_URL.endsWith('/') ? import.meta.env.BASE_URL : import.meta.env.BASE_URL+'/';
  const url = base+module.path;
  const frame=useRef<HTMLIFrameElement>(null);
  const [ready,setReady]=useState(false);
  const [handoff,setHandoff]=useState<Handoff|null>(()=>pendingHandoff(moduleId));
  const [notice,setNotice]=useState('');
  const [busy,setBusy]=useState(false);
  useEffect(()=>{
    setReady(false);setNotice('');setHandoff(pendingHandoff(moduleId));
  },[moduleId]);
  const apply=async()=>{
    if(!handoff||busy||!ready||!frame.current?.contentDocument)return;
    if(!window.confirm('선택한 카드 '+handoff.cards.length+'장을 '+module.name+'에 신규 항목으로 전달할까요? 기존 카드 ID는 건너뛰며 원본 파일은 변경하지 않습니다.'))return;
    setBusy(true);setNotice('');
    try{
      const doc=frame.current.contentDocument;
      if(moduleId==='artlab'){
        const textarea=doc.querySelector<HTMLTextAreaElement>('#bulk-text');
        const btn=doc.querySelector<HTMLButtonElement>('#import-text');
        if(!textarea||!btn||btn.disabled)throw Error('이미지 연구소 가져오기 UI가 준비되지 않았습니다.');
        let stored:{demo?:boolean;cards?:{id:string}[]}={};
        try{stored=JSON.parse(localStorage.getItem('ygo-art-lab-v1.1')||'{}');}catch{throw Error('기존 이미지 연구소 저장 정보를 파싱할 수 없습니다. 원본 백업 확인 필요.');}
        const existing=Array.isArray(stored.cards)&&!stored.demo?new Set(stored.cards.map(c=>String(c.id))):new Set<string>();
        const newCards=handoff.cards.filter(c=>!existing.has(c.id));
        if(!newCards.length)throw Error('선택 카드가 이미 모두 이미지 연구소에 있습니다. 기존 항목은 유지했습니다.');
        if(newCards.length+existing.size>400)throw Error('이미지 연구소의 카드 400장 제한을 초과합니다. 일부 카드만 선택하세요.');
        textarea.value=newCards.map(c=>c.id+','+csv(c.name)).join('\n');
        btn.click();
        setNotice('이미지 연구소에 '+newCards.length+'장 가져오기 동작을 요청했습니다. '+(handoff.cards.length-newCards.length)+'장 중복은 건너뛰었습니다. 카드 목록에서 실제 반영 여부를 확인하세요.');
      }else if(moduleId==='cardmaker'){
        const input=doc.querySelector<HTMLInputElement>('input[aria-label="카드 데이터 파일"]');
        if(!input)throw Error('카드 렌더러 데이터 가져오기 UI가 없습니다.');
        // CARD MAKER is React + IndexedDB with a 500ms debounced initial save.
        // Wait for its first actual saved project before comparing IDs, never assume an empty DB.
        let existing:Set<string>|null=null;
        for(let attempt=0;attempt<15;attempt++){
          try{existing=await currentMakerIds();break;}
          catch(err){
            if(attempt===14)throw err;
            await new Promise<void>(resolve=>window.setTimeout(resolve,200));
          }
        }
        if(!existing)throw Error('카드 렌더러의 기존 카드 상태를 확인하지 못했습니다.');
        const newCards:SharedCard[]=handoff.cards.filter(c=>!existing.has(c.id));
        if(!newCards.length)throw Error('카드 렌더러에 이미 같은 ID가 있습니다. 기존 데이터는 건드리지 않았습니다.');
        const payload=cardMakerPayload(newCards);
        const file=new File([JSON.stringify({version:1,name:'YGO STUDIO P2 메타 전달',cards:payload})],
          'YGO_STUDIO_공통카드_전달.json',{type:'application/json'});
        const transfer=new DataTransfer();transfer.items.add(file);
        input.files=transfer.files;
        input.dispatchEvent(new Event('change',{bubbles:true}));
        setNotice('카드 렌더러에 신규 '+newCards.length+'장 가져오기 요청을 보냈습니다. '+(handoff.cards.length-newCards.length)+'장 중복은 건너뛰었습니다. 속성·종족·레벨·공수·프레임은 임시값이며 반드시 검수하세요.');
      }else throw Error('이 도구는 카드 전달을 지원하지 않습니다.');
      localStorage.removeItem(HANDOFF_KEY);
      setHandoff(null);
    }catch(e){setNotice('전달을 완료하지 못했습니다: '+String(e));}
    finally{setBusy(false);}
  };
  return (
    <section className="integration-module" aria-label={module.name}>
      <div className="integration-module__top">
        <div>
          <span className="integration-module__eyebrow">INTEGRATED WORKSPACE · P2 / BROWSER MODULE</span>
          <h1>{module.name}</h1>
          <p>{module.description}</p>
        </div>
        <a href={url} target="_blank" rel="noopener noreferrer" className="integration-module__open">작업실 전체 화면 열기 ↗</a>
      </div>
      <div className="integration-module__notice" role="note">
        <strong>기존 기능 보존 · P2 공통 ID 전달 지원</strong>
        <span>공통 보관함에서 선택한 새 카드만 명시 승인 후 전달합니다. 각 도구는 독립 저장소를 유지하며 수정 사항이 다른 도구로 자동 동기화되지는 않습니다. 기존 사이트의 데이터도 자동 이전되지 않습니다.</span>
        <small>{module.version} · CDB/Lua 원본이나 실전 검증 상태를 수정하지 않습니다.</small>
      </div>
      {handoff&&<div className="integration-module__handoff">
        <div><strong>공통 보관함에서 선택 카드 {handoff.cards.length}장 대기</strong><span>동일 ID 카드 건너뛰기 · 기존 자료 덮어쓰기 금지 · 적용 전에 확인</span></div>
        <button disabled={!ready||busy} onClick={()=>void apply()}>{busy?'검토 중...':'선택 카드 신규만 가져오기'}</button>
      </div>}
      {notice&&<div className="integration-module__notice" role="status">{notice}</div>}
      <iframe ref={frame} onLoad={()=>setReady(true)} className="integration-module__frame" title={module.name} src={url} loading="lazy" referrerPolicy="no-referrer" />
      <p className="integration-module__foot">현재는 카드 ID·이름·일부 효과 정보의 단방향 전달입니다. 일러스트·렌더러 완성 이미지의 자동 역전송과 여러 도구의 완전한 데이터 공유는 다음 단계 대상입니다.</p>
    </section>
  );
}

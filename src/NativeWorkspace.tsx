import { useEffect,useRef,useState } from 'react';
import { HANDOFF_KEY,cardMakerPayload,validHandoff } from './sharedCatalog';
import type { Handoff,SharedCard } from './sharedCatalog';
import { CheckCircle2,FileInput,Info,Layers3 } from 'lucide-react';
import './native-workspace.css';

type Target='artlab'|'cardmaker';
type NativeModule={mountCardMaker?:(host:HTMLElement)=>{root:ShadowRoot;unmount:()=>void};mountArtLab?:(root:ShadowRoot)=>()=>void};
type Handle={root:ShadowRoot;unmount:()=>void};
const metadata={
  artlab:{title:'이미지 연구소',version:'YGO ART LAB V1.4',desc:'카드 ID · 임시 일러스트 · SVG 모티브 · 이미지 ZIP'},
  cardmaker:{title:'카드 렌더러',version:'DUELMIND CARD STUDIO',desc:'카드 프레임 · 토큰 · 고급 크롭 · PNG/JPG/ZIP'}
};
const baseUrl=()=>{
  const b=import.meta.env.BASE_URL;
  return b.endsWith('/')?b:b+'/';
};
function savedHandoff(target:Target):Handoff|null{
  try{const v:unknown=JSON.parse(localStorage.getItem(HANDOFF_KEY)||'null');return validHandoff(v)&&v.target===target?v:null;}
  catch{return null;}
}
function csv(value:string){return '"'+value.replace(/"/g,'""').replace(/[\r\n]/g,' ')+'"';}
async function currentMakerIds():Promise<Set<string>>{
  // Intentionally read-only: do not create projects or overwrite a saved card.
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open('duelmind-card-studio',1);
    req.onupgradeneeded=()=>req.transaction?.abort();
    req.onerror=()=>reject(Error('렌더러 저장 데이터 읽기 실패'));
    req.onsuccess=()=>{
      const db=req.result;
      if(!db.objectStoreNames.contains('projects')){db.close();reject(Error('렌더러 프로젝트 저장소 미준비'));return;}
      const request=db.transaction('projects','readonly').objectStore('projects').get('current');
      request.onsuccess=()=>{
        const data=request.result as {cards?:Array<{id:unknown}>}|undefined;
        db.close();
        if(!data||!Array.isArray(data.cards)){reject(Error('렌더러 초기 프로젝트 저장 대기'));return;}
        resolve(new Set(data.cards.map(c=>String(c.id))));
      };
      request.onerror=()=>{db.close();reject(Error('기존 카드 ID 읽기 실패'));};
    };
  });
}
async function confirmedMakerIds(){
  for(let attempt=0;attempt<15;attempt++){
    try{return await currentMakerIds();}
    catch(e){if(attempt===14)throw e;await new Promise<void>(r=>window.setTimeout(r,200));}
  }
  throw Error('렌더러 초기화 지연');
}
async function importToNative(root:ShadowRoot,target:Target,cards:SharedCard[]):Promise<string>{
  if(target==='artlab'){
    const textarea=root.getElementById('bulk-text') as HTMLTextAreaElement|null;
    const btn=root.getElementById('import-text') as HTMLButtonElement|null;
    if(!textarea||!btn||btn.disabled)throw Error('이미지 연구소 카드 가져오기 화면이 준비되지 않았습니다.');
    let stored:{demo?:boolean;cards?:Array<{id:string}>}={};
    try{stored=JSON.parse(localStorage.getItem('ygo-art-lab-v1.1')||'{}');}
    catch{throw Error('이미지 연구소 저장 기록을 읽을 수 없습니다. 원본 백업 확인 필요.');}
    const existing=Array.isArray(stored.cards)&&!stored.demo?new Set(stored.cards.map(c=>String(c.id))):new Set<string>();
    const newCards=cards.filter(c=>!existing.has(c.id));
    if(!newCards.length)throw Error('선택 카드는 모두 이미지 연구소에 있습니다. 기존 항목을 유지했습니다.');
    if(existing.size+newCards.length>400)throw Error('이미지 연구소 카드 400장 제한 초과');
    textarea.value=newCards.map(c=>c.id+','+csv(c.name)).join('\n');
    btn.click();
    return '이미지 연구소에 신규 '+newCards.length+'장 추가를 요청했습니다. 중복 '+(cards.length-newCards.length)+'장 유지 · 실제 목록 확인 필요';
  }
  const input=root.querySelector<HTMLInputElement>('input[aria-label="카드 데이터 파일"]');
  if(!input)throw Error('렌더러 JSON 가져오기 입력창이 없습니다.');
  const existing=await confirmedMakerIds();
  const fresh=cards.filter(c=>!existing.has(c.id));
  if(!fresh.length)throw Error('선택한 카드 ID가 렌더러에 이미 존재합니다. 덮어쓰지 않았습니다.');
  const file=new File([JSON.stringify({version:1,name:'YGO STUDIO V2.2 카드 전달',cards:cardMakerPayload(fresh)})],
    'YGO_STUDIO_공통카드_전달.json',{type:'application/json'});
  const transfer=new DataTransfer();transfer.items.add(file);
  input.files=transfer.files;
  input.dispatchEvent(new Event('change',{bubbles:true,composed:true}));
  return '렌더러에 신규 '+fresh.length+'장 가져오기를 요청했습니다. 중복 '+(cards.length-fresh.length)+'장 유지 · 임시 카드 스탯/프레임 검수 필수';
}
async function loadAssetEngine(base:string):Promise<void>{
  const win=window as Window & {YGOAssetEngine?:unknown;__YGO_ART_BASE?:string};
  win.__YGO_ART_BASE=base+'modules/artlab/';
  if(win.YGOAssetEngine)return;
  const url=base+'modules/artlab/asset-engine-native.js';
  await new Promise<void>((resolve,reject)=>{
    const existing=document.querySelector<HTMLScriptElement>('script[data-native-art-engine]');
    if(existing){
      if(win.YGOAssetEngine){resolve();return;}
      existing.addEventListener('load',()=>resolve(),{once:true});
      existing.addEventListener('error',()=>reject(Error('이미지 에셋 엔진 로딩 실패')),{once:true});return;
    }
    const script=document.createElement('script');script.src=url;script.defer=true;
    script.dataset.nativeArtEngine='1';
    script.onload=()=>resolve();script.onerror=()=>reject(Error('이미지 에셋 엔진 로딩 실패'));
    document.head.appendChild(script);
  });
}
async function mountArtLab(host:HTMLElement,isCancelled:()=>boolean):Promise<Handle|null>{
  const base=baseUrl(),url=base+'modules/artlab/';
  const [htmlResponse,cssResponse]=await Promise.all([fetch(url+'index.html'),fetch(url+'styles.css')]);
  if(!htmlResponse.ok||!cssResponse.ok)throw Error('이미지 연구소 원본 자료를 불러오지 못했습니다.');
  const [html,css]=await Promise.all([htmlResponse.text(),cssResponse.text()]);
  const doc=new DOMParser().parseFromString(html,'text/html');
  const app=doc.querySelector('.shell'),toast=doc.getElementById('toast');
  if(!app||!toast||!doc.getElementById('art-canvas'))throw Error('원본 이미지 생성기 구조가 예상과 다릅니다.');
  app.querySelector('.topbar')?.remove();
  app.querySelector('.footer')?.remove();
  if(isCancelled())return null;
  const shadow=host.shadowRoot??host.attachShadow({mode:'open'});
  shadow.replaceChildren();
  const style=document.createElement('style');
  style.textContent=':host{display:block;min-width:0;--bg:#090c13;--panel:#111722;--border:#253041;--muted:#8592a9;--txt:#eaf0fc;--blue:#8dabff;--accent:#b5c6ff;--font:"Noto Sans KR",system-ui,sans-serif;color:#eaf0fc;font:13px/1.6 var(--font);background:#090c13;isolation:isolate}\n'
    +css+'\n:host .shell{max-width:none;margin:0;padding:0 0 24px}:host .hero{padding-top:10px}:host .workspace{margin-top:13px}:host .ambient{display:none}';
  shadow.append(style,app,toast);
  await loadAssetEngine(base);
  if(isCancelled()){if(shadow.contains(app))shadow.replaceChildren();return null;}
  const mod:NativeModule=await import(/* @vite-ignore */ url+'native.js');
  if(typeof mod.mountArtLab!=='function')throw Error('이미지 연구소 네이티브 모듈을 찾지 못했습니다.');
  const cleanup=mod.mountArtLab(shadow);
  return {root:shadow,unmount:()=>{cleanup();if(shadow.contains(app))shadow.replaceChildren();}};
}
async function mountMaker(host:HTMLElement,isCancelled:()=>boolean):Promise<Handle|null>{
  const mod:NativeModule=await import(/* @vite-ignore */ baseUrl()+'modules/cardmaker/embed/cardmaker.js');
  if(typeof mod.mountCardMaker!=='function')throw Error('카드 렌더러의 React 모듈이 없습니다.');
  if(isCancelled())return null;
  return mod.mountCardMaker(host);
}
/** Native same-origin DOM workspaces. No iframe or nested application navigation. */
export default function NativeWorkspace({target}:{target:Target}){
  const host=useRef<HTMLDivElement|null>(null);
  const mounted=useRef<Handle|null>(null);
  const [ready,setReady]=useState(false);
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');
  const [handoff,setHandoff]=useState<Handoff|null>(()=>savedHandoff(target));
  const [busy,setBusy]=useState(false);
  useEffect(()=>{
    let cancelled=false;
    setReady(false);setError('');setMessage('');setHandoff(savedHandoff(target));
    const container=host.current;
    if(!container)return;
    (target==='artlab'?mountArtLab(container,()=>cancelled):mountMaker(container,()=>cancelled)).then(instance=>{
      if(!instance)return;
      if(cancelled){instance.unmount();return;}
      mounted.current=instance;setReady(true);
    }).catch(e=>{if(!cancelled)setError('작업실 로딩 실패: '+String(e));});
    return ()=>{cancelled=true;mounted.current?.unmount();mounted.current=null;};
  },[target]);
  const apply=async()=>{
    const data=handoff,instance=mounted.current;
    if(!ready||!data||!instance||busy)return;
    if(!window.confirm(metadata[target].title+'에 카드 '+data.cards.length+'장의 신규 항목을 추가할까요? 기존 같은 ID 카드는 보존합니다.'))return;
    setBusy(true);setMessage('');
    try{
      const result=await importToNative(instance.root,target,data.cards);
      localStorage.removeItem(HANDOFF_KEY);setHandoff(null);setMessage(result);
    }catch(e){setMessage('가져오기 실패: '+String(e));}
    finally{setBusy(false);}
  };
  const info=metadata[target];
  return <section className="native-workspace" aria-label={info.title}>
    <div className="native-workspace-header">
      <div><span>YGO STUDIO · NATIVE WORKSPACE V2.2</span><h1>{info.title}</h1><p>{info.desc}</p></div>
      <div className="native-workspace-ok"><CheckCircle2 size={15}/> 한 화면에서 직접 실행</div>
    </div>
    {handoff&&<div className="native-workspace-handoff">
      <div><FileInput size={18}/><span>공통 보관함 선택 카드 <strong>{handoff.cards.length}장</strong> · 기존 카드 보존</span></div>
      <button disabled={!ready||busy} onClick={()=>void apply()}>{busy?'확인 중...':'선택 카드 신규만 가져오기'}</button>
    </div>}
    {!!message&&<div className="native-workspace-info" role="status"><Info size={16}/>{message}</div>}
    {!!error&&<div className="native-workspace-error" role="alert">{error}</div>}
    {!ready&&!error&&<div className="native-workspace-loading"><Layers3 size={18}/> 원본 제작 엔진을 준비하는 중...</div>}
    <div ref={host} className="native-workspace-mount" data-native-tool={target}/>
    <p className="native-workspace-foot">파일·카드 제작은 이 사이트 안에서 실행합니다. 기존 저장 데이터는 그대로 유지되며, 카드 효과 승인·EDOPro 대전 결과를 자동 갱신하지 않습니다.
      {target==='artlab'&&<> · SVG 출처: Lorc / Delapouite (Game-icons, CC BY 3.0) · <a href={baseUrl()+'modules/artlab/assets/오픈에셋_출처와_라이선스.md'} target="_blank" rel="noopener noreferrer">저작자·라이선스 원문</a></>}
    </p>
  </section>;
}

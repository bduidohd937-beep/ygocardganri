import { useEffect,useRef,useState } from 'react';
import { HANDOFF_KEY,cardMakerPayload,validHandoff } from './sharedCatalog';
import type { Handoff,SharedCard } from './sharedCatalog';
import { CheckCircle2,FileInput,Info,Layers3 } from 'lucide-react';
import './native-workspace.css';
import { nativeToolStyle } from './studioTheme';

type Target='artlab'|'cardmaker';
type NativeModule={mountCardMaker?:(host:HTMLElement)=>{root:ShadowRoot;unmount:()=>void};mountArtLab?:(root:ShadowRoot)=>()=>void};
type Handle={root:ShadowRoot;unmount:()=>void};
const metadata={
  artlab:{title:'이미지 연구소',version:'YGO ART LAB V1.4',desc:'카드 ID · 임시 일러스트 · SVG 모티브 · 이미지 ZIP'},
  cardmaker:{title:'카드 렌더러',version:'DUELMIND · 오버프레임 V3.4',desc:'3:4 자유 배치 · OCG풍 효과창 · 종족/공수 · 프리셋 · PNG/ZIP'}
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
async function mountArtLab(host:HTMLElement,isCancelled:()=>boolean,fullscreen:boolean):Promise<Handle|null>{
  const base=baseUrl(),url=base+'modules/artlab/';
  const [htmlResponse,cssResponse]=await Promise.all([fetch(url+'index.html'),fetch(url+'styles.css')]);
  if(!htmlResponse.ok||!cssResponse.ok)throw Error('이미지 연구소 원본 자료를 불러오지 못했습니다.');
  const [html,css]=await Promise.all([htmlResponse.text(),cssResponse.text()]);
  const doc=new DOMParser().parseFromString(html,'text/html');
  const app=doc.querySelector('.shell'),toast=doc.getElementById('toast');
  if(!app||!toast||!doc.getElementById('art-canvas'))throw Error('원본 이미지 생성기 구조가 예상과 다릅니다.');
  if(!fullscreen){
    app.querySelector('.topbar')?.remove();
    app.querySelector('.footer')?.remove();
  }else{
    // Original ART LAB header/footer, including license attribution, remain visible.
    app.querySelectorAll<HTMLAnchorElement>('.footer a[href^="assets/"]').forEach(anchor=>{
      anchor.href=url+anchor.getAttribute('href');
    });
  }
  if(isCancelled())return null;
  const shadow=host.shadowRoot??host.attachShadow({mode:'open'});
  shadow.replaceChildren();
  const style=document.createElement('style');
  style.textContent=':host{display:block;min-width:0;--bg:#090c13;--panel:#111722;--border:#253041;--muted:#8592a9;--txt:#eaf0fc;--blue:#8dabff;--accent:#b5c6ff;--font:"Noto Sans KR",system-ui,sans-serif;color:#eaf0fc;font:13px/1.6 var(--font);background:#090c13;isolation:isolate}\n'
    +css+(fullscreen?'\n:host .shell{max-width:1510px;margin:0 auto;padding:0 34px 45px}:host .ambient{display:none}':'\n:host .shell{max-width:none;margin:0;padding:0 0 24px}:host .hero{padding-top:10px}:host .workspace{margin-top:13px}:host .ambient{display:none}')+'\n'+nativeToolStyle('artlab');
  shadow.append(style,app,toast);
  await loadAssetEngine(base);
  if(isCancelled()){if(shadow.contains(app))shadow.replaceChildren();return null;}
  const mod:NativeModule=await import(/* @vite-ignore */ url+'native.js');
  if(typeof mod.mountArtLab!=='function')throw Error('이미지 연구소 네이티브 모듈을 찾지 못했습니다.');
  const cleanup=mod.mountArtLab(shadow);
  return {root:shadow,unmount:()=>{cleanup();if(shadow.contains(app))shadow.replaceChildren();}};
}
async function mountMaker(host:HTMLElement,isCancelled:()=>boolean,fullscreen:boolean):Promise<Handle|null>{
  const mod:NativeModule=await import(/* @vite-ignore */ baseUrl()+'modules/cardmaker/embed/cardmaker.js');
  if(typeof mod.mountCardMaker!=='function')throw Error('카드 렌더러의 React 모듈이 없습니다.');
  if(isCancelled())return null;
  const instance=mod.mountCardMaker(host);
  if(fullscreen){
    // Restore the complete original DUELMIND header and three-column workspace.
    // This style is scoped to its ShadowRoot and does not affect YGO STUDIO.
    const style=document.createElement('style');
    style.textContent=`
      :host{height:100%;min-height:0}
      :host #native-cardmaker-root{min-height:0;height:100%}
      :host .topbar{height:76px;min-height:76px;flex-wrap:nowrap;padding:0 25px;gap:22px}
      :host .topbar .brand{display:flex}
      :host .topbar .workspace-label{display:flex}
      :host .topbar .top-actions{margin-left:auto}
      :host .workspace{height:calc(100dvh - 122px);min-height:500px}
      @media(max-width:920px){:host .topbar{height:auto;min-height:76px;flex-wrap:wrap;padding:10px 16px}:host .topbar .workspace-label{display:none}}
    `;
    instance.root.appendChild(style);
  }
  const theme=document.createElement('style');
  theme.id='ygo-studio-native-theme';
  theme.textContent=nativeToolStyle('cardmaker');
  instance.root.appendChild(theme);
  return instance;
}
/** Native same-origin DOM workspaces. No iframe or nested application navigation. */
export default function NativeWorkspace({target,fullscreen=false}:{target:Target;fullscreen?:boolean}){
  const host=useRef<HTMLDivElement|null>(null);
  const mounted=useRef<Handle|null>(null);
  const [ready,setReady]=useState(false);
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');
  const [handoff,setHandoff]=useState<Handoff|null>(()=>savedHandoff(target));
  const [busy,setBusy]=useState(false);
  const [transferOpen,setTransferOpen]=useState(false);
  const [transferBusy,setTransferBusy]=useState(false);
  const [transferInfo,setTransferInfo]=useState('');
  const transferJsonInput=useRef<HTMLInputElement|null>(null);
  const transferAssetsInput=useRef<HTMLInputElement|null>(null);
  useEffect(()=>{
    let cancelled=false;
    setReady(false);setError('');setMessage('');setHandoff(savedHandoff(target));
    const container=host.current;
    if(!container)return;
    (target==='artlab'?mountArtLab(container,()=>cancelled,fullscreen):mountMaker(container,()=>cancelled,fullscreen)).then(instance=>{
      if(!instance)return;
      if(cancelled){instance.unmount();return;}
      mounted.current=instance;setReady(true);
    }).catch(e=>{if(!cancelled)setError('작업실 로딩 실패: '+String(e));});
    return ()=>{cancelled=true;mounted.current?.unmount();mounted.current=null;};
  },[target,fullscreen]);
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
  const transferLegacyFile=async(kind:'cards'|'assets',file:File|null)=>{
    if(!file)return;
    const original=mounted.current;
    if(!original||!ready||transferBusy){setTransferInfo('렌더러가 준비되지 않았습니다.');return;}
    setTransferBusy(true);
    setTransferInfo('');
    try{
      if(kind==='cards'){
        if(!/\.json$/i.test(file.name)||file.size>60*1024*1024)throw Error('60MiB 이하의 프로젝트 JSON만 선택하세요.');
        const value:unknown=JSON.parse(await file.text());
        const cards=Array.isArray(value)?value: value!==null&&typeof value==='object'&&'cards' in value?(value as {cards?:unknown}).cards:null;
        if(!Array.isArray(cards)||cards.length<1||cards.length>2000)throw Error('cards 배열에 1~2000장이 있는 프로젝트 JSON이 필요합니다.');
        if(!window.confirm('로컬 카드 '+cards.length+'장을 가져올까요? 같은 ID는 기존 렌더러의 병합 규칙을 따르며 기존 일러스트는 보존합니다. 기존 카드 프로젝트의 JSON 백업을 먼저 권장합니다.'))return;
      }else{
        if(!/\.zip$/i.test(file.name)||file.size>90*1024*1024)throw Error('90MiB 이하의 카드 프레임 리소스 ZIP만 선택하세요.');
        if(!window.confirm('선택한 ZIP을 현재 프레임·폰트 리소스에 적용할까요? 기존 커스텀 리소스팩은 교체됩니다. 카드 정보와 일러스트는 유지됩니다.'))return;
      }
      const selector=kind==='cards'?'input[aria-label="카드 데이터 파일"]':'input[aria-label="카드 프레임 리소스 ZIP"]';
      const source=original.root.querySelector<HTMLInputElement>(selector);
      if(!source)throw Error('원본 카드 메이커의 가져오기 입력창을 찾을 수 없습니다.');
      const data=new DataTransfer();data.items.add(file);source.files=data.files;
      source.dispatchEvent(new Event('change',{bubbles:true,composed:true}));
      setTransferInfo(kind==='cards'?'카드 JSON을 원본 렌더러의 가져오기 기능에 전달했습니다. 카드 목록·일러스트를 확인하세요.':'리소스 ZIP을 원본 렌더러에 전달했습니다. 왼쪽 하단의 에셋팩 이름·적용 건수와 실제 카드 프레임을 확인하세요.');
    }catch(e){setTransferInfo('파일 검수/전달 실패: '+String(e));}
    finally{setTransferBusy(false);}
  };
  const info=metadata[target];
  return <section className={`native-workspace ${fullscreen?'native-workspace--fullscreen':''}`} aria-label={info.title}>
    {!fullscreen&&<div className="native-workspace-header">
      <div><span>YGO STUDIO · NATIVE WORKSPACE V2.2</span><h1>{info.title}</h1><p>{info.desc}</p></div>
      <div className="native-workspace-ok"><CheckCircle2 size={15}/> 한 화면에서 직접 실행</div>
    </div>}
    {fullscreen&&target==='cardmaker'&&<>
      <button className="native-transfer-trigger" type="button" onClick={()=>setTransferOpen(true)} aria-label="로컬 카드와 프레임 에셋 옮기기">로컬 자료 옮기기</button>
      {transferOpen&&<div className="native-transfer-scrim" onMouseDown={e=>{if(e.target===e.currentTarget)setTransferOpen(false);}}>
        <section className="native-transfer-dialog" role="dialog" aria-modal="true" aria-label="로컬 DUELMIND 자료 이전" onKeyDown={e=>{if(e.key==='Escape')setTransferOpen(false);}}>
          <div className="native-transfer-head"><strong>로컬 카드·프레임 이전</strong><button type="button" onClick={()=>setTransferOpen(false)} aria-label="자료 이전 닫기">닫기</button></div>
          <p>로컬 <code>127.0.0.1:5173</code>과 YGO STUDIO는 서로 다른 브라우저 저장소를 사용합니다. 카드 JSON과 사용했던 커스텀 프레임 ZIP을 <strong>각각</strong> 가져와야 원래 모습을 재현할 수 있어요.</p>
          <ol><li>로컬 카드 메이커에서 <strong>JSON 저장</strong>을 눌러 프로젝트를 다운로드합니다.</li><li>로컬에서 적용했던 <strong>원본 프레임 ZIP</strong>을 PC에서 찾습니다.</li><li>아래 버튼으로 두 파일을 차례로 선택합니다. 기존 웹 카드의 JSON 백업도 권장합니다.</li></ol>
          <div className="native-transfer-actions">
            <button type="button" disabled={!ready||transferBusy} onClick={()=>transferJsonInput.current?.click()}>1. 카드 프로젝트 JSON 선택</button>
            <button type="button" disabled={!ready||transferBusy} onClick={()=>transferAssetsInput.current?.click()}>2. 프레임·폰트 ZIP 선택</button>
          </div>
          <input ref={transferJsonInput} type="file" accept=".json,application/json" aria-label="로컬 카드 프로젝트 JSON" hidden onChange={e=>{const file=e.target.files?.[0]??null;e.target.value='';void transferLegacyFile('cards',file);}}/>
          <input ref={transferAssetsInput} type="file" accept=".zip,application/zip" aria-label="로컬 프레임 리소스 ZIP" hidden onChange={e=>{const file=e.target.files?.[0]??null;e.target.value='';void transferLegacyFile('assets',file);}}/>
          {!!transferInfo&&<p role="status" className="native-transfer-status">{transferInfo}</p>}
          <small>로컬 저장소를 원격으로 읽거나 원본 ZIP을 GitHub에 업로드하지 않습니다. 데이터 가져오기 결과는 렌더러에서 확인해야 합니다.</small>
        </section>
      </div>}
    </>}
    {handoff&&<div className="native-workspace-handoff">
      <div><FileInput size={18}/><span>공통 보관함 선택 카드 <strong>{handoff.cards.length}장</strong> · 기존 카드 보존</span></div>
      <button disabled={!ready||busy} onClick={()=>void apply()}>{busy?'확인 중...':'선택 카드 신규만 가져오기'}</button>
    </div>}
    {!!message&&<div className="native-workspace-info" role="status"><Info size={16}/>{message}</div>}
    {!!error&&<div className="native-workspace-error" role="alert">{error}</div>}
    {!ready&&!error&&<div className="native-workspace-loading"><Layers3 size={18}/> 원본 제작 엔진을 준비하는 중...</div>}
    <div ref={host} className="native-workspace-mount" data-native-tool={target}/>
    {!fullscreen&&<p className="native-workspace-foot">파일·카드 제작은 이 사이트 안에서 실행합니다. 기존 저장 데이터는 그대로 유지되며, 카드 효과 승인·EDOPro 대전 결과를 자동 갱신하지 않습니다.
      {target==='artlab'&&<> · SVG 출처: Lorc / Delapouite (Game-icons, CC BY 3.0) · <a href={baseUrl()+'modules/artlab/assets/오픈에셋_출처와_라이선스.md'} target="_blank" rel="noopener noreferrer">저작자·라이선스 원문</a></>}
    </p>}
  </section>;
}

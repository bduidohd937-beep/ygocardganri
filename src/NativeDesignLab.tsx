import {useEffect,useRef,useState} from 'react';
import JSZip from 'jszip';
import initSqlJs from 'sql.js';
import {legacyToolStyle} from './studioTheme';
import './native-designlab.css';

/** Original DESIGN LAB runs in a ShadowRoot, with a DOM facade instead of a child browsing context. */
type NativeContext={
  document:Record<string,unknown>;
  window:Record<string,unknown>;
};
type NativeGlobal=typeof globalThis & {
  __YGO_LAB_CONTEXT__?:NativeContext;
  JSZip?:typeof JSZip;
  initSqlJs?:typeof initSqlJs;
};
let mountSerial=0;
const BASE=()=>import.meta.env.BASE_URL.endsWith('/')?import.meta.env.BASE_URL:import.meta.env.BASE_URL+'/';
const STYLES=['styles.css','audit.css','layout.css','reader.css','storage.css',
  'audit-reader.css','audit-layout.css','smart-audit.css','effect-implementation.css',
  'import-notices.css','test-recorder.css','failure-triage.css',
  'deck-lab.css','deck-combos.css','deck-scenarios.css','deck-real-editor.css'];

async function loadNativeDesignLab(host:HTMLDivElement,wasCancelled:()=>boolean):Promise<()=>void>{
  const prefix=BASE()+'modules/designlab/';
  const [htmlResponse,...cssResponses]=await Promise.all([
    fetch(prefix+'index.html'),...STYLES.map(name=>fetch(prefix+'src/'+name))
  ]);
  if(!htmlResponse.ok||cssResponses.some(r=>!r.ok))throw Error('DESIGN LAB 원본 HTML 또는 스타일 파일을 가져오지 못했습니다.');
  const [html,styles]=await Promise.all([
    htmlResponse.text(),Promise.all(cssResponses.map(r=>r.text()))
  ]);
  if(wasCancelled())return ()=>{};
  const parsed=new DOMParser().parseFromString(html,'text/html');
  const shell=parsed.querySelector('.app-shell');
  if(!shell||!parsed.getElementById('assets-dialog')||!parsed.getElementById('view-deck')){
    throw Error('DESIGN LAB 원본 화면 구조가 바뀌었습니다. 원본 보존을 위해 네이티브 실행을 중단합니다.');
  }
  const shadow=host.shadowRoot??host.attachShadow({mode:'open'});
  shadow.replaceChildren();
  const style=document.createElement('style');
  style.textContent=[
    ':host{display:block;min-width:0;width:100%;height:100%;font:12px Inter,Pretendard,"Noto Sans KR",system-ui,sans-serif;color:#e9ecf5;background:#10151b;overflow:hidden}',
    ...styles,
    ':host .app-shell{height:100%;min-height:0}:host .sidebar{height:100%}:host .workspace{height:100%;min-height:0}',
    legacyToolStyle('designlab'),
    ':host .app-shell{background:#10151b}:host .workspace{max-width:none}',
    ':host .brand{cursor:pointer}'
  ].join('\n');
  shadow.append(style);
  // Clone all body elements, including native dialogs and fullscreen readers. No script tags are executed.
  for(const child of Array.from(parsed.body.children))shadow.appendChild(child.cloneNode(true));

  const global=globalThis as NativeGlobal;
  const listeners:Array<{type:string;callback:EventListenerOrEventListenerObject;options?:boolean|AddEventListenerOptions}>=[];
  const fakeLocation={hash:''};
  const fakeHistory={
    replaceState:(_state:unknown,_unused:string,url?:string|null)=>{
      if(typeof url==='string'&&url.startsWith('#'))fakeLocation.hash=url;
    }
  };
  const downloads={
    append:(...items:(Node|string)[])=>shadow.append(...items),
    appendChild:(node:Node)=>shadow.appendChild(node),
    classList:host.classList
  };
  let localTitle='YU-GI-OH DESIGN LAB';
  const scopedDocument:Record<string,unknown>={
    getElementById:(id:string)=>shadow.getElementById(id),
    querySelector:(s:string)=>shadow.querySelector(s),
    querySelectorAll:(s:string)=>shadow.querySelectorAll(s),
    createElement:(tag:string)=>document.createElement(tag),
    createTextNode:(value:string)=>document.createTextNode(value),
    createDocumentFragment:()=>document.createDocumentFragment(),
    addEventListener:(type:string,fn:EventListenerOrEventListenerObject,opts?:AddEventListenerOptions)=>shadow.addEventListener(type,fn,opts),
    removeEventListener:(type:string,fn:EventListenerOrEventListenerObject)=>shadow.removeEventListener(type,fn),
    get activeElement(){return shadow.activeElement;},
    get title(){return localTitle;},
    set title(value:string){localTitle=String(value);},
    body:downloads,
  };
  const scopedWindow:Record<string,unknown>={
    location:fakeLocation,history:fakeHistory,
    get innerWidth(){return window.innerWidth;},
    get innerHeight(){return window.innerHeight;},
    localStorage:window.localStorage,
    confirm:(message:string)=>window.confirm(message),
    dispatchEvent:(event:Event)=>window.dispatchEvent(event),
    addEventListener:(type:string,callback:EventListenerOrEventListenerObject,options?:boolean|AddEventListenerOptions)=>{
      window.addEventListener(type,callback,options);listeners.push({type,callback,options});
    },
    removeEventListener:(type:string,callback:EventListenerOrEventListenerObject)=>{
      window.removeEventListener(type,callback);
    }
  };
  const context={document:scopedDocument,window:scopedWindow};
  const previousJSZip=global.JSZip, previousSql=global.initSqlJs;
  const current=++mountSerial;
  global.JSZip=JSZip;
  // Load sql-wasm.wasm from our pinned local build, not from an unaudited CDN.
  global.initSqlJs=((options?:Parameters<typeof initSqlJs>[0])=>
    initSqlJs({...options,locateFile:()=>prefix+'sql-wasm.wasm'})) as typeof initSqlJs;
  global.__YGO_LAB_CONTEXT__=context;
  let unmounted=false;
  const cleanup=()=>{
    if(unmounted)return;unmounted=true;
    for(const {type,callback,options} of listeners)window.removeEventListener(type,callback,options);
    if(global.__YGO_LAB_CONTEXT__===context)delete global.__YGO_LAB_CONTEXT__;
    if(global.JSZip===JSZip){if(previousJSZip)global.JSZip=previousJSZip;else delete global.JSZip;}
    if(previousSql)global.initSqlJs=previousSql;else Reflect.deleteProperty(global,'initSqlJs');
    if(shadow.contains(style))shadow.replaceChildren();
  };
  try{
    // Unique URL on every mount re-runs the original modules after navigating back.
    await import(/* @vite-ignore */prefix+'native-designlab.js?v='+current);
    if(wasCancelled()){cleanup();return ()=>{};}
    const brand=shadow.querySelector<HTMLAnchorElement>('.brand[href="./"]');
    brand?.addEventListener('click',e=>{
      e.preventDefault();
      shadow.querySelector<HTMLButtonElement>('[data-workspace-target="library"]')?.click();
    });
    return cleanup;
  }catch(err){cleanup();throw err;}
}

export default function NativeDesignLab(){
  const ref=useRef<HTMLDivElement|null>(null);
  const [status,setStatus]=useState<'loading'|'ready'|'error'>('loading');
  const [error,setError]=useState('');
  useEffect(()=>{
    let cancelled=false;
    let release:(()=>void)|null=null;
    const host=ref.current;
    if(host){
      void loadNativeDesignLab(host,()=>cancelled).then(fn=>{
        if(cancelled)fn();else{release=fn;setStatus('ready');}
      }).catch(e=>{if(!cancelled){setStatus('error');setError(String(e));}});
    }
    return()=>{cancelled=true;release?.();};
  },[]);
  return <section className="native-designlab" data-native-tool="designlab" aria-label="디자인·덱 실험실">
    {status==='loading'&&<div className="native-designlab-loading" role="status">DESIGN LAB 원본 모듈과 파일 저장소를 연결하는 중...</div>}
    {status==='error'&&<div className="native-designlab-error" role="alert">{error} · 기존 원본 자료는 변경되지 않았습니다.</div>}
    <div ref={ref} className="native-designlab-root"/>
  </section>;
}

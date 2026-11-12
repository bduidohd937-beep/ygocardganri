import {useEffect,useRef,useState} from 'react';
import {legacyToolStyle} from './studioTheme';
import './native-arena.css';

type ArenaModule={mountArena?:(doc:unknown)=>void};
const rootPath=()=>import.meta.env.BASE_URL.endsWith('/')?import.meta.env.BASE_URL:import.meta.env.BASE_URL+'/';

async function mountArenaNative(host:HTMLDivElement,isCancelled:()=>boolean):Promise<()=>void>{
  const base=rootPath()+'modules/arena/';
  const responses=await Promise.all([fetch(base+'native-arena.html'),fetch(base+'native-arena.css')]);
  if(responses.some(r=>!r.ok))throw Error('PSH 원본 HTML/CSS 자료가 누락됐습니다.');
  const [html,css]=await Promise.all(responses.map(r=>r.text()));
  if(isCancelled())return ()=>{};

  const fragment=new DOMParser().parseFromString('<!doctype html><html><body>'+html+'</body></html>','text/html');
  if(!fragment.getElementById('nav')||!fragment.getElementById('modalRoot')||
     !fragment.getElementById('content')||!fragment.getElementById('arenaFolderPicker'))
    throw Error('PSH 검증 관제실 화면 구조가 예상과 달라 원본 보호를 위해 중단합니다.');

  const shadow=host.shadowRoot??host.attachShadow({mode:'open'});
  shadow.replaceChildren();
  const style=document.createElement('style');
  // CSS is isolated from YGO STUDIO: original tool styles are kept, theme only touches UI chrome.
  const scopedOriginal=css.replace(/:root\s*\{/g,':host{').replace(/\bbody\s*\{/g,':host{');
  const theme=legacyToolStyle('arena').replace(/:root\s*\{/g,':host{');
  style.textContent=[
    ':host{display:block;width:100%;height:100%;min-height:0;overflow:hidden;background:#10151b;color:#e8e9ed;font-family:system-ui,"Malgun Gothic",sans-serif}',
    scopedOriginal,
    ':host .shell{height:100%;min-height:0;overflow:auto}',
    ':host aside{height:100%;min-height:0;position:sticky;top:0}',
    ':host main{max-width:1570px}',
    ':host .dialogoverlay{z-index:5}',
    theme
  ].join('\n');
  shadow.append(style);
  for(const node of Array.from(fragment.body.childNodes))shadow.appendChild(node.cloneNode(true));

  const attached:Array<{type:string;fn:EventListenerOrEventListenerObject;opts?:boolean|AddEventListenerOptions}>=[];
  // The original browser file asks for document.getElementById / document.addEventListener.
  // Route those lookups and events ONLY to the mounted arena, never to the Studio shell.
  const scopedDocument={
    getElementById:(id:string)=>shadow.getElementById(id),
    querySelector:(selector:string)=>shadow.querySelector(selector),
    querySelectorAll:(selector:string)=>shadow.querySelectorAll(selector),
    createElement:(name:string)=>document.createElement(name),
    createTextNode:(value:string)=>document.createTextNode(value),
    addEventListener:(type:string,fn:EventListenerOrEventListenerObject,opts?:boolean|AddEventListenerOptions)=>{
      shadow.addEventListener(type,fn,opts);
      attached.push({type,fn,opts});
    },
    removeEventListener:(type:string,fn:EventListenerOrEventListenerObject)=>shadow.removeEventListener(type,fn),
    body:{appendChild:(node:Node)=>shadow.appendChild(node)}
  };
  let released=false;
  const cleanup=()=>{
    if(released)return;
    released=true;
    for(const {type,fn,opts} of attached)shadow.removeEventListener(type,fn,opts);
    if(shadow.contains(style))shadow.replaceChildren();
  };
  try{
    const module:ArenaModule=await import(/* @vite-ignore */base+'native-arena.js');
    if(isCancelled()){cleanup();return ()=>{};}
    if(typeof module.mountArena!=='function')throw Error('PSH 원본 스크립트의 네이티브 진입점 누락');
    module.mountArena(scopedDocument);
    return cleanup;
  }catch(error){cleanup();throw error;}
}

/** The PSH control room is a local record manager, NOT the running EDOPro engine. */
export default function NativeArena(){
  const host=useRef<HTMLDivElement|null>(null);
  const [status,setStatus]=useState<'loading'|'ready'|'error'>('loading');
  const [error,setError]=useState('');
  useEffect(()=>{
    let cancelled=false;
    let cleanup:(()=>void)|null=null;
    const current=host.current;
    if(current)void mountArenaNative(current,()=>cancelled).then(release=>{
      if(cancelled)release();else{cleanup=release;setStatus('ready');}
    }).catch(err=>{if(!cancelled){setError(String(err));setStatus('error');}});
    return ()=>{cancelled=true;cleanup?.();};
  },[]);
  return <section className="native-arena" data-native-tool="arena" aria-label="PSH 검증 관제실">
    {status==='loading'&&<div className="native-arena-notice" role="status">PSH 검증 기록 작업실을 불러오는 중...</div>}
    {status==='error'&&<div className="native-arena-error" role="alert">{error} · 기록과 원본 파일은 변경되지 않았습니다.</div>}
    <div className="native-arena-mount" ref={host}/>
  </section>;
}

import { validateCatalog } from './sharedCatalog';
import type { SharedCatalog } from './sharedCatalog';

export type StudioScope = 'all' | 'nocturna' | `shared:${string}`;
export type ProjectOption = { key:StudioScope; name:string; kind:'all'|'world'|'shared'; cards:number; description:string };
export const PROJECT_SCOPE_KEY='ygo-studio-ui-v2-project';
export const RECENT_PAGES_KEY='ygo-studio-ui-v2-recents';

export function readSharedProjects(raw:unknown):{projects:ProjectOption[];catalog:SharedCatalog|null}{
  if(!validateCatalog(raw))return {projects:[],catalog:null};
  const grouped=new Map<string,number>();
  for(const card of raw.cards){
    const theme=card.theme.trim()||'테마 미분류';
    grouped.set(theme,(grouped.get(theme)??0)+1);
  }
  const projects=Array.from(grouped.entries()).sort((a,b)=>a[0].localeCompare(b[0],'ko'))
    .map(([name,cards]):ProjectOption=>({key:`shared:${name}`,name,kind:'shared',cards,description:'공통 카드·덱 보관함에 등록된 메타데이터'}));
  return {projects,catalog:raw};
}

export function parseSharedProjectStorage(text:string|null){
  if(!text)return {projects:[],catalog:null};
  try{return readSharedProjects(JSON.parse(text));}catch{return {projects:[],catalog:null};}
}

export function projectOptions(worldCards:number,sharedProjects:ProjectOption[]):ProjectOption[]{
  return [
    {key:'all',name:'전체 작업',kind:'all',cards:worldCards+sharedProjects.reduce((n,p)=>n+p.cards,0),description:'연결된 자료와 작업실 전체'},
    {key:'nocturna',name:'종언성서－녹투르나',kind:'world',cards:worldCards,description:'세계관·설계 카드 원장'},
    ...sharedProjects
  ];
}

export function safeProjectSelection(saved:string|null,available:ProjectOption[]):StudioScope{
  return available.some(p=>p.key===saved)?saved as StudioScope:'all';
}
export function addRecent(current:string[],next:string,valid:string[],max=5):string[]{
  if(!valid.includes(next))return current.filter(x=>valid.includes(x)).slice(0,max);
  return [next,...current.filter(x=>x!==next&&valid.includes(x))].slice(0,max);
}
export function parseRecentPages(raw:string|null,valid:string[]):string[]{
  if(!raw)return [];
  try{const v=JSON.parse(raw);return Array.isArray(v)?[...new Set(v.filter((x):x is string=>typeof x==='string'&&valid.includes(x)))].slice(0,5):[];}catch{return [];}
}

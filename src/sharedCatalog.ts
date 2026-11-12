/** P2 / 공통 작업 자료실 V1: 원본 앱의 승인·검증 데이터를 변경하지 않는다. */
export const CATALOG_KEY='ygo-studio-shared-catalog-v1';
export const HANDOFF_KEY='ygo-studio-p2-handoff-v1';
export type SharedCard={id:string;name:string;theme:string;effect:string;source:string};
export type SharedDeck={name:string;main:string[];extra:string[];side:string[];source:string};
export type SharedCatalog={schemaVersion:1;cards:SharedCard[];decks:SharedDeck[]};
export type ImportCandidate={cards:SharedCard[];decks:SharedDeck[];invalid:number};
export type MergePreview={addedCards:number;duplicateCards:number;conflicts:number;addedDecks:number;duplicateDecks:number;skippedInvalid:number;catalog:SharedCatalog};
export const emptyCatalog=():SharedCatalog=>({schemaVersion:1,cards:[],decks:[]});
const object=(x:unknown):x is Record<string,unknown>=>!!x&&typeof x==='object'&&!Array.isArray(x);
const limited=(x:unknown,max:number)=>typeof x==='string'?x.trim().slice(0,max):'';
export function validCardId(value:unknown):string|null{
  const s=typeof value==='number'&&Number.isSafeInteger(value)?String(value):typeof value==='string'?value.trim():'';
  if(!/^[1-9]\d{0,9}$/.test(s))return null;
  const n=Number(s);return Number.isSafeInteger(n)&&n<=4294967295?String(n):null;
}
export function parseCards(raw:unknown,source:string):ImportCandidate{
  if(!Array.isArray(raw)||raw.length>2000)throw Error('카드 목록은 최대 2000장까지 가져올 수 있습니다.');
  const cards:SharedCard[]=[],seen=new Set<string>();
  let invalid=0;
  for(const row of raw){
    if(!object(row)){invalid++;continue;}
    const id=validCardId(row.id);
    if(!id||seen.has(id)){invalid++;continue;}
    const name=limited(row.name,120);
    if(!name){invalid++;continue;}
    seen.add(id);cards.push({id,name,theme:limited(row.theme,100),effect:limited(row.effect??row.desc,20000),source:limited(source,120)});
  }
  return {cards,decks:[],invalid};
}
export function parsePortableJson(raw:unknown,source='가져온 JSON'):ImportCandidate{
  if(!Array.isArray(raw)&&!object(raw))throw Error('지원하지 않는 JSON 구조입니다.');
  const items=Array.isArray(raw)?raw:raw.cards;
  if(!Array.isArray(items))throw Error('cards 배열을 가진 백업만 지원합니다.');
  const parsed=parseCards(items,source);
  if(object(raw)&&raw.schemaVersion===1&&Array.isArray(raw.decks)){
    if(raw.decks.length>200)throw Error('덱은 최대 200개까지 지원합니다.');
    for(const v of raw.decks){
      if(!object(v)||!Array.isArray(v.main)||!Array.isArray(v.extra)||!Array.isArray(v.side)){parsed.invalid++;continue;}
      const name=limited(v.name,120)||'덱';
      const zones=[v.main,v.extra,v.side];
      const lists=zones.map(z=>z.map(validCardId));
      if(lists.some((z,i)=>z.includes(null)||z.length>(i===0?100:50))){parsed.invalid++;continue;}
      parsed.decks.push({name,main:lists[0] as string[],extra:lists[1] as string[],side:lists[2] as string[],source:limited(v.source,120)||source});
    }
  }
  return parsed;
}
export function parseYdk(text:string,name:string):SharedDeck{
  if(text.length>200000)throw Error('YDK 파일이 너무 큽니다.');
  const sections={main:[] as string[],extra:[] as string[],side:[] as string[]};
  let target:keyof typeof sections='main';
  for(const raw of text.replace(/^\uFEFF/,'').split(/\r?\n/)){
    const line=raw.trim();if(!line||line.startsWith('#created by'))continue;
    if(line==='#main'){target='main';continue;}
    if(line==='#extra'){target='extra';continue;}
    if(line==='!side'){target='side';continue;}
    if(line.startsWith('#'))continue;
    const id=validCardId(line);if(!id)throw Error('YDK에 올바르지 않은 카드 ID가 있습니다.');
    sections[target].push(id);
    if(sections.main.length>100||sections.extra.length>50||sections.side.length>50)throw Error('YDK 목록 크기 제한을 초과했습니다.');
  }
  if(!sections.main.length&&!sections.extra.length&&!sections.side.length)throw Error('덱에 카드가 없습니다.');
  return {name:limited(name,120)||'이름 없는 덱',...sections,source:'YDK 원본에서 불러옴'};
}
export function toYdk(deck:SharedDeck):string{
  return '#created by YGO STUDIO P2\n#main\n'+deck.main.join('\n')+'\n#extra\n'+deck.extra.join('\n')+'\n!side\n'+deck.side.join('\n')+'\n';
}
export function validateCatalog(v:unknown):v is SharedCatalog{
  if(!object(v)||v.schemaVersion!==1||!Array.isArray(v.cards)||!Array.isArray(v.decks)||v.cards.length>2000||v.decks.length>200)return false;
  return v.cards.every(c=>object(c)&&validCardId(c.id)!==null&&typeof c.name==='string'&&c.name.length>0&&c.name.length<=120&&typeof c.theme==='string'&&typeof c.effect==='string'&&c.effect.length<=20000&&typeof c.source==='string')
    &&v.decks.every(d=>object(d)&&typeof d.name==='string'&&typeof d.source==='string'&&[d.main,d.extra,d.side].every(a=>Array.isArray(a)&&a.every(x=>validCardId(x)!==null)));
}
export function mergeCatalog(base:SharedCatalog,incoming:ImportCandidate):MergePreview{
  const cards=[...base.cards],decks=[...base.decks];const map=new Map(cards.map(c=>[c.id,c]));
  let addedCards=0,duplicateCards=0,conflicts=0,addedDecks=0,duplicateDecks=0;
  for(const c of incoming.cards){
    const old=map.get(c.id);
    if(old){if(old.name===c.name&&old.effect===c.effect&&old.theme===c.theme)duplicateCards++;else conflicts++;continue;}
    if(cards.length>=2000)throw Error('공통 카드 보관함은 2000장까지 지원합니다.');
    cards.push(c);map.set(c.id,c);addedCards++;
  }
  const deckKey=(d:SharedDeck)=>JSON.stringify([d.name,d.main,d.extra,d.side]);
  const known=new Set(decks.map(deckKey));
  for(const d of incoming.decks){
    const key=deckKey(d);if(known.has(key)){duplicateDecks++;continue;}
    if(decks.length>=200)throw Error('공통 덱 보관함은 200개까지 지원합니다.');
    decks.push(d);known.add(key);addedDecks++;
  }
  return {catalog:{schemaVersion:1,cards,decks},addedCards,duplicateCards,conflicts,addedDecks,duplicateDecks,skippedInvalid:incoming.invalid};
}
export type Handoff={schemaVersion:1;target:'artlab'|'cardmaker';cards:SharedCard[]};
export function validHandoff(raw:unknown):raw is Handoff{
  return object(raw)&&raw.schemaVersion===1&&(raw.target==='artlab'||raw.target==='cardmaker')
    &&Array.isArray(raw.cards)&&raw.cards.length>0&&raw.cards.length<=400
    &&raw.cards.every(x=>object(x)&&validCardId(x.id)!==null&&typeof x.name==='string'&&x.name.length>0&&x.name.length<=120&&typeof x.effect==='string'&&typeof x.theme==='string');
}
export function cardMakerPayload(cards:SharedCard[]):unknown[]{
  return cards.map(c=>({
    id:Number(c.id),name:c.name,theme:c.theme||'미확인 테마',frame:'effect',attribute:'바람',race:'기계족',level:4,
    atk:'0',def:'0',effect:c.effect||'',subtype:'일반',pendulum:false,scaleLeft:1,scaleRight:1,
    pendulumEffect:'',arrows:[],artwork:'',zoom:1,offsetX:0,offsetY:0,
    unsupported:['속성·종족·레벨·공수·프레임은 임시값입니다. 원본 확인 및 수정 필요'],
  }));
}

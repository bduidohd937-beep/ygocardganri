import type {SharedCard,SharedCatalog,SharedDeck} from './sharedCatalog';
import type {MediaItem} from './sharedMedia';

export type CardRecoveryState='new'|'same'|'conflict'|'source-conflict'|'unavailable';
export type ArtRecoveryState='new'|'same'|'conflict'|'unavailable';
export type RecoveryRow={
  id:string; cardState:CardRecoveryState; artState:ArtRecoveryState;
  existingCard:SharedCard|null; candidateCard:SharedCard|null;
  candidateSources:string[]; image:MediaItem|null; oldImageHash:string; conflictCards:SharedCard[];
};
/** No card, deck, or artwork is edited by this comparison. */
export function compareRecoveryCard(existing:SharedCard|undefined,candidates:SharedCard[]):CardRecoveryState{
  if(!candidates.length)return 'unavailable';
  const distinct=new Set(candidates.map(c=>JSON.stringify([c.name,c.theme,c.effect])));
  if(distinct.size>1)return 'source-conflict';
  if(!existing)return 'new';
  const proposed=candidates[0];
  return existing.name===proposed.name&&existing.theme===proposed.theme&&existing.effect===proposed.effect?'same':'conflict';
}
export function compareRecoveryArt(existingHash:string|undefined,candidateHash:string|undefined):ArtRecoveryState{
  if(!candidateHash)return 'unavailable';
  if(!existingHash)return 'new';
  return existingHash===candidateHash?'same':'conflict';
}
export function deckRecoveryIds(deck:SharedDeck):string[]{
  return [...new Set([...deck.main,...deck.extra,...deck.side])];
}
export function assessRecovery(
  deck:SharedDeck,catalog:SharedCatalog,media:MediaItem[],
  candidateCards:SharedCard[],artworks:Map<string,MediaItem>,
  existingHashes:Map<string,string>,blockedImageIds:Set<string>=new Set()
):RecoveryRow[]{
  const current=new Map(catalog.cards.map(c=>[c.id,c]));
  const storedMedia=new Set(media.map(m=>m.id));
  const byId=new Map<string,SharedCard[]>();
  for(const card of candidateCards){
    if(!byId.has(card.id))byId.set(card.id,[]);
    byId.get(card.id)!.push(card);
  }
  return deckRecoveryIds(deck).map(id=>{
    const options=byId.get(id)||[];
    const old=current.get(id)||null;
    const cardState=compareRecoveryCard(old||undefined,options);
    const image=artworks.get(id)||null;
    const artState=blockedImageIds.has(id)?'conflict':
      storedMedia.has(id)&&image&&!existingHashes.has(id)?'conflict':
      compareRecoveryArt(existingHashes.get(id),image?.sha256);
    return {id,cardState,artState,existingCard:old,candidateCard:options[0]||null,
      candidateSources:[...new Set(options.map(c=>c.source))],image,oldImageHash:existingHashes.get(id)||'',
      conflictCards:options};
  });
}

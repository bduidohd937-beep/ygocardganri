import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCoalescedSaver } from '../src/autosave';

afterEach(()=>{vi.useRealTimers();});

describe('P0.5 coalesced saves',()=>{
  it('100 rapid edits write only the newest version',async()=>{
    vi.useFakeTimers();
    const values:number[]=[];
    const states:string[]=[];
    const saver=createCoalescedSaver(async n=>{values.push(n);},450,phase=>states.push(phase));
    for(let i=0;i<100;i++)saver.schedule(i);
    await vi.advanceTimersByTimeAsync(451);
    expect(values).toEqual([99]);
    expect(states.at(-1)).toBe('saved');
  });
  it('concurrent flushes preserve commit order',async()=>{
    vi.useFakeTimers();
    const order:number[]=[];
    let unblock:()=>void=()=>{};
    const first=new Promise<void>(resolve=>{unblock=resolve;});
    const saver=createCoalescedSaver(async n=>{
      if(n===1)await first;
      order.push(n);
    },100);
    saver.schedule(1);
    const running=saver.flush();
    await vi.advanceTimersByTimeAsync(0);
    saver.schedule(2);
    const pending=saver.flush();
    unblock();
    await Promise.all([running,pending]);
    expect(order).toEqual([1,2]);
  });
  it('a failed save reports an error and later changes still persist',async()=>{
    vi.useFakeTimers();
    const states:string[]=[];
    const stored:number[]=[];
    const saver=createCoalescedSaver(async n=>{
      if(n===1)throw new Error('quota');
      stored.push(n);
    },100,phase=>states.push(phase));
    saver.schedule(1);await saver.flush();
    expect(states.at(-1)).toBe('error');
    saver.schedule(2);await saver.flush();
    expect(states.at(-1)).toBe('saved');
    expect(stored).toEqual([2]);
  });
});
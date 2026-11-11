declare module 'luaparse' {
  export type Options = { comments?:boolean; locations?:boolean; ranges?:boolean; scope?:boolean; luaVersion?:'5.1'|'5.2'|'5.3'|'LuaJIT'; encodingMode?:string };
  export function parse(code:string,options?:Options): unknown;
}

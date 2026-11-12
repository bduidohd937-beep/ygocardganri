/** Unified *application chrome* palette. Card artwork, frame PNGs, ratings and statuses are not recolored. */
export const STUDIO_PALETTE={
  background:'#10151b',surface:'#171e27',surface2:'#202a35',line:'#374452',
  text:'#e8e9ed',muted:'#9aa8b7',accent:'#c99189',accentSoft:'#30252b',accentLine:'#78565a'
} as const;
export type StudioToolKind='cardmaker'|'artlab'|'designlab'|'arena';

/** Shadow DOM styles: applied AFTER the original tool CSS to buttons, navigation and panels only. */
export function nativeToolStyle(tool:'cardmaker'|'artlab'):string{
  const p=STUDIO_PALETTE;
  const common=`:host{--studio-bg:${p.background};--studio-surface:${p.surface};--studio-line:${p.line};--studio-accent:${p.accent};--studio-muted:${p.muted};--studio-text:${p.text};color:${p.text}}
:host button:focus-visible,:host input:focus-visible,:host select:focus-visible,:host textarea:focus-visible{outline:2px solid ${p.accent};outline-offset:2px}
`;
  if(tool==='cardmaker')return common+`
:host{--lime:${p.accent};--line:${p.line};--muted:${p.muted};--panel:${p.surface}}
:host .topbar{background:${p.surface}!important;border-bottom-color:${p.line}}
:host .brand-mark{background:${p.accent};color:#291e23}
:host .primary{background:${p.accent};color:#291e23}
:host .stage-toolbar,:host .editor-header,:host .library-header{border-color:${p.line}}
:host .theme-select select:focus-visible{outline-color:${p.accent}}
:host .sidebar{background:${p.surface}}
:host .stage{background:${p.background}}
:host .editor{background:${p.surface}}
`;
  return common+`
:host{--bg:${p.background};--panel:${p.surface};--border:${p.line};--muted:${p.muted};--accent:${p.accent};--blue:${p.accent}}
:host .topbar{background:${p.surface};border-color:${p.line}}
:host .shell{background:${p.background}}
:host button:focus-visible{outline-color:${p.accent}}
`;
}
/** The two legacy full-screen research apps are still same-origin iframes. This is CSS-only. */
export function legacyToolStyle(tool:'designlab'|'arena'):string{
  const p=STUDIO_PALETTE;
  if(tool==='arena')return `
:root{--bg:${p.background};--aside:${p.surface};--surface:${p.surface};--surface2:${p.surface2};--border:${p.line};--muted:${p.muted};--text:${p.text};--teal:${p.accent};--blue:#98b4d4}
.logo-mark{background:${p.accentSoft};color:${p.accent}}
.navbtn.active{background:${p.accentSoft};color:#edc2b9}
.navbtn:hover{background:${p.surface2}}
button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible{outline:2px solid ${p.accent};outline-offset:2px}
`;
  return `
:root{color:${p.text};background:${p.background}}
body,.app-shell{background:${p.background}}
.sidebar{background:${p.surface};border-right-color:${p.line}}
.brand-icon{background:${p.accentSoft};border-color:${p.accentLine};color:${p.accent};box-shadow:none}
.nav-link.active,.workspace-tab.active{background:${p.accentSoft};border-color:${p.accentLine};color:#f0d5d0}
.nav-link.active>span:first-child,.side-heading span{color:${p.accent}}
.nav-link:hover:not(.disabled),.workspace-tab:hover{background:${p.surface2};color:${p.text}}
.workspace-tabs{border-color:${p.line}}
button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible{outline:2px solid ${p.accent};outline-offset:2px}
`;
}
export function applyStudioThemeToFrame(iframe:HTMLIFrameElement,tool:'designlab'|'arena'):boolean{
  try{
    const doc=iframe.contentDocument;
    if(!doc?.head)return false;
    let style=doc.getElementById('ygo-studio-theme-v2-4') as HTMLStyleElement|null;
    if(!style){style=doc.createElement('style');style.id='ygo-studio-theme-v2-4';doc.head.appendChild(style);}
    style.textContent=legacyToolStyle(tool);
    return true;
  }catch{return false;}
}

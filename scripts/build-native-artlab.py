#!/usr/bin/env python3
"""Build a module entry point for the approved ART LAB implementation.

Converts the existing self-invoking application into an explicit same-origin
mount function, with DOM lookups scoped to the supplied ShadowRoot. The
original legacy app.js remains unchanged and deploys alongside the module.
"""
from pathlib import Path

source=Path('.integration_sources/artlab')
target=Path('dist/modules/artlab')
app=(source/'app.js').read_text(encoding='utf-8')
prefix="(() => {\n  'use strict';"
assert app.count(prefix)==1, 'Unexpected ART LAB app entry point'
assert app.rstrip().endswith('})();'), 'Unexpected ART LAB app closure'
wrapper="""export function mountArtLab(root) {
  'use strict';
  if (!root || !root.host || !root.getElementById) throw new Error('ART LAB ShadowRoot required');
  const realDocument = window.document;
  const document = {
    getElementById: id => root.getElementById(id),
    querySelector: selector => root.querySelector(selector),
    querySelectorAll: selector => root.querySelectorAll(selector),
    createElement: (...args) => realDocument.createElement(...args),
    createDocumentFragment: (...args) => realDocument.createDocumentFragment(...args),
    head: realDocument.head,
    body: realDocument.body
  };
"""
app=app.replace(prefix,wrapper,1)
app=app.rstrip()[:-len('})();')] + "  return () => { state.cancel=true; if(toastTimer) clearTimeout(toastTimer); };\n}\n"
const_old="Object.defineProperty(window,'__YGO_TEST__'"
assert app.count(const_old)==1, 'ART LAB test API changed'
app=app.replace(const_old,"Object.defineProperty(root.host,'__YGO_TEST__'",1)
(target/'native.js').write_text(app,encoding='utf-8')
engine=(source/'asset-engine.js').read_text(encoding='utf-8')
path_old="return `assets/motifs/"
path_new="return `${window.__YGO_ART_BASE||'./'}assets/motifs/"
assert engine.count(path_old)==1, 'ART LAB asset path format changed'
engine=engine.replace(path_old,path_new,1)
(target/'asset-engine-native.js').write_text(engine,encoding='utf-8')
print('[native] ART LAB mount module, scoped selectors and asset URL prefix generated')

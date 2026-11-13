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


# V1.5 화풍 연구실은 원본 브라우저 UI와 별도의 프롬프트 모듈로 분리한다.
# 기존 app.js의 카드 저장·이미지 생성 로직은 그대로 사용한다.
prompt=(source/'prompt-lab.js').read_text(encoding='utf-8')
assert prompt.count(prefix)==1, 'Unexpected prompt lab entry point'
assert prompt.rstrip().endswith('})();'), 'Unexpected prompt lab closure'
prompt_wrapper="""export function mountPromptLab(root) {
  'use strict';
  if (!root || !root.host || !root.getElementById) throw new Error('ART LAB ShadowRoot required');
  const realDocument = window.document;
  const document = {
    getElementById: id => root.getElementById(id),
    querySelector: selector => root.querySelector(selector),
    createElement: (...args) => realDocument.createElement(...args),
    body: realDocument.body
  };
"""
prompt=prompt.replace(prefix,prompt_wrapper,1)
listener="window.addEventListener('ygo:card-change',e=>syncCard(e.detail,false));"
assert prompt.count(listener)==1, 'Prompt card-change listener changed'
prompt=prompt.replace(listener,"const handleCardChange=e=>syncCard(e.detail,false);\\n  window.addEventListener('ygo:card-change',handleCardChange);",1)
prompt=prompt.rstrip()[:-len('})();')] + "  return () => { window.removeEventListener('ygo:card-change',handleCardChange); };\\n}\\n"
(target/'prompt-lab-native.js').write_text(prompt,encoding='utf-8')
print('[native] ART LAB 24-style prompt research module generated')

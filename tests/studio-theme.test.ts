import {describe,it,expect} from 'vitest';
import {STUDIO_PALETTE,legacyToolStyle,nativeToolStyle} from '../src/studioTheme';

describe('YGO STUDIO V2.4 공통 디자인 시스템',()=>{
 it('기존 카드 이미지 프레임 데이터를 건드리지 않고 UI 색상만 공통화',()=>{
   const x=nativeToolStyle('cardmaker');
   expect(x).toContain('--lime:'+STUDIO_PALETTE.accent);
   expect(x).toContain(':host .brand-mark');
   expect(x).not.toContain('canvas');
   expect(x).not.toContain('card-frame');
   expect(x).not.toContain('background-image');
 });
 it('ART LAB 생성기 UI 영역만 변경하고 원본 이미지 엔진 코드는 수정하지 않는다',()=>{
   const x=nativeToolStyle('artlab');
   expect(x).toContain('--accent:'+STUDIO_PALETTE.accent);
   expect(x).not.toContain('svg path');
   expect(x).not.toContain('#art-canvas');
 });
 it('DESIGN LAB과 PSH는 각각 기존 상태색을 보호하며 스타일만 주입',()=>{
   const lab=legacyToolStyle('designlab');
   const psh=legacyToolStyle('arena');
   expect(lab).toContain('.workspace-tab.active');
   expect(psh).toContain('--teal:'+STUDIO_PALETTE.accent);
   expect(psh).not.toContain('--red:');
   expect(psh).not.toContain('--green:');
   expect(lab).not.toContain('.card-content');
 });
});

/* discord-in-office 페이지 주입 스크립트
   - 엑셀 크롬(리본/수식바/시트탭) 설치
   - 이모지 가시/비가시 토글 (비가시 시 [한글설명] 텍스트)
   전역 진입점: __DIO_BOOT(cfg), __dioSetEmoji(visible)
 */
/* [번들 조각 1/7] 코어 — IIFE 시작, DIO 전역, 스캔 스코프/캐시, 디스코드 선택자
   src/*.js 는 파일명 순서대로 이어붙여져 하나의 IIFE 로 주입된다 (bundle.js).
   조각 하나만 보면 괄호가 맞지 않으므로 node --check 가 통하지 않는다.
   문법 검사는 이어붙인 번들 전체에 대해 하고, npm test 가 그걸 확인한다.
   앞의 번호가 곧 순서다 — 바꾸면 깨진다. */
(function () {
  'use strict';
  if (window.__DIO) return;

  const DIO = (window.__DIO = { visible: true, booted: false, version: 11, passMs: {} });
  const FILE_NAME = '재고관리_2026.xlsx';

  /* ---------- 스캔 스코프 · 캐시 ----------
     roots가 null이면 전체 문서, 아니면 그 서브트리만 훑는다.
     getComputedStyle은 강제 스타일 재계산을 부르므로 요소당 한 번만 하고 캐시한다. */
  let roots = null;

  /* 요소 -> 우리가 position:relative 를 넣었는지.
     단순히 "봤다" 만 기억하면, 디스코드가 style 속성을 다시 써서 우리 값이
     지워졌을 때 영영 복구하지 못한다. 원래 배치가 있던 요소(false)와
     우리가 손댄 요소(true)를 구분해 후자만 다시 채운다. */
  const posFixed = new WeakMap();

  /* backgroundImage 캐시는 한 번의 스캔 안에서만 유효하다.
     SPA 는 같은 banner/splash 노드를 유지한 채 길드 전환이나 비동기 로딩으로
     style 만 바꾼다. 영구 캐시로 두면 첫 스캔의 'none' 을 계속 믿어서
     나중에 붙은 배너를 숨기지 못한다 — 숨김 모드에서 그대로 노출된다.
     대상이 배너·스플래시 몇 개뿐이라 스캔마다 다시 읽어도 싸다. */
  let bgCache = new WeakMap();
  function resetScanCaches() {
    bgCache = new WeakMap();
  }

  function qsa(sel) {
    if (!roots) return document.querySelectorAll(sel);
    const out = [];
    for (const r of roots) {
      if (!r || r.nodeType !== 1 || !r.isConnected) continue;
      if (r.matches(sel)) out.push(r);
      for (const el of r.querySelectorAll(sel)) out.push(el);
    }
    return out;
  }

  function ensurePos(node) {
    if (!node || node.nodeType !== 1) return;
    // 계산 스타일 읽기는 강제 레이아웃을 부르므로 요소당 한 번만 한다.
    if (!posFixed.has(node)) {
      posFixed.set(node, getComputedStyle(node).position === 'static');
    }
    // 인라인 style 읽기는 계산 스타일과 달리 레이아웃을 부르지 않아 매번 해도 싸다.
    if (posFixed.get(node) && node.style.position !== 'relative') {
      node.style.position = 'relative';
    }
  }

  /* ---------- 디스코드 선택자 ----------
     클래스에는 해시 접미사가 붙고 UI 개편 때 이름도 바뀐다. 한 곳에 모아두면
     개편이 와도 여기만 고치면 된다.
     부분일치에는 반드시 i 플래그 — CSS 속성 선택자는 값의 대소문자를 구분해서
     [class*="avatar"] 는 voiceUserAvatar__해시 를 놓친다. */
  const SEL = {
    msg: 'li[id^="chat-messages"]',
    stickerBox: '[class*="stickerContainer" i], [class*="stickerWrapper" i]',
    stickerName: '[class*="stickerName" i]',
    mediaGroup: '[class*="carousel" i], [class*="mediaList" i]',
    embed: '[class*="embed" i]'
  };

  /* ---------- 유틸 ---------- */
  function el(cls, text) {
    const e = document.createElement('span');
    e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

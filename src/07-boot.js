/* [번들 조각 7/7] 스캔 스케줄러와 진입점, IIFE 닫기
   src/*.js 는 파일명 순서대로 이어붙여져 하나의 IIFE 로 주입된다 (bundle.js).
   조각 하나만 보면 괄호가 맞지 않으므로 node --check 가 통하지 않는다.
   문법 검사는 이어붙인 번들 전체에 대해 하고, npm test 가 그걸 확인한다.
   앞의 번호가 곧 순서다 — 바꾸면 깨진다. */
  /* rootList가 비면 전체 문서, 아니면 그 서브트리만 훑는다. */
  function scan(rootList) {
    roots = rootList && rootList.length ? rootList : null;
    const t0 = performance.now();
    DIO.scans = (DIO.scans || 0) + 1;
    resetScanCaches(); // 스캔 사이에는 계산 스타일 캐시를 믿지 않는다
    try {
      enforceLightTheme();
      void forceLightTokens(); // 성공 후에는 boolean 체크 한 번으로 끝난다
      for (const pass of [scanChromeText, scanEmojis, scanStickers, scanEmbeds, scanPhotos, scanAvatars, scanBgAvatars, scanGutter, scanDecor, scanTextEmojis]) {
        try {
          pass();
        } catch (e) {
          DIO.lastErr = pass.name + ': ' + e.message;
        }
      }
    } finally {
      roots = null;
      DIO.lastScanMs = performance.now() - t0;
      DIO.totalScanMs = (DIO.totalScanMs || 0) + DIO.lastScanMs;
    }
  }

  /* ---------- 스캔 스케줄러 ----------
     예전 구현은 변이가 생길 때마다 rAF로 전체 문서를 다시 훑었다(최대 60회/초).
     디스코드는 프레즌스·타이핑·메시지 가상스크롤로 DOM을 쉬지 않고 바꾸고,
     스캔 자신도 DOM을 건드리므로 관측 → 스캔 → 변이 → 관측 되먹임이 났다.
     지금은 (1) 스캔 동안 관측을 끊어 자기 변이를 되먹이지 않고,
             (2) 변이를 SCAN_DELAY 만큼 모아 한 번만 처리하며,
             (3) 새로 붙은 서브트리만 훑는다.
     놓친 노드는 BACKUP_MS 전체 스캔이 받아낸다(기존 백업 루프와 같은 역할). */
  const SCAN_DELAY = 50;
  const LIGHT_START_MS = 5000; // 캐시가 없을 때 수집을 시작하기까지
  const LIGHT_REFRESH_MS = 30000; // 캐시가 있을 때 조용히 갱신하기까지
  const BACKUP_MS = 4000;
  const MAX_ROOTS = 40; // 이보다 쌓이면 전체 스캔이 오히려 싸다
  const OBSERVE = { childList: true, subtree: true };

  let timer = 0;
  let wantFull = false;
  const pending = new Set();

  function isOurs(node) {
    if (node.id && node.id.startsWith('dio-')) return true;
    if (!node.classList) return false;
    for (const c of node.classList) if (c.startsWith('dio-')) return true;
    return false;
  }

  /* 부모가 이미 목록에 있으면 자식 루트는 중복 순회다.
     MAX_ROOTS(40) 이하라 O(n^2)여도 전수 재훑기보다 훨씬 싸다. */
  function dedupeRoots(list) {
    return list.filter((x) => !list.some((o) => o !== x && o.contains(x)));
  }

  function runScan() {
    timer = 0;
    const list = wantFull ? null : dedupeRoots([...pending]);
    pending.clear();
    wantFull = false;
    mo.disconnect(); // 스캔이 만드는 변이를 자기가 다시 관측하지 않도록
    try {
      scan(list);
    } finally {
      if (DIO.booted) mo.observe(document.body, OBSERVE);
    }
  }

  function schedule() {
    if (!timer) timer = setTimeout(runScan, SCAN_DELAY);
  }

  function fullScan() {
    wantFull = true;
    if (timer) { clearTimeout(timer); timer = 0; }
    runScan();
  }

  const mo = new MutationObserver((records) => {
    for (const r of records) {
      for (const node of r.addedNodes) {
        if (node.nodeType === 3) {
          const p = node.parentElement;
          if (p && !isOurs(p)) pending.add(p); // 우리 크롬(시계·수식바)은 무시
          continue;
        }
        if (node.nodeType !== 1 || isOurs(node)) continue;
        pending.add(node);
      }
    }
    if (!pending.size) return;
    if (pending.size > MAX_ROOTS) wantFull = true;
    schedule();
  });

  window.__dioSetPanels = function (visible) {
    DIO.panels = !!visible;
    document.body.classList.toggle('dio-nopanel', !DIO.panels);
    syncRibbon();
  };

  window.__dioSetEmoji = function (visible) {
    DIO.visible = !!visible;
    // 다시 숨김으로 들어갈 때 예전에 펼쳐둔 것들이 살아나면 곤란하다
    if (DIO.visible) expanded.clear();
    document.body.classList.toggle('dio-hide', !DIO.visible);
    syncRibbon();
    fullScan();
  };

  DIO.scan = fullScan; // 디버그용

  window.__DIO_BOOT = function (cfg) {
    DIO.visible = !(cfg && cfg.emojiVisible === false);
    DIO.panels = !(cfg && cfg.panelsVisible === false);
    DIO.mac = !!(cfg && cfg.isMac); // buildChrome 이 안내 문구에 쓴다
    if (cfg && cfg.lightCss) useCachedLightCss(cfg.lightCss);
    document.body.classList.toggle('dio-hide', !DIO.visible);
    document.body.classList.toggle('dio-nopanel', !DIO.panels);
    buildChrome();
    syncRibbon();
    if (!DIO.booted) {
      DIO.booted = true;
      setInterval(() => { wantFull = true; schedule(); }, BACKUP_MS);

      /* 토큰 수집은 페이지가 자리잡은 뒤에 시작한다. 부팅 직후에 2.8MB 를 더
         받아 가면 디스코드 로딩이 멈춰 보인다(실측 20.6초).
         캐시로 이미 적용돼 있으면 서두를 이유가 더 없으니, 화면이 완전히
         자리잡은 뒤 조용히 다시 모아 갱신만 한다 — 디스코드가 CSS 를
         갈아끼워도 캐시가 낡은 채로 남지 않게. */
      const delay = DIO.lightFromCache ? LIGHT_REFRESH_MS : LIGHT_START_MS;
      setTimeout(() => {
        if (DIO.lightFromCache) DIO.lightCssApplied = false; // 다시 모으게 연다
        DIO.lightAllowed = true;
        wantFull = true;
        schedule();
      }, delay);
    }
    fullScan();
  };
})();

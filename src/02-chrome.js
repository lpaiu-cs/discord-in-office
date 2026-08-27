/* [번들 조각 2/7] 엑셀 크롬 — 리본 · 수식 막대 · 시트 탭 · 상태 표시줄
   src/*.js 는 파일명 순서대로 이어붙여져 하나의 IIFE 로 주입된다 (bundle.js).
   조각 하나만 보면 괄호가 맞지 않으므로 node --check 가 통하지 않는다.
   문법 검사는 이어붙인 번들 전체에 대해 하고, npm test 가 그걸 확인한다.
   앞의 번호가 곧 순서다 — 바꾸면 깨진다. */
  /* ---------- 엑셀 크롬 ---------- */
  let cellRefEl, formulaEl, statusEl;

  function buildChrome() {
    if (document.getElementById('dio-ribbon')) return;

    const rib = document.createElement('div');
    rib.id = 'dio-ribbon';
    rib.append(el('dio-brand', 'Discord'));
    ['파일', '홈', '삽입', '그리기', '수식', '데이터', '검토', '보기', '도움말'].forEach(
      (t) => rib.append(el('dio-tab' + (t === '홈' ? ' dio-on' : ''), t))
    );
    rib.append(el('dio-fname', FILE_NAME + '  —  저장됨'));
    document.body.append(rib);

    const fb = document.createElement('div');
    fb.id = 'dio-formula';
    cellRefEl = el('dio-cellref', 'B2');
    formulaEl = el('dio-finput', '=SUMIF(C:C,"회의",H:H)');
    fb.append(cellRefEl, el('dio-fxlab', 'fx'), formulaEl);
    document.body.append(fb);

    const sb = document.createElement('div');
    sb.id = 'dio-sheetbar';
    ['Sheet1', '채팅로그', 'Sheet3'].forEach((n, i) =>
      sb.append(el('dio-sheet' + (i === 0 ? ' dio-on' : ''), n))
    );
    statusEl = el('dio-status', '');
    sb.append(statusEl);
    document.body.append(sb);

    tickClock();
    setInterval(tickClock, 30000);

    // 메시지 클릭 → 셀 참조 + 수식 미리보기 흉내
    document.addEventListener(
      'click',
      (e) => {
        const li = e.target.closest && e.target.closest('li[id^="chat-messages"]');
        if (!li || !li.parentElement) return;
        const rows = [...li.parentElement.children].filter(
          (n) => n.id && n.id.startsWith('chat-messages')
        );
        const idx = rows.indexOf(li);
        if (idx < 0) return;
        const ref = String.fromCharCode(66 + (idx % 8)) + (idx + 2);
        const txt = (li.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 48);
        cellRefEl.textContent = ref;
        formulaEl.textContent = '="' + txt + '"';
      },
      true
    );
  }

  function tickClock() {
    if (!statusEl) return;
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    statusEl.textContent = '준비' + '  ·  ' + hh + ':' + mm;
  }

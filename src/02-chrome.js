/* [번들 조각 2/7] 엑셀 크롬 — 리본 · 수식 막대 · 시트 탭 · 상태 표시줄
   src/*.js 는 파일명 순서대로 이어붙여져 하나의 IIFE 로 주입된다 (bundle.js).
   조각 하나만 보면 괄호가 맞지 않으므로 node --check 가 통하지 않는다.
   문법 검사는 이어붙인 번들 전체에 대해 하고, npm test 가 그걸 확인한다.
   앞의 번호가 곧 순서다 — 바꾸면 깨진다. */
  /* ---------- 엑셀 크롬 ---------- */
  let cellRefEl, formulaEl, statusEl;
  let hideBtn, panelBtn;

  /* 버튼이 지금 상태를 보여줘야 "이미 눌려 있는지" 를 알 수 있다.
     엑셀 리본의 토글 단추처럼 눌린 것만 배경을 준다. */
  function syncRibbon() {
    if (hideBtn) hideBtn.classList.toggle('dio-pressed', !DIO.visible);
    if (panelBtn) panelBtn.classList.toggle('dio-pressed', !DIO.panels);
  }

  function buildChrome() {
    if (document.getElementById('dio-ribbon')) return;

    const rib = document.createElement('div');
    rib.id = 'dio-ribbon';
    rib.append(el('dio-brand', 'Discord'));
    ['파일', '홈', '삽입', '그리기', '수식', '데이터', '검토', '보기', '도움말'].forEach(
      (t) => rib.append(el('dio-tab' + (t === '홈' ? ' dio-on' : ''), t))
    );

    /* 단축키만 두면 눌렸는지 알 수 없고, 단축키를 모르면 쓸 수도 없다.
       리본에 눌린 상태가 보이는 버튼으로도 둔다.
       클릭은 preload 통로로 메인 프로세스에 보낸다 — 단축키·메뉴와 같은 곳으로
       모아야 설정 저장과 메뉴 라벨 갱신이 어긋나지 않는다. */
    /* macOS 는 메인 프로세스가 Cmd 로 판정한다(input.meta). 안내를 Ctrl 로
       고정해두면 맥 사용자가 그대로 눌러도 아무 일이 없다. */
    const key = (letter, shift) =>
      DIO.mac
        ? '⌘' + (shift ? '⇧' : '') + letter
        : 'Ctrl+' + (shift ? 'Shift+' : '') + letter;

    hideBtn = el('dio-rbtn', '내용 가리기');
    hideBtn.title = '이모지·사진·임베드·프로필 가리기 (' + key('E') + ')';
    panelBtn = el('dio-rbtn', '탐색 창');
    panelBtn.title = '서버·채널 목록 접기/펴기 (' + key('B', true) + ')';

    const send = (name, local) => (e) => {
      e.preventDefault();
      e.stopPropagation();
      const bridge = window.dioBridge;
      if (bridge && bridge[name]) bridge[name]();
      else local(); // 통로가 없으면 최소한 화면만이라도 바뀌게 (저장은 안 된다)
    };
    hideBtn.addEventListener('click', send('toggleEmoji', () => window.__dioSetEmoji(!DIO.visible)));
    panelBtn.addEventListener('click', send('togglePanels', () => window.__dioSetPanels(!DIO.panels)));

    rib.append(hideBtn, panelBtn);
    rib.append(el('dio-fname', FILE_NAME + '  —  저장됨'));
    document.body.append(rib);
    syncRibbon();

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

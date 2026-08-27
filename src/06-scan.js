/* [번들 조각 6/7] 스캔 패스 — 이모지 · 스티커 · 임베드 · 사진 · 프로필 · 텍스트
   src/*.js 는 파일명 순서대로 이어붙여져 하나의 IIFE 로 주입된다 (bundle.js).
   조각 하나만 보면 괄호가 맞지 않으므로 node --check 가 통하지 않는다.
   문법 검사는 이어붙인 번들 전체에 대해 하고, npm test 가 그걸 확인한다.
   앞의 번호가 곧 순서다 — 바꾸면 깨진다. */
  /* ---------- 이모지 스캔 ---------- */
  function scanEmojis() {
    for (const img of qsa('img[class*="emoji" i]')) {
      setHidden(img, ensureLabel(img), describe(img.alt));
    }
    // 이름 옆 배경이미지 이모지(img가 아닌 형태) — 인라인 style의 emoji URL로 식별
    for (const el of qsa('[style*="/emojis/"], [style*="emoji-sprite"]')) {
      setDisplay(el, DIO.visible);
    }
  }

  /* ---------- 스티커 스캔 ----------
     실측: <img class="...stickerAsset__해시" src="https://media.discordapp.net/stickers/...">
     이며, 디스코드가 [class*="stickerName" i] 요소로 스티커 이름을 내장 렌더한다. */
  function stickerName(st) {
    const cont = st.closest && st.closest(SEL.stickerBox);
    const nameEl = cont && cont.querySelector(SEL.stickerName);
    if (nameEl && nameEl.textContent.trim()) return nameEl.textContent.trim();
    const raw = (st.getAttribute('alt') || st.getAttribute('aria-label') || '').trim();
    return raw.replace(/^(스티커|sticker)\s*[:：]?\s*/i, '');
  }

  function scanStickers() {
    const nodes = qsa(
      'img[class*="sticker" i], canvas[class*="sticker" i], img[src*="/stickers/"], video[src*="/stickers/"]'
    );
    collapsible(nodes, {
      name: 'sticker',
      box: (st) => st.closest && st.closest(SEL.stickerBox),
      labelClass: 'dio-emolabel dio-stick',
      labelShow: 'inline-block',
      title: '눌러서 스티커 펼치기',
      collapseBack: true,
      text: (st) => {
        const name = stickerName(st);
        return name ? '[스티커:' + name + ']' : '[스티커]';
      },
      onState: (st, cont, show, lab) => {
        if (cont === st) return; // 컨테이너가 없으면 크기를 건드릴 게 없다
        ensurePos(cont);
        const nameEl = cont.querySelector(SEL.stickerName);
        if (!show) {
          // 접히면 라벨 한 줄 크기로 줄여 원본이 차지하던 자리를 없앤다
          if (cont.dataset.dioW === undefined) cont.dataset.dioW = cont.style.width || '';
          if (cont.style.width !== 'auto') cont.style.width = 'auto';
          collapseHeight(cont, false, '22px');
          if (nameEl && nameEl.style.display !== 'none') nameEl.style.display = 'none';
          lab.classList.add('dio-static');
        } else {
          if (cont.dataset.dioW !== undefined) {
            cont.style.width = cont.dataset.dioW;
            delete cont.dataset.dioW;
          }
          collapseHeight(cont, true, '22px');
          if (nameEl && nameEl.style.display === 'none') nameEl.style.display = '';
          lab.classList.remove('dio-static');
        }
      }
    });
  }

  /* ---------- 크롬 텍스트 위장 ----------
     서버·채널 이름은 "이건 엑셀이 아니다"를 가장 크게 알리는 요소다.
     **숨김 모드와 무관하게 항상** 적용한다 — 채널이 어디인지는 좌측 패널을
     펴면(Ctrl+Shift+B) 확인할 수 있으니 길을 잃지 않는다.

     감추기만 하면 되는 것(상단 바·채널 헤더)은 excel.css 가 처리한다.
     여기서는 **문구를 갈아끼워야 하는** 두 곳만 다룬다 — CSS 로는 텍스트를
     바꿀 수 없기 때문이다. */
  const CHROME_TEXT = [
    {
      /* "search__해시" 만 잡는다.
         [class*="search"] 로 넓게 잡으면 검색 결과 패널(searchResultsWrap__해시
         등)까지 들어오고, 거기 있는 실제 메시지가 우연히 "…검색" 으로 끝나면
         대화 내용을 안내문으로 오인해 덮어쓴다.
         디스코드 클래스는 <모듈명>__<해시> 꼴이라 "search" 바로 뒤에 "__" 가
         오는 것만이 검색창 본체다. 결과 패널은 searchResults… 처럼 이어져서
         이 패턴에 걸리지 않는다. */
      root: '[class*="search__" i]',
      want: '검색',
      match: /검색$|^search\b/i
    },
    {
      root: '[class*="channelTextArea" i]',
      pick: '[class*="placeholder" i]',
      want: '값을 입력하십시오',
      match: /메시지 보내기|^message\s/i
    }
  ];

  /* 이 안쪽은 이모지 래핑 대상에서 뺀다. 문구를 통째로 갈아끼우는 자리라
     .dio-emoji-text 스팬이 끼면, 그 스팬을 되살리는 쪽과 문구를 덮는 쪽이
     서로 밀어내며 DOM 을 계속 건드린다. */
  const CHROME_ROOTS = CHROME_TEXT.map((s) => s.root).join(', ');

  /* 안내문 길이 상한 — 대화 한 덩어리가 통째로 들어오는 걸 막는 안전장치다.
     오인 방지의 본체는 이게 아니라 구조 선택자(search__ / placeholder)다.

     디스코드는 서버·채널 이름을 **100자까지** 허용한다. 여기에 고정 문구가
     붙으므로 실제로 나올 수 있는 최대치는:
       "<서버명 100자> 검색"            → 103
       "#<채널명 100자>에 메시지 보내기" → 110
       "Message #<채널명 100자>"        → 109
     처음에 60으로 잡았더니 긴 이름에서 그대로 노출됐다. 다른 로케일의 고정
     문구가 더 길 수 있어 여유를 둔다. */
  const CHROME_MAX = 160;

  function applyChromeText(root, spec) {
    if (!root || !root.isConnected) return;
    const box = spec.pick ? root.querySelector(spec.pick) : root;
    if (!box || box.closest('input, textarea, [contenteditable="true"]')) return;

    /* 상자의 텍스트 **전체**가 곧 그 안내문이어야 한다.
       조각 하나만 보고 판단하면 대화 내용을 안내문으로 오인한다 — 결과 패널의
       마지막 메시지가 "자료 검색" 이면 그걸 "검색" 으로 덮어쓰게 된다. */
    const whole = box.textContent.trim();
    if (whole === spec.want) return;
    if (whole.length > CHROME_MAX || !spec.match.test(whole)) return;

    /* 텍스트 노드만 갈아끼운다. box.textContent 에 통째로 대입하면 돋보기
       아이콘 같은 자식 요소가 날아가고 디스코드 쪽 핸들러까지 같이 사라진다.
       매번 다시 훑는다 — React 가 안쪽을 갈아끼워도 따라가야 한다. */
    const walk = document.createTreeWalker(box, NodeFilter.SHOW_TEXT);
    const texts = [];
    while (walk.nextNode()) {
      if (walk.currentNode.textContent.trim()) texts.push(walk.currentNode);
    }
    if (!texts.length) return;
    texts[0].nodeValue = spec.want;
    for (let i = 1; i < texts.length; i++) texts[i].nodeValue = '';
  }

  /* 스캔 스케줄러는 childList 만 관측하고, 증분 스캔은 변이가 난 서브트리만
     훑는다. 그래서 둘 다로는 이 문구를 지키지 못한다:
       - React 가 텍스트 노드의 nodeValue 만 바꾸면 addedNodes 가 없어 스캔이
         예약되지 않는다.
       - 안쪽 span 만 교체되면 증분 스캔의 루트는 그 span 이라, 조상인 검색
         컨테이너까지 올라가지 않아 대상을 찾지 못한다.
     둘 다 4초 백업 스캔까지 서버 이름이 그대로 보인다는 뜻이다.

     그래서 **클래스가 안정적인 컨테이너**(검색창·입력창)에 좁게 관측을 건다.
     leaf 요소에 걸면 교체되는 순간 분리된 옛 노드만 보게 된다.
     문서 전역에 characterData 를 걸면 메시지마다 콜백이 터지므로 하지 않는다. */
  const CHROME_OBSERVE = { characterData: true, childList: true, subtree: true };
  let chromeWatch = [];
  const chromeMo = new MutationObserver(() => {
    for (const w of chromeWatch) applyChromeText(w.root, w.spec);
  });

  function watchChrome(w) {
    chromeWatch.push(w);
    chromeMo.observe(w.root, CHROME_OBSERVE);
  }

  /* 상단 바 찾기 — CSS 의 :has() 를 대신한다.
     실측 구조가 div.title_c38106 > div.title_edbb22 이므로, "title_" 안에
     "title_" 이 바로 들어 있는 바깥 컨테이너가 그 바다. 한 번 찾으면 붙잡고
     있다가 떨어져 나갔을 때만 다시 찾는다. */
  let topBar = null;
  function tagTopBar() {
    if (topBar && topBar.isConnected) {
      // React 가 class 를 다시 쓰면 우리 표시가 지워진다
      if (!topBar.classList.contains('dio-topbar')) topBar.classList.add('dio-topbar');
      return;
    }
    const inner = document.querySelector('[class*="title_" i] > [class*="title_" i]');
    topBar = inner && inner.parentElement;
    if (topBar) topBar.classList.add('dio-topbar');
  }

  function scanChromeText() {
    tagTopBar();
    const found = [];
    for (const spec of CHROME_TEXT) {
      for (const root of qsa(spec.root)) {
        applyChromeText(root, spec);
        found.push({ root, spec });
      }
    }

    if (roots) {
      /* 증분 스캔에서는 목록을 갈아치우지 않는다 — 컨테이너를 못 찾는 경우가
         많아 그걸로 덮으면 관측이 끊긴다. 대신 새로 나타난 컨테이너만 더한다.
         떨어져 나간 것은 아래 전체 스캔이 정리한다(최대 4초). */
      for (const f of found) {
        if (!chromeWatch.some((w) => w.root === f.root)) watchChrome(f);
      }
      return;
    }

    const same =
      found.length === chromeWatch.length && found.every((f, i) => f.root === chromeWatch[i].root);
    if (same) return;
    chromeMo.disconnect();
    chromeWatch = [];
    for (const f of found) watchChrome(f);
  }

  /* ---------- 아바타 자리 여백 ----------
     아바타를 없애도 그 자리를 비워두는 여백이 남는다. 디스코드는 아바타를
     절대배치하고 본문 쪽에 큰 padding-left 를 주기 때문이다.
     클래스 이름을 넘겨짚지 않고, 메시지 안에서 실제로 큰 왼쪽 여백을 가진
     요소를 찾아 표시만 붙인다. 보이기/숨김 전환은 CSS 가 알아서 한다.

     계산 스타일 읽기는 비싸므로 메시지당 한 번만 하고 기억해 둔다.
     후보도 메시지 자신과 직계 자식까지만 본다 — 여백은 거기 있다. */
  const GUTTER_MIN = 40; // 이보다 크면 아바타 자리로 본다
  const gutterSeen = new WeakSet();

  function scanGutter() {
    for (const li of qsa(SEL.msg)) {
      if (gutterSeen.has(li)) continue;
      gutterSeen.add(li);
      for (const el of [li, ...li.children]) {
        if ((parseFloat(getComputedStyle(el).paddingLeft) || 0) >= GUTTER_MIN) {
          el.classList.add('dio-nogutter');
          break;
        }
      }
    }
  }

  /* ---------- 임베드 스캔 ----------
     유튜브·링크 미리보기는 사진과 달리 컨테이너를 통째로 접어야 한다.
     디스코드 임베드 마크업은 embedWrapper > embedFull > embedTitle... 처럼
     "embed"가 들어간 클래스가 중첩되므로 가장 바깥 것만 처리한다. */
  function embedLabelText(em) {
    let host = '';
    const a = em.querySelector('a[href^="http"]');
    try {
      if (a) host = new URL(a.href).hostname.replace(/^www\./, '');
    } catch {}
    if (!host) {
      const p = em.querySelector('[class*="embedProvider" i], [class*="provider" i]');
      if (p) host = p.textContent.trim();
    }
    return host ? '[임베드:' + host + ']' : '[임베드]';
  }

  function scanEmbeds() {
    const sel = SEL.msg + ' ' + SEL.embed + ', ' + SEL.msg + ' iframe';
    const outer = [];
    for (const em of qsa(sel)) {
      // 중첩 임베드의 안쪽 요소는 건너뛰고 가장 바깥만 남긴다
      if (em.parentElement && em.parentElement.closest(SEL.embed)) continue;
      outer.push(em);
    }
    collapsible(outer, {
      name: 'embed',
      // box 를 두지 않는다 — 임베드는 자기 자신이 접기 단위다.
      // collapseBack 도 켜지 않는다: 임베드 안에는 제목 링크가 있어서
      // 원본 클릭을 가로채면 링크를 못 누르게 된다. (스티커·사진은 링크가 없다)
      // 대신 keepLabel 로 펼친 뒤에도 접기 컨트롤을 남긴다.
      // dio-stick(가운데 절대배치)은 쓰지 않는다 — 펼친 임베드 한가운데를 덮으면
      // 그 아래 링크를 못 누른다. 흐름 배치로 두면 접힌 자리/펼친 아래에 붙는다.
      labelClass: 'dio-emolabel',
      labelShow: 'inline-block',
      keepLabel: true,
      collapseText: '[임베드 접기]',
      title: '눌러서 임베드 펼치기',
      text: embedLabelText
    });
  }

  /* ---------- 사진 스캔: 메시지 내 모든 img를 쓸고 아바타·이모지·스티커만 제외.
     숨김 모드에서 "눌러서 사진보기" 버튼으로 대체. ---------- */
  const MEDIA_EXCLUDE = /emoji|avatar|icon|reaction|sticker|placeholder/i;

  function setDisplay(node, show) {
    const v = show ? '' : 'none';
    if (node.style.display !== v) node.style.display = v;
  }

  // 마스크는 CSS 기본값이 display:none이라 ''로는 못 보여낸다 — flex 명시
  function setFlex(node, show) {
    const v = show ? 'flex' : 'none';
    if (node.style.display !== v) node.style.display = v;
  }

  function scanPhotos() {
    const targets = [];
    for (const img of qsa(SEL.msg + ' img')) {
      if (MEDIA_EXCLUDE.test(img.className)) continue;
      if (img.closest('[class*="reactions" i]')) continue;
      if (/stickers\//.test(img.currentSrc || img.src || '')) continue;
      if (img.naturalWidth && img.naturalWidth < 100 && img.naturalHeight < 100) continue;
      const host = img.parentElement;
      if (!host || host === document.body) continue;
      targets.push(img);
    }

    collapsible(targets, {
      name: 'photo',
      // 캐러셀(1/4 등)은 묶음이 접기 단위다 — 대표 하나에만 버튼이 붙는다
      box: (img) => img.closest(SEL.mediaGroup),
      labelClass: 'dio-viewbtn dio-float',
      // .dio-viewbtn 은 CSS 기본이 display:none 이라 '' 로는 못 띄운다.
      // (align-items:center 가 붙어 있는 걸 보면 원래 flex 의도였다)
      // 아바타 마스크와 같은 함정 — 이 값을 빼면 버튼이 0x0 으로 남는다.
      labelShow: 'flex',
      collapseBack: true,
      /* 펼친 사진을 다시 누르면 접히지만, 그걸 알 방법이 없다.
         임베드처럼 접기 컨트롤을 눈에 보이게 남긴다. */
      keepLabel: true,
      collapseText: '사진 접기',
      text: () => '눌러서 사진보기',
      onCreate: (btn, img) => {
        btn.setAttribute('role', 'button');
        btn.tabIndex = 0;
        btn.dataset.src = img.currentSrc || img.src || '';
        ensurePos(img.parentElement);
      },
      // 접힘: 호스트(와 캐러셀 묶음) 높이를 버튼 한 줄로 (펼침/보기: 원본 복원)
      onState: (img, box, show) => {
        const host = img.parentElement;
        collapseHeight(host, show, '32px');
        if (box !== img && box !== host) collapseHeight(box, show, '32px');
      }
    });
  }

  /* ---------- 프로필/장식 스캔 ----------
     실측 클래스: avatar__해시, avatarDecoration__해시, roleIcon__해시,
     badge__해시(클랜 배지), replyAvatar__해시. 숨김 모드에서 아바타는
     이니셜 회색 마스크로, 장식·역할아이콘·배지는 그냥 숨긴다. */
  function avatarInitial(img) {
    let t = '';
    const art = img.closest && img.closest('[role="article"], [id^="chat-messages"]');
    const un = art && art.querySelector('[class*="username" i]');
    if (un) t = ((un.dataset && un.dataset.text) || un.textContent || '').trim();
    if (!t) t = (img.getAttribute('alt') || '').trim();
    if (!t) {
      const host = img.closest && img.closest('button, [role="button"], [aria-label]');
      t = host ? (host.getAttribute('aria-label') || '').trim() : '';
    }
    const ch = [...t][0];
    return ch || '·';
  }

  function scanAvatars() {
    for (const img of qsa('img[class*="avatar" i]')) {
      if (/(decoration|reply)/i.test(img.className)) { setDisplay(img, DIO.visible); continue; }
      let mask = img.nextElementSibling;
      const hasMask = mask && mask.classList.contains('dio-avatar-mask');
      if (!DIO.visible) {
        if (!hasMask) {
          mask = document.createElement('span');
          mask.className = 'dio-avatar-mask';
          const w = img.getBoundingClientRect().width || 40;
          const s = Math.max(20, Math.min(80, Math.round(w)));
          mask.style.width = s + 'px';
          mask.style.height = s + 'px';
          mask.textContent = avatarInitial(img);
          img.after(mask);
        }
        setDisplay(img, false);
        setFlex(mask, true);
      } else {
        if (hasMask) setFlex(mask, false);
        setDisplay(img, true);
      }
    }
    // 아바타 장식·역할 아이콘·클랜 배지는 라벨 없이 토글
    for (const img of qsa(
      'img[class*="avatarDecoration" i], img[class*="roleIcon" i], img[class*="badge" i]'
    )) {
      setDisplay(img, DIO.visible);
    }
    // 길드 아이콘(서버 프로필 사진)도 숨김 모드에서 마스크
    for (const img of qsa(
      'img[src*="/icons/"], img[class*="voiceSectionGuildImage" i], [class*="guilds" i] img[src*="cdn.discordapp.com"]'
    )) {
      if (/avatar|emoji|roleIcon|badge|decoration/i.test(img.className)) continue;
      let mask = img.nextElementSibling;
      const hasMask = mask && mask.classList.contains('dio-avatar-mask');
      if (!DIO.visible) {
        if (!hasMask) {
          mask = document.createElement('span');
          mask.className = 'dio-avatar-mask';
          const w = img.getBoundingClientRect().width || 40;
          const s = Math.max(20, Math.min(48, Math.round(w)));
          mask.style.width = s + 'px';
          mask.style.height = s + 'px';
          mask.textContent = avatarInitial(img);
          ensurePos(img.parentElement);
          img.after(mask);
        }
        setDisplay(img, false);
        setFlex(mask, true);
      } else {
        if (hasMask) setFlex(mask, false);
        setDisplay(img, true);
      }
    }
  }

  /* 배경이미지로 그려지는 프로필/서버 아이콘 (img가 아니라 style에 URL이 박힌 형태) */
  function scanBgAvatars() {
    // 배경을 지우고 나면 style에서 URL이 사라져 선택자에 안 걸린다.
    // 복원할 수 있도록 원본을 넣어둔 [data-dio-bg]도 함께 잡는다.
    for (const el of qsa('[style*="cdn.discordapp.com/avatars/"], [style*="cdn.discordapp.com/icons/"], [style*="/embed/avatars/"], [data-dio-bg]')) {
      if (!DIO.visible) {
        if (el.style.backgroundImage !== 'none') {
          if (el.dataset.dioBg === undefined) el.dataset.dioBg = el.style.backgroundImage || '';
          el.style.backgroundImage = 'none';
        }
      } else if (el.dataset.dioBg !== undefined) {
        el.style.backgroundImage = el.dataset.dioBg;
        delete el.dataset.dioBg;
      }
    }
  }

  /* 길드 배너·스플래시 등 장식 (배경이미지 div + img 둘 다) */
  function scanDecor() {
    for (const el of qsa('[class*="banner" i], [class*="splash" i]')) {
      let bi = bgCache.get(el);
      if (bi === undefined) {
        bi = getComputedStyle(el).backgroundImage || '';
        bgCache.set(el, bi);
      }
      if (bi && bi !== 'none' && bi.includes('discordapp.com')) setDisplay(el, DIO.visible);
    }
    for (const img of qsa(
      'img[class*="splash" i], img[class*="banner" i], [class*="banner" i] img, [class*="splash" i] img'
    )) {
      if (/avatar|emoji|roleIcon|badge|icon/i.test(img.className)) continue;
      setDisplay(img, DIO.visible);
    }
  }

  /* ---------- 텍스트 이모지 스캔 ----------
     상태 pill·채널명 등의 유니코드 이모지는 이미지가 아니라 텍스트다.
   텍스트 노드를 훑어 이모지 그래핀을 span으로 감싸고, 숨김 모드에선 설명으로 바꾼다. */
  const EMOJI_RE = /\p{Extended_Pictographic}/u;
  const segmenter = new Intl.Segmenter('ko', { granularity: 'grapheme' });

  function scanTextEmojis() {
    for (const root of roots || [document.body]) {
      if (root.nodeType === 1 && !root.isConnected) continue;
      walkTextEmojis(root);
    }
    // 기존 스팬 토글
    for (const s of qsa('.dio-emoji-text')) {
      // 크롬 안에 남아 있으면 문구 치환과 계속 부딪힌다
      if (s.closest(CHROME_ROOTS)) { s.replaceWith(s.dataset.orig || ''); continue; }
      const orig = s.dataset.orig || '';
      const want = DIO.visible ? orig : describe(orig);
      if (s.textContent !== want) s.textContent = want;
    }
  }

  /* 이 패스가 가장 비쌌다: 문서의 모든 텍스트 노드를 훑으면서 후보마다
     closest()를 두 번 부른다. 이제 새로 붙은 서브트리에만 돈다. */
  function walkTextEmojis(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => {
        if (!n.textContent || n.textContent.length > 300) return NodeFilter.FILTER_REJECT;
        const p = n.parentElement;
        if (!p) return NodeFilter.FILTER_REJECT;
        if (p.closest('input, textarea, [contenteditable], script, style')) return NodeFilter.FILTER_REJECT;
        if (p.closest('.dio-emoji-text, [id^="dio-"]')) return NodeFilter.FILTER_REJECT;
        // 문구를 통째로 갈아끼우는 자리 — 여기 스팬을 심으면 서로 밀어낸다
        if (p.closest(CHROME_ROOTS)) return NodeFilter.FILTER_REJECT;
        return EMOJI_RE.test(n.textContent) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const n of nodes) {
      const frag = document.createDocumentFragment();
      for (const seg of segmenter.segment(n.textContent)) {
        const ch = seg.segment;
        if (EMOJI_RE.test(ch)) {
          const s = document.createElement('span');
          s.className = 'dio-emoji-text';
          s.dataset.orig = ch;
          s.textContent = DIO.visible ? ch : describe(ch);
          frag.append(s);
        } else {
          frag.append(ch);
        }
      }
      n.replaceWith(frag);
    }
  }

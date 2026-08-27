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
      labelClass: 'dio-emolabel dio-stick',
      labelShow: 'inline',
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

/* discord-in-office 페이지 주입 스크립트
   - 엑셀 크롬(리본/수식바/시트탭) 설치
   - 이모지 가시/비가시 토글 (비가시 시 [한글설명] 텍스트)
   전역 진입점: __DIO_BOOT(cfg), __dioSetEmoji(visible)
 */
(function () {
  'use strict';
  if (window.__DIO) return;

  const DIO = (window.__DIO = { visible: true, booted: false, version: 9 });
  const FILE_NAME = '재고관리_2026.xlsx';

  /* ---------- 유틸 ---------- */
  function el(cls, text) {
    const e = document.createElement('span');
    e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

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

  /* ---------- 이모지 → 텍스트 설명 ---------- */
  const EMO = {
    '😀': '[싱글벌]', '😃': '[활짝]', '😄': '[미소]', '😁': '[씨익]', '😆': '[눈감고웃음]',
    '😅': '[식은땀웃음]', '🤣': '[바닥나는웃음]', '😂': '[눈물웃음]', '🙂': '[살짝미소]',
    '😉': '[윙크]', '😊': '[수줍은미소]', '😍': '[하트눈]', '🥰': '[사랑가득]',
    '😘': '[뽀뽀]', '😗': '[키스]', '☺': '[온화한미소]', '😚': '[눈감은키스]',
    '😋': '[맛있음]', '😛': '[혀내밀기]', '🤪': '[엉큼]', '🤨': '[의심]',
    '🧐': '[단정한의심]', '😎': '[선글라스]', '🤩': '[별눈]', '🥳': '[축하얼굴]',
    '😏': '[우쭐]', '😒': '[시큰둥]', '😞': '[실망]', '😔': '[멍]', '😟': '[걱정]',
    '🙁': '[살짝슬픔]', '☹': '[찡그림]', '😣': '[악참음]', '😖': '[괴로움]',
    '😫': '[지침]', '😩': '[한숨]', '🥺': '[애원]', '😢': '[눈물]', '😭': '[오열]',
    '😤': '[분노코풀기]', '😠': '[화남]', '😡': '[격노]', '🤬': '[욕설]',
    '🤯': '[머리폭발]', '😳': '[홍조]', '🥵': '[더위]', '🥶': '[추위]',
    '😱': '[비명]', '😨': '[놀람공포]', '😰': '[식은땀]', '🤗': '[포옹]',
    '🤔': '[생각]', '🤭': '[입가림웃음]', '🤫': '[쉿]', '🤐': '[입닫음]',
    '😶': '[침묵]', '😐': '[무표정]', '😑': '[감은눈무표정]', '😬': '[어색한미소]',
    '🙄': '[동공지진]', '😮': '[깜짝]', '😲': '[허둥]', '🥱': '[하품]',
    '😴': '[자는중]', '🤤': '[침흘림]', '😵': '[기절]', '🤢': '[메스꺼움]',
    '🤮': '[구토]', '🤧': '[재채기]', '😷': '[마스크]', '🤒': '[열나는환자]',
    '🤕': '[붕대]', '🤑': '[돈얼굴]', '🤠': '[카우보이]', '🤓': '[안경벌레]',
    '😈': '[도깨비]', '👻': '[유령]', '💀': '[해골]', '🤡': '[삐에로]',
    '👽': '[외계인]', '🤖': '[로봇]', '💩': '[똥]',
    '👍': '[엄지업]', '👎': '[엄지다운]', '👊': '[주먹]', '✊': '[주먹들기]',
    '✌': '[브이]', '🤞': '[행운빌기]', '🤟': '[러브유]', '🤙': '[부름손]',
    '👌': '[오케이]', '👏': '[박수]', '🙌': '[만세]', '👋': '[손흔들기]',
    '🤝': '[악수]', '🙏': '[기도]', '💪': '[근육]', '🖖': '[벌컨경례]',
    '✋': '[손듦]',
    '❤': '[빨간하트]', '🧡': '[주황하트]', '💛': '[노란하트]', '💚': '[초록하트]',
    '💙': '[파랑하트]', '💜': '[보라하트]', '🖤': '[검정하트]', '🤍': '[흰하트]',
    '💔': '[깨진하트]', '💕': '[두개하트]', '💖': '[반짝하트]', '💘': '[화살하트]',
    '💯': '[점수100]', '🔥': '[불]', '⭐': '[별]', '🌟': '[빛나는별]',
    '✨': '[반짝임]', '⚡': '[번개]', '💥': '[폭발]', '🎉': '[폭죽]',
    '🎊': '[꽃가루]', '🍻': '[건배]', '🍺': '[맥주]', '🍷': '[와인]',
    '☕': '[커피]', '🍰': '[케이크]', '🍕': '[피자]', '🎁': '[선물]',
    '🚀': '[로켓]', '🏃': '[달리기]', '💤': '[잠자는Z]', '🎵': '[음표]',
    '🎶': '[악보]', '✅': '[체크]', '❌': '[엑스]', '❗': '[느낌표]',
    '❓': '[물음표]', '💡': '[전구]', '📌': '[핀]', '🔔': '[종]',
    '👀': '[두눈]', '🗑': '[휴지통]', '⏰': '[알람]', '🌙': '[달]',
    '☀': '[해]', '🌈': '[무지개]'
  };

  function describe(raw) {
    let k = (raw || '').replace(/\uFE0F/g, '').trim();
    if (!k) return '[이모지]';
    if (k.startsWith(':') && k.endsWith(':') && k.length > 2) {
      return '[' + k.slice(1, -1) + ']'; // 커스텀 이모지 :name:
    }
    if (EMO[k]) return EMO[k];
    const stripped = k.replace(/[\u{1F3FB}-\u{1F3FF}]/gu, ''); // 피부톤 제거
    if (EMO[stripped]) return EMO[stripped];
    return '[' + raw.trim() + ']'; // 모르는 조합은 원문 괄호
  }

  /* ---------- 라이트 토큰 강제 주입 ----------
     실측: 디스코드 CSS는 같은 오리진 assets 520개(약 4.2MB)이고 테마 토큰은
     .theme-darker / .theme-light 블록으로 정의된다. 선언 순서 때문에 darker가
     이기므로, theme-light 블록의 토큰을 전수 추출해 !important로 재정의한다. */
  let lastLinkCount = -1;

  async function forceLightTokens() {
    const links = [...document.querySelectorAll('link[rel="stylesheet"]')].map((l) => l.href);
    if (!links.length || (links.length === lastLinkCount && DIO.lightCssApplied)) return;
    lastLinkCount = links.length;
    DIO.lightFetchStart = Date.now();
    try {
      let css = '';
      let ok = 0;
      for (const href of links) {
        try {
          css += '\n' + await (await fetch(href, { cache: 'force-cache' })).text();
          ok++;
        } catch {}
      }
      DIO.lightFetchLen = css.length;
      DIO.lightFetchOk = ok;
      const map = new Map();
      const re = /[^{}]*theme-light[^{}]*\{([^{}]*)\}/g;
      let m;
      while ((m = re.exec(css))) {
        for (const decl of m[1].split(';')) {
          const i = decl.indexOf(':');
          if (i < 0) continue;
          const name = decl.slice(0, i).trim();
          if (!name.startsWith('--')) continue;
          const val = decl.slice(i + 1).trim();
          if (val) map.set(name, val);
        }
      }
      DIO.lightMapSize = map.size;
      if (!map.size) return;
      const scope =
        ':root,.theme-light,.theme-dark,.theme-darker,.theme-midnight,.theme-darkest,.theme-ash';
      let out = scope + '{';
      for (const [k, v] of map) out += k + ':' + v + ' !important;';
      out += '}';
      let st = document.getElementById('dio-light-tokens');
      if (!st) {
        st = document.createElement('style');
        st.id = 'dio-light-tokens';
        document.head.appendChild(st);
      }
      st.textContent = out;
      DIO.lightCssApplied = true;
      DIO.lightTokenCount = map.size;
    } catch (e) {
      DIO.lastErr = 'forceLightTokens: ' + e.message;
    }
  }

  /* ---------- 강제 라이트 테마 ----------
     디스코드 테마 클래스는 light 외에 dark·darker(Onyx) 등 여러 다크 계열이 있고
     실측상 루트는 theme-darker였다. 다크 계열을 모두 theme-light로 스왑한다. */
  const DARK_THEME = /^theme-(dark|darker|darkest|midnight|ash)/;

  function enforceLightTheme() {
    const els = [document.documentElement, document.body, ...document.querySelectorAll('[class*="theme-"]')];
    for (const el of els) {
      if (!el || !el.classList) continue;
      for (const c of [...el.classList]) {
        if (DARK_THEME.test(c)) {
          el.classList.remove(c);
          el.classList.add('theme-light');
        }
      }
    }
    document.documentElement.style.colorScheme = 'light';
  }

  /* ---------- 공용: 라벨/버튼 치환 ---------- */
  function ensureLabel(target) {
    let lab = target.nextElementSibling;
    if (!lab || !lab.classList.contains('dio-emolabel')) {
      lab = document.createElement('span');
      lab.className = 'dio-emolabel';
      target.after(lab);
    }
    return lab;
  }

  function setHidden(target, label, desc) {
    if (label && label.textContent !== desc) label.textContent = desc;
    const labShow = DIO.visible ? 'none' : 'inline';
    if (label && label.style.display !== labShow) label.style.display = labShow;
    const tShow = DIO.visible ? '' : 'none';
    if (target.style.display !== tShow) target.style.display = tShow;
  }

  /* ---------- 이모지 스캔 ---------- */
  function scanEmojis() {
    for (const img of document.querySelectorAll('img[class*="emoji"]')) {
      setHidden(img, ensureLabel(img), describe(img.alt));
    }
    // 이름 옆 배경이미지 이모지(img가 아닌 형태) — 인라인 style의 emoji URL로 식별
    for (const el of document.querySelectorAll('[style*="/emojis/"], [style*="emoji-sprite"]')) {
      setDisplay(el, DIO.visible);
    }
  }

  /* ---------- 스티커 스캔 ----------
     실측: <img class="...stickerAsset__해시" src="https://media.discordapp.net/stickers/...">
     이며, 디스코드가 [class*="stickerName"] 요소로 스티커 이름을 내장 렌더한다. */
  function stickerName(st) {
    const cont = st.closest && st.closest('[class*="stickerContainer"], [class*="stickerWrapper"]');
    const nameEl = cont && cont.querySelector('[class*="stickerName"]');
    if (nameEl && nameEl.textContent.trim()) return nameEl.textContent.trim();
    const raw = (st.getAttribute('alt') || st.getAttribute('aria-label') || '').trim();
    return raw.replace(/^(스티커|sticker)\s*[:：]?\s*/i, '');
  }

  function scanStickers() {
    const nodes = document.querySelectorAll(
      'img[class*="sticker"], canvas[class*="sticker"], img[src*="/stickers/"], video[src*="/stickers/"]'
    );
    for (const st of nodes) {
      const cont = st.closest && st.closest('[class*="stickerContainer"], [class*="stickerWrapper"]');
      if (cont && getComputedStyle(cont).position === 'static') cont.style.position = 'relative';

      const expanded = !!(cont && cont.dataset.dioExpanded === '1');
      const showAsset = DIO.visible || expanded;

      // 라벨 = 접기/펼치기 토글 버튼
      const lab = ensureLabel(st);
      lab.classList.add('dio-stick');
      if (!lab.dataset.dioToggle) {
        lab.dataset.dioToggle = '1';
        lab.title = '눌러서 스티커 펼치기';
        lab.addEventListener('click', (e) => {
          e.stopPropagation();
          e.preventDefault();
          const c = e.target.closest('[class*="stickerContainer"], [class*="stickerWrapper"]');
          if (!c) return;
          if (c.dataset.dioExpanded === '1') delete c.dataset.dioExpanded;
          else c.dataset.dioExpanded = '1';
          scan();
        });
      }
      // 펼친 상태에서 스티커 클릭 → 다시 접기
      if (!st.dataset.dioToggle) {
        st.dataset.dioToggle = '1';
        st.addEventListener('click', (e) => {
          if (DIO.visible) return;
          const c = e.target.closest('[class*="stickerContainer"], [class*="stickerWrapper"]');
          if (c && c.dataset.dioExpanded === '1') {
            delete c.dataset.dioExpanded;
            e.stopPropagation();
            scan();
          }
        });
      }

      const name = stickerName(st);
      setHidden(st, lab, name ? '[스티커:' + name + ']' : '[스티커]');

      // 컨테이너 크기: 숨김+접힘 → 라벨 한 줄로 축소, 펼침/보기 모드 → 원본 복원
      if (cont) {
        if (!showAsset) {
          if (cont.dataset.dioW === undefined) {
            cont.dataset.dioW = cont.style.width || '';
            cont.dataset.dioH = cont.style.height || '';
          }
          if (cont.style.width !== 'auto') cont.style.width = 'auto';
          if (cont.style.height !== '22px') cont.style.height = '22px';
          const nameEl = cont.querySelector('[class*="stickerName"]');
          if (nameEl && nameEl.style.display !== 'none') nameEl.style.display = 'none';
          lab.classList.add('dio-static');
        } else {
          if (cont.dataset.dioW !== undefined) {
            cont.style.width = cont.dataset.dioW;
            cont.style.height = cont.dataset.dioH;
            delete cont.dataset.dioW;
            delete cont.dataset.dioH;
          }
          const nameEl = cont.querySelector('[class*="stickerName"]');
          if (nameEl && nameEl.style.display === 'none') nameEl.style.display = '';
          lab.classList.remove('dio-static');
          if (DIO.visible && cont.dataset.dioExpanded) delete cont.dataset.dioExpanded;
        }
      }

      // 접힘: 라벨 노출 / 펼침: 원본 노출 + 라벨 숨김
      if (!DIO.visible && !expanded) {
        if (st.style.display !== 'none') st.style.display = 'none';
        if (lab.style.display !== 'inline-block') lab.style.display = 'inline-block';
      } else if (!DIO.visible && expanded) {
        if (st.style.display !== '') st.style.display = '';
        if (lab.style.display !== 'none') lab.style.display = 'none';
      }
    }
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
    const seenGroups = new Set();
    for (const img of document.querySelectorAll('li[id^="chat-messages"] img')) {
      if (MEDIA_EXCLUDE.test(img.className)) continue;
      if (img.closest('[class*="reactions"]')) continue;
      if (/stickers\//.test(img.currentSrc || img.src || '')) continue;
      if (img.naturalWidth && img.naturalWidth < 100 && img.naturalHeight < 100) continue;

      // 캐러셀(1/4 등)은 묶음 단위로 토글
      const group = img.closest('[class*="carousel"], [class*="mediaList"]');
      if (group) {
        if (seenGroups.has(group)) {
          setDisplay(img, DIO.visible || group.dataset.dioExpanded === '1');
          continue;
        }
        seenGroups.add(group);
      }

      const host = img.parentElement;
      if (!host || host === document.body) continue;
      const flagHost = group || img;
      const expanded = flagHost.dataset.dioExpanded === '1';
      const showMedia = DIO.visible || expanded;

      let btn = img.nextElementSibling;
      if (!btn || !btn.classList.contains('dio-viewbtn')) {
        btn = document.createElement('span');
        btn.className = 'dio-viewbtn dio-float';
        btn.setAttribute('role', 'button');
        btn.tabIndex = 0;
        btn.textContent = '눌러서 사진보기';
        btn.dataset.src = img.currentSrc || img.src || '';
        if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
        img.after(btn);
      }
      // 버튼 클릭 → 자리에서 펼치기 (라이트박스 대신 인라인 토글)
      if (!btn.dataset.dioToggle) {
        btn.dataset.dioToggle = '1';
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          e.preventDefault();
          if (DIO.visible) return;
          const im = btn.previousElementSibling;
          const fh = (im && im.closest('[class*="carousel"], [class*="mediaList"]')) || im;
          if (!fh) return;
          if (fh.dataset.dioExpanded === '1') delete fh.dataset.dioExpanded;
          else fh.dataset.dioExpanded = '1';
          scan();
        });
      }
      // 펼친 사진 클릭 → 다시 접기
      if (!img.dataset.dioToggle) {
        img.dataset.dioToggle = '1';
        img.addEventListener('click', (e) => {
          if (DIO.visible) return;
          const fh = img.closest('[class*="carousel"], [class*="mediaList"]') || img;
          if (fh.dataset.dioExpanded === '1') {
            delete fh.dataset.dioExpanded;
            e.stopPropagation();
            scan();
          }
        });
      }

      setDisplay(img, showMedia);
      setDisplay(btn, !showMedia);
      // 접힘: 호스트 높이를 버튼 한 줄로 접기 (펼침/보기: 원본 복원)
      const collapseH = (el) => {
        if (!el) return;
        if (!showMedia) {
          if (el.dataset.dioH === undefined) el.dataset.dioH = el.style.height || '';
          if (el.style.height !== '32px') el.style.height = '32px';
        } else if (el.dataset.dioH !== undefined) {
          el.style.height = el.dataset.dioH;
          delete el.dataset.dioH;
        }
      };
      collapseH(host);
      if (group && group !== host) collapseH(group);
      if (DIO.visible && flagHost.dataset.dioExpanded) delete flagHost.dataset.dioExpanded;
    }
  }

  /* ---------- 프로필/장식 스캔 ----------
     실측 클래스: avatar__해시, avatarDecoration__해시, roleIcon__해시,
     badge__해시(클랜 배지), replyAvatar__해시. 숨김 모드에서 아바타는
     이니셜 회색 마스크로, 장식·역할아이콘·배지는 그냥 숨긴다. */
  function avatarInitial(img) {
    let t = '';
    const art = img.closest && img.closest('[role="article"], [id^="chat-messages"]');
    const un = art && art.querySelector('[class*="username"]');
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
    for (const img of document.querySelectorAll('img[class*="avatar"]')) {
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
    for (const img of document.querySelectorAll(
      'img[class*="avatarDecoration"], img[class*="roleIcon"], img[class*="badge"]'
    )) {
      setDisplay(img, DIO.visible);
    }
    // 길드 아이콘(서버 프로필 사진)도 숨김 모드에서 마스크
    for (const img of document.querySelectorAll(
      'img[src*="/icons/"], img[class*="voiceSectionGuildImage"], [class*="guilds"] img[src*="cdn.discordapp.com"]'
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
          if (getComputedStyle(img.parentElement).position === 'static') {
            img.parentElement.style.position = 'relative';
          }
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

  /* 길드 배너·스플래시 등 장식 (배경이미지 div + img 둘 다) */
  function scanDecor() {
    for (const el of document.querySelectorAll('[class*="banner"], [class*="splash"]')) {
      const bi = getComputedStyle(el).backgroundImage;
      if (bi && bi !== 'none' && bi.includes('discordapp.com')) setDisplay(el, DIO.visible);
    }
    for (const img of document.querySelectorAll(
      'img[class*="splash"], img[class*="banner"], [class*="banner"] img, [class*="splash"] img'
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
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
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
    // 기존 스팬 토글
    for (const s of document.querySelectorAll('.dio-emoji-text')) {
      const orig = s.dataset.orig || '';
      const want = DIO.visible ? orig : describe(orig);
      if (s.textContent !== want) s.textContent = want;
    }
  }

  function scan() {
    enforceLightTheme();
    void forceLightTokens();
    for (const pass of [scanEmojis, scanStickers, scanPhotos, scanAvatars, scanDecor, scanTextEmojis]) {
      try {
        pass();
      } catch (e) {
        DIO.lastErr = pass.name + ': ' + e.message;
      }
    }
  }

  let raf = 0;
  const mo = new MutationObserver(() => {
    if (!raf) raf = requestAnimationFrame(() => { raf = 0; scan(); });
  });

  window.__dioSetEmoji = function (visible) {
    DIO.visible = !!visible;
    document.body.classList.toggle('dio-hide', !DIO.visible);
    scan();
  };

  DIO.scan = scan; // 디버그용

  window.__DIO_BOOT = function (cfg) {
    DIO.visible = !(cfg && cfg.emojiVisible === false);
    document.body.classList.toggle('dio-hide', !DIO.visible);
    buildChrome();
    scan();
    if (!DIO.booted) {
      DIO.booted = true;
      mo.observe(document.body, { childList: true, subtree: true });
      setInterval(scan, 4000); // 관측 누락 대비 백업
    }
  };
})();

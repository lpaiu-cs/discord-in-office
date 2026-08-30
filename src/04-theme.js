/* [번들 조각 4/7] 강제 라이트 테마 — 토큰 전수 추출과 테마 클래스 스왑
   src/*.js 는 파일명 순서대로 이어붙여져 하나의 IIFE 로 주입된다 (bundle.js).
   조각 하나만 보면 괄호가 맞지 않으므로 node --check 가 통하지 않는다.
   문법 검사는 이어붙인 번들 전체에 대해 하고, npm test 가 그걸 확인한다.
   앞의 번호가 곧 순서다 — 바꾸면 깨진다. */
  /* ---------- 라이트 토큰 강제 주입 ----------
     실측: 디스코드 CSS는 같은 오리진 assets 520개(약 4.2MB)이고 테마 토큰은
     .theme-darker / .theme-light 블록으로 정의된다. 선언 순서 때문에 darker가
     이기므로, theme-light 블록의 토큰을 전수 추출해 !important로 재정의한다. */
  /* 한 번 성공하면 다시 돌지 않는다. 예전 구현은 링크 "개수"만 비교했는데,
     로그인 중 디스코드가 CSS 청크를 점진 로드하면 개수가 계속 바뀌어서
     시트 520개(약 4.2MB)를 직렬로 재요청하고 정규식으로 다시 훑었다.
     로그인 구간 렉의 주범이었다. */
  let lightBusy = false;
  const cssCache = new Map();

  /* 동시 요청 수. 실측에서 시트 303장을 한꺼번에 던졌더니 토큰이 다 적용되기까지
     20.6초가 걸렸고, 그 사이 디스코드 자신의 리소스 로딩과 경쟁해서 로딩 화면이
     중간에 멈춰 보였다. 몇 개씩 나눠 받으면 총 시간은 비슷해도 남의 요청을
     굶기지 않는다. */
  const FETCH_AT_ONCE = 6;

  /* 라이트 테마 토큰을 그대로 쓰면 답장·멘션 강조가 주황빛으로 남는다.
     엑셀 워크시트에 그런 색이 있을 리 없다. 추출한 값 위에 덮어쓰면
     excel.css 와의 우선순위 다툼 없이 확실히 눌린다. */
  const TOKEN_OVERRIDE = {
    '--background-mentioned': 'transparent',
    '--background-mentioned-hover': 'transparent',
    '--background-message-highlight': 'transparent',
    '--background-message-highlight-hover': 'transparent'
  };

  const LIGHT_SCOPE =
    ':root,.theme-light,.theme-dark,.theme-darker,.theme-midnight,.theme-darkest,.theme-ash';

  function buildLightCss(map) {
    let out = LIGHT_SCOPE + '{';
    for (const [k, v] of map) out += k + ':' + v + ' !important;';
    return out + '}';
  }

  function applyLightCss(css) {
    let st = document.getElementById('dio-light-tokens');
    if (!st) {
      st = document.createElement('style');
      st.id = 'dio-light-tokens';
      document.head.appendChild(st);
    }
    if (st.textContent !== css) st.textContent = css;
    DIO.lightCssApplied = true;
  }

  /* 지난 실행에서 뽑아둔 토큰은 메인 프로세스가 이미 insertCSS 로 넣었다.
     여기서는 "이미 적용됐다" 는 사실만 기록해 수집을 건너뛴다 —
     시작이 20초 걸리던 원인이 그 수집이었다. */
  function markLightCached(fp) {
    DIO.lightCssApplied = true;
    DIO.lightFromCache = true;
    DIO.lightFp = fp || ''; // 지문이 없으면(옛 형식) 한 번은 다시 모은다
  }

  /* 디스코드 자산 URL 에는 내용 해시가 들어 있다. 그래서 시트 "목록" 만 비교해도
     CSS 가 갈아끼워졌는지 알 수 있다 — 받아볼 필요가 없다.
     암호학적 강도는 필요 없으니 짧은 문자열 해시로 충분하다. */
  function currentSheets() {
    return [...document.querySelectorAll('link[rel="stylesheet"]')].map((l) => l.href);
  }

  function fingerprintOf(hrefs) {
    const list = [...hrefs].sort().join('|');
    let h = 5381;
    for (let i = 0; i < list.length; i++) h = ((h * 33) ^ list.charCodeAt(i)) >>> 0;
    return list.length + '-' + h.toString(36);
  }

  function sheetFingerprint() {
    return fingerprintOf(currentSheets());
  }

  async function fetchSheets(links) {
    let next = 0;
    const worker = async () => {
      while (next < links.length) {
        const href = links[next++];
        if (cssCache.has(href)) continue;
        try {
          const res = await fetch(href, { cache: 'force-cache' });
          /* fetch 는 404·5xx 에도 reject 하지 않는다. 오류 본문이 비어 있지
             않으면 그대로 CSS 로 세어져서, 토큰이 빠진 채로 "온전한 수집" 이
             되고 그 지문이 저장된다. 나중에 CDN 이 정상으로 돌아와도 지문이
             같으니 재수집을 계속 건너뛴다 — 빠진 토큰이 영영 남는다. */
          cssCache.set(href, res.ok ? await res.text() : '');
        } catch {
          cssCache.set(href, '');
        }
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(FETCH_AT_ONCE, links.length) }, worker)
    );
  }

  async function forceLightTokens() {
    if (DIO.lightCssApplied || lightBusy) return;
    /* 부팅 직후에는 돌리지 않는다. 우리 주입은 디스코드가 아직 자기 화면을
       그리는 중에 들어가는데, 거기서 2.8MB 를 더 받아 가면 로딩이 멈춰 보인다.
       엑셀 배경·글자색은 excel.css 가 이미 고정하므로 몇 초 늦어도 티가 안 난다. */
    if (!DIO.lightAllowed) return;
    const links = [...document.querySelectorAll('link[rel="stylesheet"]')].map((l) => l.href);
    if (!links.length) return;
    lightBusy = true;
    DIO.lightFetchStart = Date.now();
    try {
      await fetchSheets(links);
      let css = '';
      let ok = 0;
      for (const href of links) {
        const t = cssCache.get(href);
        if (t) { css += '\n' + t; ok++; }
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
      for (const [k, v] of Object.entries(TOKEN_OVERRIDE)) map.set(k, v);
      const out = buildLightCss(map);
      applyLightCss(out);
      DIO.lightTokenCount = map.size;
      cssCache.clear(); // 래치 후엔 다시 안 쓴다 — 2.8MB를 붙잡고 있을 이유가 없다
      /* 다음 실행은 이걸 그대로 쓰면 된다 — 20초짜리 수집을 되풀이하지 않는다.
         완성된 CSS 가 아니라 토큰 맵을 넘긴다. 이 페이지는 원격 콘텐츠라,
         CSS 를 그대로 저장하게 두면 한 번의 오염이 다음 실행까지 살아남는다. */
      /* 지문은 "이 토큰을 실제로 만들어낸 시트 목록" 에만 붙인다.
           - 받다가 실패한 시트가 있으면 결과가 불완전하다
           - 수집 중 디스코드가 청크를 더 붙였으면 지금 목록과 다르다
         둘 중 하나라도 어긋나면 지문을 비워 다음 실행이 다시 확인하게 한다.
         안 그러면 불완전한 캐시를 정상으로 믿고 영영 재수집을 건너뛴다. */
      const used = fingerprintOf(links);
      const complete = ok === links.length && used === fingerprintOf(currentSheets());
      DIO.lightFp = complete ? used : '';
      DIO.lightComplete = complete;
      if (window.dioBridge && window.dioBridge.saveLightTokens) {
        window.dioBridge.saveLightTokens({ fp: DIO.lightFp, tokens: Object.fromEntries(map) });
      }
    } catch (e) {
      DIO.lastErr = 'forceLightTokens: ' + e.message;
    } finally {
      lightBusy = false;
    }
  }

  /* ---------- 강제 라이트 테마 ----------
     디스코드 테마 클래스는 light 외에 dark·darker(Onyx) 등 여러 다크 계열이 있고
     실측상 루트는 theme-darker였다. 다크 계열을 모두 theme-light로 스왑한다. */
  const DARK_THEME = /^theme-(dark|darker|darkest|midnight|ash)/;

  function enforceLightTheme() {
    // 루트 둘은 매 스캔 확인한다 — 디스코드가 여기에 테마 클래스를 다시 붙인다.
    // 반면 문서 전역 [class*="theme-"] 훑기는 인덱스를 못 타는 전수 순회라
    // 증분 스캔(최대 20회/초)에서 빼고 전체 스캔에서만 돈다.
    const els = [document.documentElement, document.body];
    if (!roots) els.push(...document.querySelectorAll('[class*="theme-"]'));
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

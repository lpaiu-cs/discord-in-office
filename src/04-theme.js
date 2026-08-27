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

  async function forceLightTokens() {
    if (DIO.lightCssApplied || lightBusy) return;
    const links = [...document.querySelectorAll('link[rel="stylesheet"]')].map((l) => l.href);
    if (!links.length) return;
    lightBusy = true;
    DIO.lightFetchStart = Date.now();
    try {
      // 직렬 await → 병렬. 이미 받은 시트는 캐시에서 재사용한다.
      await Promise.all(
        links.map(async (href) => {
          if (cssCache.has(href)) return;
          try {
            cssCache.set(href, await (await fetch(href, { cache: 'force-cache' })).text());
          } catch {
            cssCache.set(href, '');
          }
        })
      );
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
      cssCache.clear(); // 래치 후엔 다시 안 쓴다 — 4MB를 붙잡고 있을 이유가 없다
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

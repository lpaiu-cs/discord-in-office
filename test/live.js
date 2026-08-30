/* 실제 discord.com 스모크 테스트
   실행: npm run test:live

   오프라인 스위트(npm test)는 픽스처만 쓰므로 "디스코드가 실제로 내려주는
   페이지에서 주입이 도는가"는 확인하지 못한다. 이 테스트가 그 부분을 본다.
   로그인은 하지 않으므로 /login 페이지까지만 검증한다 — 로그인된 UI 는
   사람이 직접 확인해야 한다. 네트워크가 필요하다. */
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const bundle = require('../bundle');

const REPO = path.join(__dirname, '..');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

let failures = 0;

function check(name, actual, expected) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    console.log('  ok   ' + name);
  } else {
    failures++;
    console.log('  FAIL ' + name);
    console.log('        기대: ' + JSON.stringify(expected));
    console.log('        실제: ' + JSON.stringify(actual));
  }
}

app.whenReady().then(async () => {
  const done = (c) => {
    try { app.exit(c); } catch { process.exit(c); }
  };
  const guard = setTimeout(() => {
    console.log('\n시간 초과 — 네트워크를 확인할 것');
    done(2);
  }, 90000);

  try {
    const w = new BrowserWindow({
      width: 1280,
      height: 800,
      show: true,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        backgroundThrottling: false
      }
    });
    const wc = w.webContents;
    const js = (code) => wc.executeJavaScript(code);

    console.log('\n[실페이지] discord.com 주입');
    await wc.loadURL('https://discord.com/app');
    await wait(6000);
    await wc.insertCSS(fs.readFileSync(path.join(REPO, 'excel.css'), 'utf8'));
    await js(bundle() + ';__DIO_BOOT({ emojiVisible: false, panelsVisible: true });');

    /* 부팅 직후에는 토큰 수집이 아직 열려 있지 않아야 한다.
       여기서 바로 시트 수백 장을 받아 가면 디스코드 자신의 로딩과 경쟁해서
       로딩 화면이 중간에 멈춰 보인다(콜드 캐시 실측 20.6초).
       6초를 기다린 뒤에 보면 이미 열려 있으므로, 반드시 이 자리에서 본다. */
    check('부팅 직후에는 수집을 열지 않음', await js('!!__DIO.lightAllowed'), false);

    await wait(6000);

    check('부팅됨', await js('!!__DIO.booted'), true);
    check('스캔 에러 없음', await js('__DIO.lastErr || null'), null);
    check('리본 생성', await js('!!document.getElementById("dio-ribbon")'), true);
    check('시트바 생성', await js('!!document.getElementById("dio-sheetbar")'), true);

    /* 토큰 수집은 일부러 미룬다. 부팅 직후에 시트 수백 장(2.8MB)을 더 받아 가면
       디스코드 자신의 로딩과 경쟁해서 로딩 화면이 중간에 멈춰 보인다.
       그래서 "부팅 직후에는 아직 아니어야 하고, 조금 뒤에는 되어야 한다" 를 본다. */
    const t0 = Date.now();
    for (let i = 0; i < 120; i++) {
      if (await js('!!__DIO.lightCssApplied')) break;
      await wait(1000);
    }
    const took = Math.round((Date.now() - t0) / 1000);

    // 라이트 테마 강제는 디스코드 CSS 원문을 실제로 받아와야 성립한다.
    // 픽스처로는 절대 확인할 수 없는 부분이라 여기서만 검증된다.
    check('라이트 토큰 적용', await js('!!__DIO.lightCssApplied'), true);
    const tokens = await js('__DIO.lightTokenCount || 0');
    console.log(
      '       추출 토큰 ' + tokens + '개 / 수집까지 ' + took + '초 / 스캔 ' +
      (await js('__DIO.scans')) + '회'
    );
    check('토큰이 충분히 추출됨', tokens > 100, true);
  /* 수집한 시점의 스타일시트 목록 지문. 다음 실행은 이걸 현재 목록과 비교해서
     디스코드가 CSS 를 갈아끼웠을 때만 다시 모은다 — 매번 모으면 시트 수백 장을
     또 받아 오게 되고, 그게 실행할 때마다 렉이 걸리던 원인이었다. */
  check(
    '시트 지문이 기록됨',
    await js('/^[0-9]+-[a-z0-9]+$/.test(__DIO.lightFp || "")'),
    true
  );
    // 답장·멘션 강조는 워크시트에 있을 색이 아니다 — 추출값 위에 덮어쓴다
    check(
      '멘션 강조색이 눌림',
      await js('getComputedStyle(document.documentElement).getPropertyValue("--background-mentioned").trim()'),
      'transparent'
    );

    console.log('\n[실페이지] 토글 왕복');
    await js('window.__dioSetEmoji(true)');
    await wait(1200);
    check('보이기 전환 무에러', await js('__DIO.lastErr || null'), null);
    await js('window.__dioSetEmoji(false)');
    await wait(1200);
    check('숨김 복귀 무에러', await js('__DIO.lastErr || null'), null);
    await js('window.__dioSetPanels(false)');
    await wait(600);
    check('패널 접기 반영', await js('document.body.classList.contains("dio-nopanel")'), true);

    clearTimeout(guard);
    console.log('\n실패 ' + failures + ' — ' + (failures ? 'FAIL' : 'PASS'));
    done(failures ? 1 : 0);
  } catch (e) {
    clearTimeout(guard);
    console.log('\n러너 예외: ' + (e && e.stack ? e.stack : e));
    done(1);
  }
});

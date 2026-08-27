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
    await wait(6000);

    check('부팅됨', await js('!!__DIO.booted'), true);
    check('스캔 에러 없음', await js('__DIO.lastErr || null'), null);
    check('리본 생성', await js('!!document.getElementById("dio-ribbon")'), true);
    check('시트바 생성', await js('!!document.getElementById("dio-sheetbar")'), true);

    // 라이트 테마 강제는 디스코드 CSS 원문을 실제로 받아와야 성립한다.
    // 픽스처로는 절대 확인할 수 없는 부분이라 여기서만 검증된다.
    check('라이트 토큰 적용', await js('!!__DIO.lightCssApplied'), true);
    const tokens = await js('__DIO.lightTokenCount || 0');
    console.log('       추출 토큰 ' + tokens + '개 / 스캔 ' + (await js('__DIO.scans')) + '회');
    check('토큰이 충분히 추출됨', tokens > 100, true);

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

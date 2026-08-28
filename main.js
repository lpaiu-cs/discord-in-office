const { app, BrowserWindow, Menu, ipcMain, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const bundle = require('./bundle');

const APP_URL = 'https://discord.com/app';
const APP_ORIGIN = 'https://discord.com';
const SPOOF_TITLE = '재고관리_2026.xlsx - Excel';

let win = null;
let injected = false;

// 기본은 가린 상태다. 위장이 목적인 도구라 안 가려진 채로 뜨면 앞뒤가 안 맞는다.
// 잠깐 원본을 보려면 Ctrl+E, 항상 보이게 두려면 npm run start:visible.
//
// saved 는 디스크에 있는 값, cfg 는 이번 실행에 실제로 쓰는 값이다. 둘을 하나로
// 합쳐 두면 --dio-visible 로 띄운 뒤 패널만 토글해도 saveCfg 가 cfg 전체를 쓰면서
// emojiVisible: true 까지 저장돼, 다음 npm start 가 안 가려진 채 뜬다.
// 일회성 플래그가 안전한 기본값을 밀어내면 안 된다.
/* panelsVisible 은 일부러 저장하지 않는다. 접어둔 채로 껐다가 다시 켜면 지금
   어느 채널인지 알 수 없는 화면으로 시작해서 혼란스럽다. 매번 펼친 채로
   시작하고, 접는 건 그 세션 동안만 유지한다. */
const saved = { emojiVisible: false };
const cfg = { emojiVisible: false, panelsVisible: true };
const configPath = () => path.join(app.getPath('userData'), 'config.json');

/* 라이트 테마 토큰 캐시.
   실측: 로그인 화면에서만 시트 303장(2.8MB)이고, 전부 받아 토큰을 뽑는 데
   20.6초가 걸렸다. 그 사이 디스코드 자신의 리소스 로딩과 경쟁해서 로딩 화면이
   중간에 멈춰 보였다. 한 번 뽑아두면 다음 실행부터는 그대로 쓰면 된다.

   저장은 **토큰 맵(JSON)** 으로 한다. 완성된 CSS 를 렌더러에서 받아 그대로
   쓰면, discord.com 이 한 번이라도 오염됐을 때 임의 CSS 가 파일로 남아
   공격이 사라진 뒤에도 매 실행 적용된다. 이름·값 모양을 확인하고 CSS 는
   여기서 조립한다. 읽을 때도 다시 확인한다 — 파일이 손대졌을 수 있다. */
const lightTokensPath = () => path.join(app.getPath('userData'), 'light-tokens.json');

const TOKEN_NAME = /^--[a-z0-9-]{1,80}$/i;
const TOKEN_VALUE = /^[^{}<>;@\\]{1,200}$/;
const LIGHT_SCOPE =
  ':root,.theme-light,.theme-dark,.theme-darker,.theme-midnight,.theme-darkest,.theme-ash';

function sanitizeTokens(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out = {};
  let n = 0;
  for (const [k, v] of Object.entries(raw)) {
    if (n >= 2000) break; // 실측 621개 — 이보다 훨씬 많으면 정상이 아니다
    if (typeof v !== 'string') continue;
    if (!TOKEN_NAME.test(k) || !TOKEN_VALUE.test(v)) continue;
    if (v.includes('/*') || v.includes('*/')) continue;
    out[k] = v;
    n++;
  }
  return n ? out : null;
}

function tokensToCss(tokens) {
  let css = LIGHT_SCOPE + '{';
  for (const [k, v] of Object.entries(tokens)) css += k + ':' + v + ' !important;';
  return css + '}';
}

function loadCfg() {
  try {
    const disk = JSON.parse(fs.readFileSync(configPath(), 'utf8'));
    if (typeof disk.emojiVisible === 'boolean') saved.emojiVisible = disk.emojiVisible;
  } catch {}
  cfg.emojiVisible = saved.emojiVisible; // 패널은 항상 펼친 기본값으로 남는다
}
// CLI 플래그는 이번 실행에만 적용하고 저장하지 않는다.
// npm run start:hidden 을 한 번 썼다고 이후 npm start 가 숨김으로 남으면 곤란하다.
function applyCliFlags() {
  // cfg 만 건드린다 — saved 를 건드리면 디스크로 새어 나간다
  if (process.argv.includes('--dio-hidden')) cfg.emojiVisible = false;
  if (process.argv.includes('--dio-visible')) cfg.emojiVisible = true;
  if (process.argv.includes('--dio-nopanel')) cfg.panelsVisible = false;
}

function saveCfg() {
  try {
    fs.mkdirSync(path.dirname(configPath()), { recursive: true });
    fs.writeFileSync(configPath(), JSON.stringify(saved, null, 2));
  } catch {}
}

async function injectAll() {
  if (injected || !win) return;
  injected = true;
  const wc = win.webContents;
  // 디버그 이터레이션을 위해 매 적용 시 디스크에서 새로 읽는다
  const css = fs.readFileSync(path.join(__dirname, 'excel.css'), 'utf8');
  const js = bundle(); // src/*.js 를 순서대로 이어붙인 것

  /* 지난 실행에서 뽑아둔 토큰. CSS 문자열은 저장하지 않고 매번 조립한다 —
     파일이 손대졌더라도 sanitizeTokens 를 통과한 이름·값만 들어간다. */
  let tokens = null;
  try {
    tokens = sanitizeTokens(JSON.parse(fs.readFileSync(lightTokensPath(), 'utf8')));
  } catch {}

  try {
    await wc.insertCSS(css);
    /* excel.css 뒤에 넣어야 한다. 라이브 추출 경로는 <style> 을 head 끝에
       붙여서 excel.css 를 이기는데, 캐시를 앞에 넣으면 반대로 밀린다 —
       같은 토큰인데 캐시가 있고 없고에 따라 화면이 달라진다. */
    if (tokens) await wc.insertCSS(tokensToCss(tokens));
    const lightCached = !!tokens;
    await wc.executeJavaScript(
      js +
        `;__DIO_BOOT(${JSON.stringify({
          emojiVisible: cfg.emojiVisible,
          panelsVisible: cfg.panelsVisible,
          // 단축키 판정과 같은 값을 넘긴다 — 안내 문구가 실제와 어긋나지 않도록
          isMac: process.platform === 'darwin',
          lightCached
        })});`
    );
  } catch (e) {
    injected = false;
    console.error('[dio] 주입 실패:', e.message);
  }
}

const DEBUG = process.env.DIO_DEBUG === '1';
let debugStarted = false;

function startDebugLoop(wc) {
  if (debugStarted) return; // 리로드마다 중첩되면 exec 파일이 무한 재실행된다
  debugStarted = true;
  const dir = path.join(os.tmpdir(), 'dio-shots');
  fs.mkdirSync(dir, { recursive: true });
  let n = 0;
  setInterval(async () => {
    try {
      if (!wc.isDestroyed() && !wc.isLoading()) {
        const img = await wc.capturePage();
        fs.writeFileSync(path.join(dir, `shot-${String(++n).padStart(3, '0')}.png`), img.toPNG());
      }
    } catch {}
  }, 5000);

  setInterval(() => {
    try {
      const f = path.join(os.tmpdir(), 'dio-exec.js');
      if (fs.existsSync(f)) {
        const c = fs.readFileSync(f, 'utf8');
        if (c.trim()) {
          fs.unlinkSync(f); // 실행 후 제거 — 같은 명령 재실행 금지
          if (c.trim() === 'reload') {
            wc.reload(); // 메인 프로세스에서 확실히 리로드
            console.log('[exec] reload (main)');
            return;
          }
          wc.executeJavaScript(c, true)
            .then((r) => console.log('[exec]', typeof r === 'string' ? r : JSON.stringify(r)))
            .catch((e) => console.log('[exec err]', e.message));
        }
      }
    } catch {}
  }, 1200);
}

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 940,
    minHeight: 520,
    title: SPOOF_TITLE,
    backgroundColor: '#f3f3f3',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      // 리본 버튼이 메인 프로세스로 토글을 보내는 통로
      preload: path.join(__dirname, 'preload.js')
    }
  });

  const wc = win.webContents;
  // notifications 는 일부러 뺐다 — OS 알림 팝업에 보낸 사람과 메시지 내용이
  // 그대로 떠서 위장이 통째로 무의미해진다. 알림이 필요하면 아래 배열에
  // 'notifications' 를 다시 넣으면 된다.
  const ALLOWED_PERMS = ['media', 'fullscreen', 'pointerLock', 'clipboard-sanitized-write'];
  wc.session.setPermissionRequestHandler((_, perm, cb) => cb(ALLOWED_PERMS.includes(perm)));
  // 예전 구현은 https 링크를 in-app 창(action:'allow')으로 열었다. 엑셀이 아닌
  // 브라우저 창이 떠서 위장이 즉시 깨지고, 임의 웹 콘텐츠가 Electron 창에서
  // 도는 문제도 있었다. 이제 http(s)만 기본 브라우저로 넘기고 나머지는 막는다.
  wc.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  // 사진 원본 클릭 등으로 창이 통째로 외부 사이트로 이동하는 사고 방지.
  // 단 APP_URL 접두사로 비교하면 discord.com 안에서의 정상 이동(로그인
  // 리다이렉트, /channels/@me, OAuth 콜백)까지 막힌다. 오리진으로 판단한다.
  wc.on('will-navigate', (e, url) => {
    let sameSite = false;
    try { sameSite = new URL(url).origin === APP_ORIGIN; } catch {}
    if (!sameSite) e.preventDefault();
  });
  // 디스코드 웹이 Ctrl+E(이모지 피커) 같은 키를 자체 처리해서 메뉴 액셀러레이터가
  // 먹히지 않는다. before-input-event 는 렌더러보다 먼저 도는 메인 프로세스 훅이라
  // 여기서 preventDefault 하면 디스코드가 그 키를 아예 못 본다.
  wc.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown' || input.alt) return;
    const mod = process.platform === 'darwin' ? input.meta : input.control;
    if (!mod) return;
    const key = (input.key || '').toLowerCase();
    if (key === 'e' && !input.shift) {
      e.preventDefault();
      toggleEmoji();
    } else if (key === 'b' && input.shift) {
      e.preventDefault();
      togglePanels();
    }
  });
  wc.on('did-start-loading', () => { injected = false; });
  wc.on('did-finish-load', () => {
    setTimeout(injectAll, 600);
    if (DEBUG) startDebugLoop(win.webContents);
  });

  // 디스코드는 읽지 않은 개수가 바뀔 때마다 제목을 갱신한다.
  // setTitle은 Win32 호출이라 같은 값이면 건너뛴다.
  win.on('page-title-updated', (e) => {
    e.preventDefault();
    if (win.getTitle() !== SPOOF_TITLE) win.setTitle(SPOOF_TITLE);
  });
  win.on('closed', () => { win = null; });

  win.loadURL(APP_URL);
}

function buildMenu() {
  return Menu.buildFromTemplate([
    {
      label: '앱',
      submenu: [
        { role: 'about', label: '정보' },
        { type: 'separator' },
        { role: 'hide', label: '숨기기' },
        { role: 'quit', label: '종료' }
      ]
    },
    {
      label: '보기',
      submenu: [
        {
          label: cfg.emojiVisible ? '이모지 숨기기 (텍스트 설명)' : '이모지 다시 보이기',
          accelerator: 'CmdOrCtrl+E',
          registerAccelerator: false, // 실제 처리는 before-input-event
          click: toggleEmoji
        },
        {
          label: cfg.panelsVisible ? '서버·채널 목록 숨기기' : '서버·채널 목록 보이기',
          // Ctrl+B는 디스코드 입력창의 굵게 서식이라 피한다
          accelerator: 'CmdOrCtrl+Shift+B',
          registerAccelerator: false, // 실제 처리는 before-input-event
          click: togglePanels
        },
        { type: 'separator' },
        { role: 'reload', label: '새로고침' },
        { role: 'forceReload', label: '강제 새로고침' },
        { role: 'toggleDevTools', label: '개발자 도구' },
        { type: 'separator' },
        { role: 'resetZoom', label: '화면 배율 초기화' },
        { role: 'zoomIn', label: '확대' },
        { role: 'zoomOut', label: '축소' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: '전체 화면' }
      ]
    }
  ]);
}

function togglePanels() {
  // 이 세션 동안만 유지한다 — 저장하지 않으므로 다음 실행은 다시 펼친 상태다
  cfg.panelsVisible = !cfg.panelsVisible;
  if (win) {
    win.webContents.executeJavaScript(`window.__dioSetPanels(${cfg.panelsVisible})`).catch(() => {});
  }
  Menu.setApplicationMenu(buildMenu());
}

function toggleEmoji() {
  cfg.emojiVisible = saved.emojiVisible = !cfg.emojiVisible;
  saveCfg();
  if (win) {
    win.webContents.executeJavaScript(`window.__dioSetEmoji(${cfg.emojiVisible})`).catch(() => {});
  }
  Menu.setApplicationMenu(buildMenu());
}

/* 리본 버튼도 단축키·메뉴와 같은 경로로 모은다 — 그래야 설정 저장과 메뉴
   라벨 갱신이 한 군데서만 일어난다. */
ipcMain.on('dio:toggle-emoji', () => toggleEmoji());
ipcMain.on('dio:toggle-panels', () => togglePanels());

ipcMain.on('dio:save-light-tokens', (e, raw) => {
  // 우리 창에서 온 것만 받는다
  if (!win || win.isDestroyed() || e.sender !== win.webContents) return;
  const tokens = sanitizeTokens(raw);
  if (!tokens) return;
  try {
    fs.mkdirSync(path.dirname(lightTokensPath()), { recursive: true });
    fs.writeFileSync(lightTokensPath(), JSON.stringify(tokens));
  } catch {}
});

app.whenReady().then(() => {
  app.userAgentFallback = app.userAgentFallback.replace(/\s?Electron\/[\d.]+/, '');
  loadCfg();
  applyCliFlags();
  createWindow();
  Menu.setApplicationMenu(buildMenu());
});

app.on('window-all-closed', () => app.quit());

const { app, BrowserWindow, Menu, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const APP_URL = 'https://discord.com/app';
const SPOOF_TITLE = '재고관리_2026.xlsx - Excel';

let win = null;
let injected = false;

const cfg = { emojiVisible: true };
const configPath = () => path.join(app.getPath('userData'), 'config.json');

function loadCfg() {
  try { Object.assign(cfg, JSON.parse(fs.readFileSync(configPath(), 'utf8'))); } catch {}
}
function saveCfg() {
  try {
    fs.mkdirSync(path.dirname(configPath()), { recursive: true });
    fs.writeFileSync(configPath(), JSON.stringify(cfg, null, 2));
  } catch {}
}

async function injectAll() {
  if (injected || !win) return;
  injected = true;
  const wc = win.webContents;
  // 디버그 이터레이션을 위해 매 적용 시 디스크에서 새로 읽는다
  const css = fs.readFileSync(path.join(__dirname, 'excel.css'), 'utf8');
  const js = fs.readFileSync(path.join(__dirname, 'dio.js'), 'utf8');
  try {
    await wc.insertCSS(css);
    await wc.executeJavaScript(
      js + `;__DIO_BOOT(${JSON.stringify({ emojiVisible: cfg.emojiVisible })});`
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
      spellcheck: false
    }
  });

  const wc = win.webContents;
  wc.session.setPermissionRequestHandler((_, perm, cb) => {
    cb(['media', 'notifications', 'fullscreen', 'pointerLock', 'clipboard-sanitized-write'].includes(perm));
  });
  wc.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) return { action: 'allow' };
    shell.openExternal(url);
    return { action: 'deny' };
  });
  // 사진 원본 클릭 등으로 창이 통째로 이동하는 사고 방지
  wc.on('will-navigate', (e, url) => {
    if (!url.startsWith(APP_URL)) e.preventDefault();
  });
  wc.on('did-start-loading', () => { injected = false; });
  wc.on('did-finish-load', () => {
    setTimeout(injectAll, 600);
    if (DEBUG) startDebugLoop(win.webContents);
  });

  win.on('page-title-updated', (e) => {
    e.preventDefault();
    win.setTitle(SPOOF_TITLE);
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
          click: toggleEmoji
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

function toggleEmoji() {
  cfg.emojiVisible = !cfg.emojiVisible;
  saveCfg();
  if (win) {
    win.webContents.executeJavaScript(`window.__dioSetEmoji(${cfg.emojiVisible})`).catch(() => {});
  }
  Menu.setApplicationMenu(buildMenu());
}

app.whenReady().then(() => {
  app.userAgentFallback = app.userAgentFallback.replace(/\s?Electron\/[\d.]+/, '');
  loadCfg();
  createWindow();
  Menu.setApplicationMenu(buildMenu());
});

app.on('window-all-closed', () => app.quit());

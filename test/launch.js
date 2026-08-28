/* 실행 플래그 · 단축키 · 설정 저장 테스트
   실행: npm run test:launch

   main.js 는 Electron 메인 프로세스에서만 도는 코드라 픽스처 기반 오프라인
   스위트로는 닿지 않는다. 여기서는 실제 앱을 띄우고 키를 넣은 뒤, 디스크에
   남은 설정을 확인한다.

   핵심은 "일회성 CLI 플래그가 저장 설정을 오염시키지 않는가" 다. 실제로
   --dio-visible 로 띄운 뒤 패널만 토글하면 emojiVisible: true 가 저장돼서
   다음 npm start 가 가려지지 않은 채 뜨는 버그가 있었다. 안전한 기본값이
   일회성 플래그에 밀리면 위장 도구로서 의미가 없다.

   userData 는 매번 임시 폴더로 격리한다 — 사용자의 실제 설정을 건드리지 않는다. */
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const electronBin = require('electron'); // Node 컨텍스트에서는 실행 파일 경로가 온다
const REPO = path.join(__dirname, '..');
const NL = String.fromCharCode(10);

let failures = 0;
let checks = 0;

function check(name, actual, expected) {
  checks++;
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    console.log('  ok   ' + name);
  } else {
    failures++;
    console.log('  FAIL ' + name);
    console.log('        기대: ' + JSON.stringify(expected));
    console.log('        실제: ' + JSON.stringify(actual));
  }
}

/* 실제 main.js 뒤에 이어붙일 드라이버.
   부팅 상태를 파일로 남기고, 요청받은 키를 넣은 뒤 종료한다. */
const DRIVER = [
  '',
  '{',
  '  const OUT = process.env.DIO_TEST_OUT;',
  '  const KEYS = (process.env.DIO_TEST_KEYS || "").split(",").filter(Boolean);',
  '  const fsx = require("node:fs");',
  '  const lines = [];',
  '  const say = (m) => { lines.push(m); try { fsx.writeFileSync(OUT, lines.join(String.fromCharCode(10))); } catch {} };',
  '  const bail = (c) => { try { app.exit(c); } catch { process.exit(c); } };',
  '  setTimeout(() => { say("WATCHDOG"); bail(9); }, 60000);',
  '  setTimeout(async () => {',
  '    try {',
  '      if (!win) { say("NOWIN"); return bail(1); }',
  '      const wc = win.webContents;',
  '      const read = async () => {',
  '        try {',
  '          return await wc.executeJavaScript(',
  '            \'typeof __DIO === "undefined" ? "NO_DIO" : JSON.stringify({\' +',
  '            \' hide: document.body.classList.contains("dio-hide"),\' +',
  '            \' nopanel: document.body.classList.contains("dio-nopanel"),\' +',
  '            \' bodyShown: getComputedStyle(document.body).display !== "none",\' +',
  '            \' bg: getComputedStyle(document.documentElement)\' +',
  '            \'   .getPropertyValue("--background-primary").trim() })\'',
  '          );',
  '        } catch (e) { return "READERR:" + e.message; }',
  '      };',
  '      say("BOOT " + (await read()));',
  '      for (const k of KEYS) {',
  '        const mods = k === "ctrlshiftb" ? ["control", "shift"] : ["control"];',
  '        const code = k === "ctrlshiftb" ? "B" : "e";',
  '        wc.sendInputEvent({ type: "keyDown", keyCode: code, modifiers: mods });',
  '        wc.sendInputEvent({ type: "keyUp", keyCode: code, modifiers: mods });',
  '        await new Promise((r) => setTimeout(r, 900));',
  '        say("AFTER " + k + " " + (await read()));',
  '      }',
  '      bail(0);',
  '    } catch (e) { say("ERR " + e.message); bail(1); }',
  '  }, 12000);',
  '}',
  ''
].join(NL);

function buildApp(dir) {
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
  for (const f of ['bundle.js', 'excel.css']) {
    fs.copyFileSync(path.join(REPO, f), path.join(dir, f));
  }
  for (const f of fs.readdirSync(path.join(REPO, 'src'))) {
    fs.copyFileSync(path.join(REPO, 'src', f), path.join(dir, 'src', f));
  }
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({ name: 'dio-launch-test', version: '1.0.0', main: 'main.js' }, null, 2)
  );
  fs.writeFileSync(
    path.join(dir, 'main.js'),
    fs.readFileSync(path.join(REPO, 'main.js'), 'utf8') + DRIVER
  );
}

/* 앱을 한 번 띄우고, 남긴 기록과 저장된 설정을 돌려준다.
   userData 는 인자로 받은 폴더를 그대로 쓴다 — 실행을 이어 붙여
   "다음 npm start 가 어떻게 뜨는가" 를 확인할 수 있다. */
function run(appDir, userData, args, keys) {
  const out = path.join(userData, 'driver.log');
  try { fs.unlinkSync(out); } catch {}
  fs.mkdirSync(userData, { recursive: true });

  spawnSync(electronBin, [appDir, '--user-data-dir=' + userData].concat(args), {
    env: Object.assign({}, process.env, { DIO_TEST_OUT: out, DIO_TEST_KEYS: keys.join(',') }),
    stdio: 'ignore',
    timeout: 90000
  });

  let log = '';
  try { log = fs.readFileSync(out, 'utf8'); } catch {}
  let cfg = null;
  try { cfg = JSON.parse(fs.readFileSync(path.join(userData, 'config.json'), 'utf8')); } catch {}
  const boot = (log.split(NL).find((l) => l.startsWith('BOOT ')) || '').slice(5);
  return { log, cfg, boot: boot ? JSON.parse(boot) : null };
}

/* 이 테스트는 실제 창을 띄운다(숨긴 창은 rAF 가 멈춰 결과가 왜곡된다).
   그래서 사람이 창을 닫아버리면 드라이버가 기록을 남기지 못하고, 개별 검사들이
   "기대: true, 실제: undefined" 로 줄줄이 실패해 원인을 오해하게 된다.
   기록 자체가 없으면 그 사실을 먼저 알린다. */
function ranOk(label, r) {
  if (r.boot) return true;
  failures++;
  checks++;
  console.log('  FAIL ' + label + ' — 실행이 결과를 남기지 못했다');
  console.log('        창을 닫았거나 앱이 일찍 죽었을 수 있다. 남은 기록:');
  console.log('        ' + (r.log.trim().split(NL).join(' | ') || '(없음)'));
  return false;
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dio-launch-'));
const appDir = path.join(tmp, 'app');
buildApp(appDir);

try {
  console.log(NL + '[실행] 플래그 없음 — 기본이 가린 상태여야 한다');
  const a = run(appDir, path.join(tmp, 'ud-a'), [], []);
  if (ranOk('플래그 없음 실행', a)) {
    check('기본 부팅이 가린 상태', a.boot.hide, true);
    check('패널은 펴진 상태', a.boot.nopanel, false);
  }

  console.log(NL + '[실행] --dio-visible — 그 실행에만 적용');
  const ud = path.join(tmp, 'ud-b');
  const b = run(appDir, ud, ['--dio-visible'], ['ctrlshiftb']);
  const bOk = ranOk('--dio-visible 실행', b);
  if (bOk) {
    check('플래그대로 안 가린 상태로 부팅', b.boot.hide, false);
    check('Ctrl+Shift+B 로 패널 접힘', b.log.indexOf('"nopanel":true') > -1, true);
  /* 여기가 핵심이다. 패널만 토글했는데 --dio-visible 이 emojiVisible 로 새어
     들어가면, 다음 실행이 가려지지 않은 채 뜬다.
     패널은 저장 대상이 아니므로 이 실행에서는 설정 파일이 아예 안 써지는 것이
     정상이다 — 파일이 없거나, 있어도 false 여야 한다. */
    check(
      '일회성 플래그가 저장 설정을 오염시키지 않음',
      !b.cfg || b.cfg.emojiVisible === false,
      true
    );
  }

  console.log(NL + '[실행] 같은 설정으로 다시 — 가림은 남고 패널은 다시 펴져야 한다');
  const c = run(appDir, ud, [], []);
  if (ranOk('재실행', c)) {
    check('플래그 없이 다시 띄우면 가린 상태', c.boot.hide, true);
    /* 패널 상태는 일부러 저장하지 않는다. 접어둔 채로 껐다가 켜면 지금 어느
       채널인지 알 수 없는 화면으로 시작해서, 눌린 줄도 모르고 헤매게 된다. */
    check('접었어도 다음 실행은 펴진 상태', c.boot.nopanel, false);
    check('패널 상태는 저장되지 않음', !c.cfg || c.cfg.panelsVisible === undefined, true);
  }

  /* 라이트 토큰 캐시는 원격 페이지가 보낸 값에서 나온다. 파일이 손대졌거나
     그 페이지가 한 번 오염됐다면, 검증 없이 쓸 경우 임의 CSS 가 다음 실행부터
     계속 적용된다 — 공격이 사라진 뒤에도 살아남는다는 뜻이다.
     값에 중괄호를 넣어 규칙을 탈출하려는 시도를 막는지 본다. */
  console.log(NL + '[실행] 손댄 토큰 캐시는 걸러야 한다');
  const udE = path.join(tmp, 'ud-e');
  fs.mkdirSync(udE, { recursive: true });
  fs.writeFileSync(
    path.join(udE, 'light-tokens.json'),
    JSON.stringify({
      '--background-primary': '#eeeeee',
      '--evil': 'red}*{display:none!important}',
      notAToken: 'red',
      '--script': '</style><script>1</script>'
    })
  );
  const e2 = run(appDir, udE, [], []);
  if (ranOk('손댄 캐시 실행', e2)) {
    check('규칙 탈출이 막힘(본문이 살아 있음)', e2.boot.bodyShown, true);
    check('멀쩡한 토큰은 적용됨', e2.boot.bg, '#eeeeee');
  }

  console.log(NL + '[실행] Ctrl+E 로 명시적으로 바꾼 것은 저장된다');
  const d = run(appDir, path.join(tmp, 'ud-d'), [], ['ctrle']);
  if (ranOk('Ctrl+E 실행', d)) {
    check('Ctrl+E 가 실제로 먹음', d.log.indexOf('"hide":false') > -1, true);
    check('토글 결과가 저장됨', d.cfg && d.cfg.emojiVisible, true);
  }

  console.log(NL + '검사 ' + checks + '개 · 실패 ' + failures + ' — ' + (failures ? 'FAIL' : 'PASS'));
} finally {
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
}

process.exit(failures ? 1 : 0);

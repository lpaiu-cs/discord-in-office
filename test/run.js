/* discord-in-office 오프라인 테스트 스위트
   실행: npm test

   디스코드는 클래스 이름을 수시로 바꾸고, 이 코드는 그럴 때 조용히 깨진다.
   실제로 [class*="avatar"] 가 대소문자 때문에 voiceUserAvatar 를 놓치던 버그가
   화면을 눈으로 볼 때까지 드러나지 않았다. 그래서 픽스처로 가림 결과를 직접
   확인한다. 네트워크는 쓰지 않는다 — 실제 discord.com 은 test:live 쪽. */
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const bundle = require('../bundle');

const REPO = path.join(__dirname, '..');
const FIX = path.join(__dirname, 'fixtures');

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

function checkAtMost(name, actual, limit) {
  checks++;
  if (typeof actual === 'number' && actual <= limit) {
    console.log('  ok   ' + name + ' (' + actual + ' <= ' + limit + ')');
  } else {
    failures++;
    console.log('  FAIL ' + name + ' — ' + actual + ' 이 한계 ' + limit + ' 초과');
  }
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const js = (wc, code) => wc.executeJavaScript(code);

const PROBE = [
  'window.__vis = (sel) => {',
  '  const el = document.querySelector(sel);',
  '  if (!el) return "MISSING";',
  '  const cs = getComputedStyle(el);',
  '  return (cs.display === "none" || cs.visibility === "hidden") ? "hidden" : "visible";',
  '};',
  'window.__label = (sel) => {',
  '  const el = document.querySelector(sel);',
  '  if (!el) return "MISSING";',
  '  const lab = el.nextElementSibling;',
  '  return lab ? lab.textContent : "NOLABEL";',
  '};',
  'window.__count = (sel) => document.querySelectorAll(sel).length;',
  'true;'
].join('\n');

function makeWindow() {
  return new BrowserWindow({
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
}

async function boot(wc, fixture, cfg) {
  await wc.loadFile(path.join(FIX, fixture));
  await js(wc, 'window.__ready || true');
  await js(wc, PROBE);
  await wc.insertCSS(fs.readFileSync(path.join(REPO, 'excel.css'), 'utf8'));
  await js(wc, bundle() + ';__DIO_BOOT(' + JSON.stringify(cfg) + ');');
  await wait(700);
}

/* ---------------- 가림 정확성 ---------------- */
/* 조각 하나만으로는 문법 검사가 안 되므로(하나의 IIFE 를 나눠 갖는다)
   이어붙인 번들 전체가 파싱되는지 여기서 확인한다. 순서가 어긋나거나
   조각의 괄호가 안 맞으면 여기서 바로 걸린다. */
async function testBundle() {
  console.log('\n[번들] src/*.js 이어붙이기');
  let parsed = true;
  let msg = null;
  try {
    new Function(bundle());
  } catch (e) {
    parsed = false;
    msg = e.message;
  }
  check('번들이 문법적으로 온전함' + (msg ? ' — ' + msg : ''), parsed, true);
  check('진입점 포함', bundle().indexOf('__DIO_BOOT') > -1, true);

  /* 문법 검사만으로는 순서가 어긋난 걸 못 잡는다 — 조각을 IIFE 뒤로 밀어도
     그 자체로는 유효한 코드라 파싱은 통과한다(실제로 확인했다). 대신 IIFE 를
     닫는 위치를 본다: 닫은 뒤에 코드가 남아 있으면 조각 순서가 틀린 것이다. */
  const src = bundle();
  const at = src.lastIndexOf('})();');
  check('IIFE 를 닫은 뒤에 남은 코드 없음', at > -1 && src.slice(at + 5).trim(), '');
}

async function testMasking(wc) {
  console.log('\n[가림] 숨김 모드');
  await boot(wc, 'masking.html', { emojiVisible: false, panelsVisible: true });

  check('스캔 에러 없음', await js(wc, '__DIO.lastErr || null'), null);

  // 프로필 — 캐멀케이스 클래스가 핵심 (대소문자 회귀 방지)
  check('음성 멤버 아바타(캐멀케이스)', await js(wc, '__vis(".voiceUserAvatar__w")'), 'hidden');
  check('답장 아바타(캐멀케이스)', await js(wc, '__vis(".replyAvatar__w")'), 'hidden');
  check('메시지 아바타', await js(wc, '__vis(".avatar__h1")'), 'hidden');
  check('서버 아이콘', await js(wc, '__vis(".guildIcon__q")'), 'hidden');
  check(
    '배경이미지 아바타',
    await js(wc, 'getComputedStyle(document.querySelector(".panelAvatar__p")).backgroundImage'),
    'none'
  );
  check('아바타 마스크 생성', await js(wc, '__count(".dio-avatar-mask") > 0'), true);

  // 임베드 — 중첩 구조에서 가장 바깥만 접혀야 한다
  check('임베드 접힘', await js(wc, '__vis(".embedWrapper__e1")'), 'hidden');
  check('임베드 라벨', await js(wc, '__label(".embedWrapper__e1")'), '[임베드:youtube.com]');
  check('임베드 라벨 1개만', await js(wc, '__count(".embedWrapper__e1 ~ .dio-emolabel")'), 1);

  // 스티커
  check('스티커 접힘', await js(wc, '__vis(".stickerAsset__s2")'), 'hidden');
  check('스티커 라벨', await js(wc, '__label(".stickerAsset__s2")'), '[스티커:시오짱]');
  check('스티커 이름 숨김', await js(wc, '__vis(".stickerName__s3")'), 'hidden');

  // 사진
  check('단일 사진 접힘', await js(wc, '__vis("#chat-messages-1-3 .lazyImg__i2")'), 'hidden');
  check('사진 버튼 1개', await js(wc, '__count("#chat-messages-1-3 .dio-viewbtn")'), 1);
  /* 개수만 세면 안 된다 — .dio-viewbtn 은 CSS 기본값이 display:none 이라
     인라인 스타일을 '' 로 되돌리면 요소는 있는데 화면에는 안 나온다.
     실제로 그 상태였고(버튼이 0x0), 사진을 펼칠 방법이 없었다. */
  check('사진 버튼이 실제로 보임', await js(wc, '__vis("#chat-messages-1-3 .dio-viewbtn")'), 'visible');
  check(
    '사진 버튼에 크기가 있음',
    await js(wc, 'document.querySelector("#chat-messages-1-3 .dio-viewbtn").getBoundingClientRect().height > 0'),
    true
  );
  check('스티커 라벨이 실제로 보임', await js(wc, '__vis(".stickerAsset__s2 + .dio-emolabel")'), 'visible');
  check('임베드 라벨이 실제로 보임', await js(wc, '__vis(".embedWrapper__e1 + .dio-emolabel")'), 'visible');
  check(
    '캐러셀 사진 전부 접힘',
    await js(wc, '[...document.querySelectorAll(".carousel__c1 img")].every(i => getComputedStyle(i).display === "none")'),
    true
  );
  check('캐러셀 버튼은 대표 1개', await js(wc, '__count(".carousel__c1 .dio-viewbtn")'), 1);
  check('캐러셀 버튼이 실제로 보임', await js(wc, '__vis(".carousel__c1 .dio-viewbtn")'), 'visible');

  check('패널은 그대로', await js(wc, '__vis(".guilds__a1")'), 'visible');

  /* 배경이미지는 나중에 붙을 수 있다 — SPA 는 같은 banner 노드를 유지한 채
     길드 전환이나 비동기 로딩으로 style 만 바꾼다. 계산 스타일을 노드 수명 내내
     캐시해 두면 첫 스캔의 'none' 을 계속 믿어서 이 배너를 못 가린다. */
  check('아직 배경 없는 배너는 그대로', await js(wc, '__vis(".bannerLate__b9")'), 'visible');
  await js(
    wc,
    'document.querySelector(".bannerLate__b9").style.backgroundImage =' +
      ' "url(https://cdn.discordapp.com/banners/1/x.png)"; true;'
  );
  await js(wc, '__DIO.scan()');
  await wait(400);
  check('나중에 붙은 배너도 가려짐', await js(wc, '__vis(".bannerLate__b9")'), 'hidden');

  console.log('\n[가림] 패널 접기');
  await js(wc, 'window.__dioSetPanels(false)');
  await wait(300);
  check('서버 목록 접힘', await js(wc, '__vis(".guilds__a1")'), 'hidden');
  check('채널 목록 접힘', await js(wc, '__vis(".sidebar__b2")'), 'hidden');

  console.log('\n[가림] 보이기 복원');
  await js(wc, 'window.__dioSetPanels(true); window.__dioSetEmoji(true);');
  await wait(800);
  check('아바타 복원', await js(wc, '__vis(".voiceUserAvatar__w")'), 'visible');
  check(
    '배경이미지 복원',
    await js(wc, 'getComputedStyle(document.querySelector(".panelAvatar__p")).backgroundImage.indexOf("avatars/13") > -1'),
    true
  );
  check('임베드 복원', await js(wc, '__vis(".embedWrapper__e1")'), 'visible');
  check('스티커 복원', await js(wc, '__vis(".stickerAsset__s2")'), 'visible');
  check('사진 복원', await js(wc, '__vis("#chat-messages-1-3 .lazyImg__i2")'), 'visible');
  check('패널 복원', await js(wc, '__vis(".guilds__a1")'), 'visible');
}

/* ---------------- 펼치기 토글 ---------------- */
async function testExpand(wc) {
  console.log('\n[펼치기] 라벨 클릭');
  await boot(wc, 'masking.html', { emojiVisible: false, panelsVisible: true });

  check('임베드 iframe 접힘', await js(wc, '__vis(".embedPlayer__e6")'), 'hidden');
  await js(wc, 'document.querySelector(".embedWrapper__e1").nextElementSibling.click()');
  await wait(500);
  check('임베드 펼쳐짐', await js(wc, '__vis(".embedWrapper__e1")'), 'visible');
  /* 펼쳤으면 안의 플레이어까지 나와야 한다. CSS 안전망이 .dio-hide 동안 iframe 을
     항상 display:none !important 로 눌러버리면, 펼쳐도 영상이 재생되지 않는다. */
  check('펼치면 iframe 플레이어도 나옴', await js(wc, '__vis(".embedPlayer__e6")'), 'visible');
  /* 그리고 다시 접을 수 있어야 한다. .click() 은 display:none 요소에도 먹으므로
     "클릭이 동작한다" 만으로는 부족하다 — 사람이 누를 수 있는지를 본다. */
  check(
    '펼친 뒤에도 접기 컨트롤이 보임',
    await js(wc, '__vis(".embedWrapper__e1 + .dio-emolabel")'),
    'visible'
  );
  await js(wc, 'document.querySelector(".embedWrapper__e1").nextElementSibling.click()');
  await wait(500);
  check('임베드 다시 접힘', await js(wc, '__vis(".embedWrapper__e1")'), 'hidden');
  await js(wc, 'document.querySelector(".embedWrapper__e1").nextElementSibling.click()');
  await wait(500);
  check('임베드 재펼침', await js(wc, '__vis(".embedWrapper__e1")'), 'visible');

  await js(wc, 'document.querySelector(".stickerAsset__s2").nextElementSibling.click()');
  await wait(500);
  check('스티커 펼쳐짐', await js(wc, '__vis(".stickerAsset__s2")'), 'visible');

  await js(wc, 'document.querySelector("#chat-messages-1-3 .dio-viewbtn").click()');
  await wait(500);
  check('사진 펼쳐짐', await js(wc, '__vis("#chat-messages-1-3 .lazyImg__i2")'), 'visible');

  await js(wc, 'document.querySelector(".carousel__c1 .dio-viewbtn").click()');
  await wait(500);
  check(
    '캐러셀 묶음째 펼쳐짐',
    await js(wc, '[...document.querySelectorAll(".carousel__c1 img")].every(i => getComputedStyle(i).display !== "none")'),
    true
  );

  /* 회귀 테스트: 디스코드가 노드를 갈아끼운 뒤에도 토글이 살아 있어야 한다.
     라벨은 남기고 임베드 노드만 교체하면 ensureLabel 이 기존 라벨을 재사용하는데,
     핸들러가 클로저로 잡아둔 예전(분리된) 노드를 만져서 클릭이 안 먹던 버그가 있었다. */
  console.log('\n[펼치기] 리렌더 후에도 토글이 사는지');
  await js(
    wc,
    [
      'const old = document.querySelector(".embedWrapper__e1");',
      'const fresh = old.cloneNode(true);',
      'delete fresh.dataset.dioExpanded;',
      'fresh.style.display = "";',
      'old.replaceWith(fresh);',
      'true;'
    ].join('\n')
  );
  await js(wc, '__DIO.scan()');
  await wait(500);
  // 펼침 상태는 노드가 아니라 메시지 id + 내용으로 기억하므로 교체돼도 남는다
  check('교체돼도 펼침 유지', await js(wc, '__vis(".embedWrapper__e1")'), 'visible');
  // 그리고 새 노드에서도 토글이 살아 있어야 한다 (클로저가 옛 노드를 잡으면 여기서 걸린다)
  await js(wc, 'document.querySelector(".embedWrapper__e1").nextElementSibling.click()');
  await wait(500);
  check('교체된 노드에서 접기 동작', await js(wc, '__vis(".embedWrapper__e1")'), 'hidden');
  await js(wc, 'document.querySelector(".embedWrapper__e1").nextElementSibling.click()');
  await wait(500);
  check('교체된 노드에서 펼치기 동작', await js(wc, '__vis(".embedWrapper__e1")'), 'visible');

  /* 가상 스크롤 회귀: 디스코드 메시지 목록은 화면 밖으로 나간 메시지의 DOM 을
     통째로 버렸다가 되돌아올 때 새로 만든다. 펼침 상태를 DOM 에만 들고 있으면
     그때 같이 날아가서, 펼쳐둔 사진이 스크롤 한 번에 도로 접힌다. */
  console.log('\n[펼치기] 가상 스크롤로 메시지가 버려졌다 돌아와도 유지되는지');
  // 앞의 '사진 펼쳐짐' 검사가 이미 펼쳐둔 상태다 — 다시 누르면 도로 접힌다
  check('사진 펼친 상태 유지', await js(wc, '__vis("#chat-messages-1-3 .lazyImg__i2")'), 'visible');

  await js(
    wc,
    [
      // 메시지 노드를 통째로 버렸다가 원본 마크업으로 다시 만든다
      'const row = document.getElementById("chat-messages-1-3");',
      'const html = row.outerHTML.replace(/ data-dio-[a-z]+="[^"]*"/g, "");',
      'const holder = document.createElement("div");',
      'holder.innerHTML = html;',
      'const rebuilt = holder.firstElementChild;',
      'rebuilt.querySelectorAll(".dio-viewbtn, .dio-emolabel, .dio-avatar-mask")',
      '  .forEach((n) => n.remove());',
      'rebuilt.querySelectorAll("[style]").forEach((n) => n.removeAttribute("style"));',
      'row.replaceWith(rebuilt);',
      'true;'
    ].join('\n')
  );
  await js(wc, '__DIO.scan()');
  await wait(600);
  check(
    '되돌아온 메시지에서도 펼침 유지',
    await js(wc, '__vis("#chat-messages-1-3 .lazyImg__i2")'),
    'visible'
  );
}

/* ---------------- 성능 ---------------- */
async function testPerf(wc) {
  console.log('\n[성능] DOM 이 계속 바뀌는 동안의 비용');
  await wc.loadFile(path.join(FIX, 'chat.html'));
  await wait(1200);
  const nodes = await js(wc, '__nodeCount()');

  await js(
    wc,
    [
      'window.__LT = { count: 0, total: 0 };',
      'new PerformanceObserver((l) => {',
      '  for (const e of l.getEntries()) { __LT.count++; __LT.total += e.duration; }',
      '}).observe({ entryTypes: ["longtask"] });',
      'true;'
    ].join('\n')
  );
  await wc.insertCSS(fs.readFileSync(path.join(REPO, 'excel.css'), 'utf8'));
  await js(wc, bundle() + ';__DIO_BOOT({ emojiVisible: false, panelsVisible: true });');

  await wait(12000);
  const perf = JSON.parse(
    await js(
      wc,
      'JSON.stringify({ scanMs: Math.round(__DIO.totalScanMs || 0),' +
        ' blockedMs: Math.round(__LT.total), err: __DIO.lastErr || null })'
    )
  );

  console.log(
    '       노드 ' + nodes + ' / 12초 / 스캔 ' + perf.scanMs + 'ms / 블로킹 ' + perf.blockedMs + 'ms'
  );
  check('스캔 에러 없음', perf.err, null);
  /* 게이트는 scanMs 하나만 건다.
     scanMs 는 우리 스캔 함수 안에서 performance.now 로 잰 값이라 우리 코드의
     비용에 거의 비례한다. 반면 blockedMs(long task 합계)는 같은 머신에서 도는
     다른 프로세스까지 전부 빨아들인다 — 실제로 다른 Electron 앱이 CPU 를 물고
     있을 때 425ms 가 3,362ms 로 8배 튀었다. 그건 회귀가 아니라 잡음이므로
     참고값으로만 찍고 판정에 쓰지 않는다.
     참고: 구조를 고치기 전에는 같은 픽스처에서 스캔 9,800ms 였다.
     아래 한계는 느린 머신에서도 안 흔들리되, 예전 구조(모든 변이마다 전체 문서
     재스캔)로 되돌아가면 반드시 걸리는 값이다. */
  checkAtMost('스캔 누적 시간(ms)', perf.scanMs, 4000);

  // 변화를 멈추고 디바운스가 소화된 뒤에 정확성을 본다
  await js(wc, '__stopDriver()');
  await wait(1200);
  const fresh = await js(
    wc,
    '[...document.querySelectorAll("li[id^=chat-messages]")].slice(-5)' +
      '.every(r => r.querySelector(".dio-emoji-text"))'
  );
  check('최신 메시지까지 처리됨', fresh, true);
}

/* ---------------- 실행 ---------------- */
app.whenReady().then(async () => {
  const done = (c) => {
    try { app.exit(c); } catch { process.exit(c); }
  };
  const guard = setTimeout(() => {
    console.log('\n시간 초과');
    done(2);
  }, 150000);

  try {
    await testBundle();
    const w = makeWindow();
    await testMasking(w.webContents);
    await testExpand(w.webContents);
    await testPerf(w.webContents);
    clearTimeout(guard);
    console.log(
      '\n검사 ' + checks + '개 · 실패 ' + failures + ' — ' + (failures ? 'FAIL' : 'PASS')
    );
    done(failures ? 1 : 0);
  } catch (e) {
    clearTimeout(guard);
    console.log('\n러너 예외: ' + (e && e.stack ? e.stack : e));
    done(1);
  }
});

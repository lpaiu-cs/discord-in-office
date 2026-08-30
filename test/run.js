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

async function boot(wc, fixture, cfg, before) {
  await wc.loadFile(path.join(FIX, fixture));
  await js(wc, 'window.__ready || true');
  await js(wc, PROBE);
  // 부팅 전에 페이지를 손볼 기회 (예: 받을 수 없는 시트를 끼워 넣기)
  if (before) await js(wc, before);
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
  /* 이니셜 박스도 결국 자리를 차지한다. 채팅에서는 닉네임만 남기는 게 낫다 —
     멤버·친구 목록에서는 누구인지 구분해야 하므로 거기선 그대로 둔다. */
  check(
    '채팅 목록에서는 이니셜 박스도 안 보임',
    await js(wc, '[...document.querySelectorAll("li[id^=chat-messages] .dio-avatar-mask")].every(m => getComputedStyle(m).display === "none")'),
    true
  );
  check(
    '사이드바 마스크는 그대로',
    await js(wc, '__vis(".voiceUser__v .dio-avatar-mask")'),
    'visible'
  );
  check('채널 설명 감춤', await js(wc, '__vis(".topic__9293f")'), 'hidden');
  /* 아바타를 없애도 그 자리를 비워두는 여백이 남는다(디스코드는 아바타를
     절대배치하고 본문에 큰 padding-left 를 준다). 클래스명을 넘겨짚지 않고
     실측으로 찾아 지운다. */
  check(
    '아바타 자리 여백 제거',
    await js(wc, 'getComputedStyle(document.getElementById("chat-messages-1-1")).paddingLeft'),
    '0px'
  );

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

  /* 서버·채널 이름은 모드와 무관하게 항상 가려야 한다.
     여기(숨김 모드)와 아래 '보이기 복원' 양쪽에서 확인한다. */
  console.log('\n[크롬] 서버·채널 이름');
  check('상단 바(서버 이름) 감춤', await js(wc, '__vis(".title_c38106")'), 'hidden');
  check('채널 이름 감춤', await js(wc, '__vis(".title__9293f")'), 'hidden');
  check(
    '검색 문구에서 서버 이름 제거',
    await js(wc, 'document.querySelector(".search__49676").textContent.trim()'),
    '검색'
  );
  check(
    '입력 안내문에서 채널 이름 제거',
    await js(wc, 'document.querySelector(".placeholder__1b31f").textContent.trim()'),
    '값을 입력하십시오'
  );
  /* 검색 결과 패널도 클래스에 search 가 들어간다. 그 안의 실제 메시지가 우연히
     "…검색" 으로 끝난다고 안내문으로 오인해 덮어쓰면 대화 내용이 사라진다. */
  check(
    '검색 결과의 실제 메시지는 건드리지 않음',
    await js(wc, 'document.querySelector(".messageContent__r2").textContent.trim()'),
    '자료 검색'
  );
  check(
    '결과가 하나뿐인 패널도 건드리지 않음',
    await js(wc, 'document.querySelector(".messageContent__r5").textContent.trim()'),
    '회의록 검색'
  );

  /* 디스코드 서버·채널 이름은 100자까지 만들 수 있다. 안내문 길이에 임의의
     상한을 두면 그런 이름에서 그대로 노출된다 — 이름을 항상 가린다는 계약이
     현실적인 입력에서 깨지는 것이라 반드시 확인한다. */
  await js(
    wc,
    [
      'const long = "가".repeat(100);',
      'document.querySelector(".search__49676 span span").textContent = long + " 검색";',
      'document.querySelector(".placeholder__1b31f").textContent =',
      '  "#" + "나".repeat(100) + "에 메시지 보내기";',
      'true;'
    ].join('\n')
  );
  await wait(600);
  check(
    '100자 서버 이름도 가려짐',
    await js(wc, 'document.querySelector(".search__49676").textContent.trim()'),
    '검색'
  );
  check(
    '100자 채널 이름도 가려짐',
    await js(wc, 'document.querySelector(".placeholder__1b31f").textContent.trim()'),
    '값을 입력하십시오'
  );
  check(
    '검색창 아이콘은 남아 있음',
    await js(wc, '!!document.querySelector(".search__49676 svg")'),
    true
  );

  /* React 는 서버·채널을 옮길 때 텍스트 노드를 그대로 둔 채 nodeValue 만
     갈아끼우기도 한다. 그건 characterData 변이라 addedNodes 가 없어서
     childList 만 보는 스케줄러는 스캔을 예약하지 않는다. 4초 백업 스캔이
     돌기 전까지 서버 이름이 그대로 보이면 "항상 가린다" 는 계약이 깨진다.
     아래 대기 시간은 백업 주기(4초)보다 한참 짧게 잡았다. */
  await js(
    wc,
    [
      'const s = [...document.querySelectorAll(".search__49676 *")]',
      '  .find(e => [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()));',
      's.firstChild.nodeValue = "다른서버 검색";',
      'true;'
    ].join('\n')
  );
  await wait(500);
  check(
    '텍스트 노드만 갱신돼도 즉시 다시 가림',
    await js(wc, 'document.querySelector(".search__49676").textContent.trim()'),
    '검색'
  );

  /* React 는 텍스트만 바꾸는 게 아니라 안쪽 요소를 통째로 갈아끼우기도 한다.
     관측을 leaf 요소에 걸어 두면 그 순간 분리된 옛 노드만 계속 보게 되고,
     증분 스캔은 조상 컨테이너까지 올라가지 않아 새 요소를 찾지 못한다.
     그래서 관측은 클래스가 안정적인 컨테이너에 걸어야 한다. */
  await js(
    wc,
    [
      'const box = document.querySelector(".search__49676 > div");',
      'box.innerHTML = "<span><span>다른서버 검색</span></span>";',
      'true;'
    ].join('\n')
  );
  await wait(500);
  check(
    '안쪽 요소가 통째로 교체돼도 즉시 다시 가림',
    await js(wc, 'document.querySelector(".search__49676").textContent.trim()'),
    '검색'
  );

  /* 단축키만 있으면 지금 눌려 있는지 알 수 없고, 단축키를 모르면 쓰지도 못한다.
     리본에 상태가 보이는 버튼이 있어야 한다. */
  /* 나를 부른 메시지의 주황빛 강조와, 역할 색·그라데이션 닉네임.
     워크시트에서 가장 먼저 눈에 띄는 것들이라 색을 통일한다. */
  console.log('\n[색] 멘션 강조와 닉네임');
  const bg = (sel, pseudo) =>
    js(wc, 'getComputedStyle(document.querySelector("' + sel + '")' +
      (pseudo ? ', "' + pseudo + '"' : '') + ').backgroundColor');

  check('멘션 메시지 배경이 흰색', await bg('#chat-messages-1-5'), 'rgb(255, 255, 255)');
  check('멘션 내부 강조도 제거', await bg('.mentionedWrap__m2'), 'rgba(0, 0, 0, 0)');
  check('멘션 오버레이(::after) 제거', await bg('#chat-messages-1-5', '::after'), 'rgba(0, 0, 0, 0)');
  /* 행번호는 li 의 ::before 로 그린다. 멘션 강조를 지우다 그것까지 지우면
     엑셀 눈금이 그 줄만 사라진다 — 실제로 부딪히는 자리라 같이 본다. */
  check(
    '행번호 눈금은 살아 있음',
    await bg('#chat-messages-1-5', '::before'),
    'rgb(239, 239, 239)'
  );

  check(
    '역할 색 닉네임이 검정',
    await js(wc, 'getComputedStyle(document.querySelector("#chat-messages-1-1 .username__y")).color'),
    'rgb(51, 51, 51)'
  );
  /* 그라데이션 닉네임은 background-clip:text + -webkit-text-fill-color:transparent
     로 그린다. color 만 덮으면 글자가 여전히 그라데이션으로 나온다. */
  check(
    '그라데이션 닉네임도 검정',
    await js(wc, 'getComputedStyle(document.querySelector(".gradientName__g1")).webkitTextFillColor'),
    'rgb(51, 51, 51)'
  );
  check(
    '그라데이션 배경 제거',
    await js(wc, 'getComputedStyle(document.querySelector(".gradientName__g1")).backgroundImage'),
    'none'
  );

  console.log('\n[리본] 토글 버튼');
  check('버튼 2개 존재', await js(wc, '__count("#dio-ribbon .dio-rbtn")'), 2);
  /* 안내 문구가 실제 단축키와 어긋나면 그대로 눌러도 아무 일이 없다.
     맥은 메인 프로세스가 Cmd(input.meta)로 판정하므로 안내도 그래야 한다. */
  check(
    '윈도우 안내는 Ctrl',
    await js(wc, 'document.querySelectorAll("#dio-ribbon .dio-rbtn")[0].title.includes("Ctrl+E")'),
    true
  );
  check(
    '가리는 중이면 눌린 표시',
    await js(wc, 'document.querySelectorAll("#dio-ribbon .dio-rbtn")[0].classList.contains("dio-pressed")'),
    true
  );
  check(
    '패널이 펴져 있으면 안 눌린 표시',
    await js(wc, 'document.querySelectorAll("#dio-ribbon .dio-rbtn")[1].classList.contains("dio-pressed")'),
    false
  );
  // 브리지가 없는 픽스처에서는 로컬 토글로 떨어진다 — 화면은 바뀌어야 한다
  await js(wc, 'document.querySelectorAll("#dio-ribbon .dio-rbtn")[1].click()');
  await wait(400);
  check('패널 버튼 클릭이 먹음', await js(wc, '__vis(".guilds__a1")'), 'hidden');
  check(
    '클릭 후 눌린 표시로 바뀜',
    await js(wc, 'document.querySelectorAll("#dio-ribbon .dio-rbtn")[1].classList.contains("dio-pressed")'),
    true
  );
  await js(wc, 'document.querySelectorAll("#dio-ribbon .dio-rbtn")[1].click()');
  await wait(400);
  check('다시 눌러 원복', await js(wc, '__vis(".guilds__a1")'), 'visible');

  // 맥으로 부팅하면 같은 버튼이 Cmd 로 안내해야 한다
  await boot(wc, 'masking.html', { emojiVisible: false, panelsVisible: true, isMac: true });
  const titles = await js(
    wc,
    '[...document.querySelectorAll("#dio-ribbon .dio-rbtn")].map(b => b.title).join(" | ")'
  );
  check('맥 안내는 Cmd 기호', titles.indexOf('⌘E') > -1 && titles.indexOf('⌘⇧B') > -1, true);
  check('맥 안내에 Ctrl 없음', titles.indexOf('Ctrl') === -1, true);

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
  // 여백 제거는 숨김 모드 한정이다 — 보이기로 돌아오면 아바타가 다시 그 자리에 온다
  check(
    '보이기 모드에서는 여백 복원',
    await js(wc, 'getComputedStyle(document.getElementById("chat-messages-1-1")).paddingLeft'),
    '72px'
  );

  /* 표시를 붙인 뒤 디스코드가 같은 노드의 레이아웃을 바꾸면(반응형·표시 모드),
     낡은 표시가 의미 있는 들여쓰기까지 0 으로 지운다.
     보이기 모드에서는 우리 규칙이 꺼져 있어 원래 값을 읽을 수 있으니 그때 뗀다. */
  await js(
    wc,
    'document.getElementById("chat-messages-1-1").style.paddingLeft = "16px"; true;'
  );
  await js(wc, '__DIO.scan()');
  await wait(500);
  check(
    '레이아웃이 바뀌면 낡은 표시를 뗌',
    await js(wc, 'document.getElementById("chat-messages-1-1").classList.contains("dio-nogutter")'),
    false
  );
  await js(wc, 'window.__dioSetEmoji(false)');
  await wait(700);
  check(
    '다시 숨겨도 의미 있는 여백은 지우지 않음',
    await js(wc, 'getComputedStyle(document.getElementById("chat-messages-1-1")).paddingLeft'),
    '16px'
  );

  /* 위 검사가 숨김 모드로 되돌려 놓았다. 아래는 "모드와 무관하게 항상 가린다"
     를 보는 검사이므로 반드시 보이기 모드로 돌아와야 한다.
     안 그러면 서버·채널 이름 가림이 실수로 .dio-hide 에 묶여도 통과해 버린다. */
  await js(wc, 'window.__dioSetEmoji(true)');
  await wait(700);
  check('보이기 모드로 복귀했는지', await js(wc, '__DIO.visible'), true);
  check(
    '보이기 모드다 (콘텐츠가 실제로 보인다)',
    await js(wc, '__vis(".stickerAsset__s2")'),
    'visible'
  );

  // 이건 "항상 적용"이라 보이기 모드로 돌아와도 그대로 가려져 있어야 한다
  check('보이기 모드에서도 서버 이름 감춤', await js(wc, '__vis(".title_c38106")'), 'hidden');
  check('보이기 모드에서도 채널 이름 감춤', await js(wc, '__vis(".title__9293f")'), 'hidden');
  check(
    '보이기 모드에서도 검색 문구 유지',
    await js(wc, 'document.querySelector(".search__49676").textContent.trim()'),
    '검색'
  );
  check(
    '보이기 모드에서도 입력 안내문 유지',
    await js(wc, 'document.querySelector(".placeholder__1b31f").textContent.trim()'),
    '값을 입력하십시오'
  );
}

/* ---------------- 라이트 토큰 재수집 판정 ---------------- */
async function testLightRefresh(wc) {
  /* 캐시가 있어도 매번 다시 모으면 시트 수백 장(2.8MB)을 또 받아 온다.
     그게 "실행할 때마다 30초쯤에 렉이 걸린다" 의 정체였다.
     디스코드 자산 URL 에 내용 해시가 들어 있으니, 시트 목록 지문이 그대로면
     받아보지 않고 건너뛰어야 한다. */
  console.log('\n[테마] 캐시 재수집 판정');

  // 지문이 다르면 다시 모아야 한다
  await boot(wc, 'masking.html', {
    emojiVisible: false,
    panelsVisible: true,
    lightCached: true,
    lightFp: '999-zzzz',
    lightRefreshMs: 300
  });
  await wait(900);
  check('지문이 다르면 건너뛰지 않음', await js(wc, '!!__DIO.lightRefreshSkipped'), false);

  const fp = await js(wc, '__DIO.lightFpNow || ""');
  check('현재 지문을 계산함', /^[0-9]+-[a-z0-9]+$/.test(fp), true);

  // 같은 지문이면 통째로 건너뛴다 — 여기서 네트워크를 아낀다
  await boot(wc, 'masking.html', {
    emojiVisible: false,
    panelsVisible: true,
    lightCached: true,
    lightFp: fp,
    lightRefreshMs: 300
  });
  await wait(900);
  check('지문이 같으면 재수집을 건너뜀', await js(wc, '!!__DIO.lightRefreshSkipped'), true);
  check('수집 문도 열리지 않음', await js(wc, '!!__DIO.lightAllowed'), false);

  /* 지문은 "이 토큰을 실제로 만들어낸 시트 목록" 에만 붙어야 한다.
     일부 시트를 못 받았는데도 지문을 남기면, 다음 실행이 불완전한 캐시를
     정상으로 믿고 영영 재수집을 건너뛴다. */
  console.log('\n[테마] 수집이 온전할 때만 지문을 남긴다');
  await boot(wc, 'masking.html', { emojiVisible: false, panelsVisible: true, lightStartMs: 150 });
  await wait(1200);
  check('시트를 다 받으면 수집 성공', await js(wc, '!!__DIO.lightCssApplied'), true);
  check('픽스처 토큰이 추출됨', await js(wc, '__DIO.lightTokenCount > 0'), true);
  check('온전하므로 지문을 남김', await js(wc, '!!__DIO.lightComplete'), true);
  check('지문 형식', await js(wc, '/^[0-9]+-[a-z0-9]+$/.test(__DIO.lightFp || "")'), true);

  // 받을 수 없는 시트를 하나 끼워 넣으면 결과가 불완전하다
  await boot(
    wc,
    'masking.html',
    { emojiVisible: false, panelsVisible: true, lightStartMs: 150 },
    [
      'const bad = document.createElement("link");',
      'bad.rel = "stylesheet";',
      'bad.href = "does-not-exist.css";',
      'document.head.appendChild(bad);',
      'true;'
    ].join('\n')
  );
  await wait(1200);
  check('일부를 못 받으면 불완전으로 표시', await js(wc, '!!__DIO.lightComplete'), false);
  check('지문을 비워 다음 실행이 다시 확인하게', await js(wc, '__DIO.lightFp'), '');
}

/* ---------------- 백업 전체 스캔 ---------------- */
async function testBackupScan(wc) {
  /* 백업 전체 스캔은 한가할 때 돌아야 한다. wantFull 을 예약 시점에 세우면
     idle 콜백 전에 온 변이가 그 전체 스캔을 사용자 입력 중에 돌려버리고,
     뒤늦은 idle 콜백이 빈 pending 으로 한 번 더 전체 스캔을 돌린다. */
  console.log('\n[스캔] 백업 전체 스캔이 겹치지 않는지');
  await wc.loadFile(path.join(FIX, 'chat.html'));
  await wait(1000);
  await wc.insertCSS(fs.readFileSync(path.join(REPO, 'excel.css'), 'utf8'));
  await js(wc, bundle() + ';__DIO_BOOT({ emojiVisible: false, panelsVisible: true });');

  /* idle 이 나지 않게 메인 스레드를 계속 붙잡는다 — 버그가 필요로 하는
     "간격 발화 ~ idle 콜백" 창을 실제로 만든다. */
  await js(wc, 'window.__busy = setInterval(() => { const e = performance.now() + 70; while (performance.now() < e) {} }, 100); true;');
  await wait(21000); // 백업 주기 4초 × 5회분 — 차이가 배로 벌어져야 잡힌다
  await js(wc, 'clearInterval(window.__busy); true;');
  const full = await js(wc, '__DIO.fullScans || 0');
  await js(wc, '__stopDriver()');
  console.log('       21초 동안 전체 스캔 ' + full + '회');
  /* 실측으로 잡은 값이다. 바쁜 상태에서 고친 버전은 3회(부팅 1 + 백업 2),
     wantFull 을 예약 시점에 세우는 버그 버전은 4회가 나온다.
     한가한 픽스처에서는 둘 다 4회라 구분이 안 됐다 — 그래서 위에서 메인
     스레드를 붙잡아 idle 이 밀리는 실제 조건을 만든다. */
  checkAtMost('전체 스캔이 겹쳐 돌지 않음', full, 6);
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
  /* 펼친 사진을 다시 눌러도 접히지만 그걸 알 방법이 없다.
     임베드처럼 보이는 접기 컨트롤이 남아야 한다. */
  check(
    '펼친 뒤 접기 버튼이 보임',
    await js(wc, '__vis("#chat-messages-1-3 .dio-viewbtn")'),
    'visible'
  );
  check(
    '접기 버튼 문구',
    await js(wc, 'document.querySelector("#chat-messages-1-3 .dio-viewbtn").textContent.trim()'),
    '사진 접기'
  );
  await js(wc, 'document.querySelector("#chat-messages-1-3 .dio-viewbtn").click()');
  await wait(500);
  check('접기 버튼으로 접힘', await js(wc, '__vis("#chat-messages-1-3 .lazyImg__i2")'), 'hidden');
  await js(wc, 'document.querySelector("#chat-messages-1-3 .dio-viewbtn").click()');
  await wait(500);
  check('다시 펼침', await js(wc, '__vis("#chat-messages-1-3 .lazyImg__i2")'), 'visible');

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
    await testLightRefresh(w.webContents);
    await testBackupScan(w.webContents);
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

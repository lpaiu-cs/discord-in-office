/* [번들 조각 5/7] 접기/펼치기 공통 골격과 펼침 상태 저장소
   src/*.js 는 파일명 순서대로 이어붙여져 하나의 IIFE 로 주입된다 (bundle.js).
   조각 하나만 보면 괄호가 맞지 않으므로 node --check 가 통하지 않는다.
   문법 검사는 이어붙인 번들 전체에 대해 하고, npm test 가 그걸 확인한다.
   앞의 번호가 곧 순서다 — 바꾸면 깨진다. */
  /* ---------- 공용: 라벨/버튼 치환 ---------- */
  function ensureLabel(target, cls, onCreate) {
    cls = cls || 'dio-emolabel';
    const key = cls.split(' ')[0];
    let lab = target.nextElementSibling;
    if (!lab || !lab.classList.contains(key)) {
      lab = document.createElement('span');
      lab.className = cls;
      if (onCreate) onCreate(lab, target);
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

  /* ---------- 접기/펼치기 공통 골격 ----------
     스티커·임베드·사진이 같은 흐름을 각자 구현하고 있었고, 그 미묘한 차이가
     실제로 버그를 냈다: 임베드 토글은 노드를 클로저로 잡아 리렌더 후 죽었고,
     사진 버튼은 display 복원값이 틀려 0x0 으로 남아 눌리지 않았다.
     흐름을 한 곳으로 모으고, 패스별 진짜 차이만 옵션으로 남긴다.

     spec:
       box(node)        펼침 플래그를 기록할 요소. 없으면 node 자신.
                        캐러셀처럼 여러 node 가 한 box 를 공유하면 첫 노드만
                        라벨을 달고 나머지는 표시 상태만 따라간다.
       text(node, box)  접혔을 때 라벨에 넣을 문자열
       labelClass       라벨 클래스 (기본 dio-emolabel)
       labelShow        라벨을 보일 때 쓸 display 값. .dio-emolabel/.dio-viewbtn
                        둘 다 CSS 기본이 display:none 이라 반드시 명시해야 한다.
       title            라벨 title 속성
       collapseBack     펼친 원본을 다시 눌러 접을 수 있게 할지
       onCreate(label, node)             라벨 생성 시 1회
       onState(node, box, show, label)   크기 접기 등 패스별 추가 처리 */
  /* ---------- 펼침 상태 저장소 ----------
     예전에는 펼침 여부를 box.dataset.dioExpanded 에 넣었다. 그런데 디스코드
     메시지 목록은 가상 스크롤이라 화면 밖으로 나간 메시지의 DOM 을 통째로 버리고
     되돌아올 때 새로 만든다. dataset 도 같이 날아가서, 펼쳐둔 사진이 스크롤
     한 번에 도로 접혔다.
     메시지 id + 내용 식별자를 키로 바깥에 들고 있으면 노드가 갈려도 살아남는다. */
  const expanded = new Set();

  /* 노드가 바뀌어도 같은 값이 나와야 한다 — 그래서 DOM 위치가 아니라
     메시지가 실어 나르는 내용(이미지 주소 · 링크 · 텍스트)에서 뽑는다. */
  function identOf(box) {
    const media = box.matches('img, video, canvas')
      ? box
      : box.querySelector('img, video, canvas');
    const src = media && (media.currentSrc || media.src);
    if (src) return src;
    const a = box.querySelector('a[href]');
    if (a) return a.href;
    return (box.textContent || '').trim().slice(0, 64);
  }

  function keyOf(spec, box) {
    const msg = box.closest(SEL.msg);
    return (msg ? msg.id : '') + '|' + spec.name + '|' + identOf(box);
  }

  function toggleBox(spec, box) {
    const k = keyOf(spec, box);
    if (expanded.has(k)) expanded.delete(k);
    else expanded.add(k);
    fullScan();
  }

  const boxOf = (spec, node) => (spec.box && spec.box(node)) || node;

  function collapsible(nodes, spec) {
    const leads = new Set();
    for (const node of nodes) {
      const box = boxOf(spec, node);
      const show = DIO.visible || expanded.has(keyOf(spec, box));

      // 묶음의 두 번째 이후 노드 — 대표가 라벨을 가지므로 표시만 맞춘다
      if (leads.has(box)) {
        setDisplay(node, show);
        continue;
      }
      leads.add(box);

      const lab = ensureLabel(node, spec.labelClass, spec.onCreate);
      if (!lab.dataset.dioToggle) {
        lab.dataset.dioToggle = '1';
        if (spec.title) lab.title = spec.title;
        lab.addEventListener('click', (e) => {
          e.stopPropagation();
          e.preventDefault();
          if (DIO.visible) return;
          // 노드를 클로저로 잡으면 디스코드가 리렌더한 뒤 이미 문서에서 떨어져
          // 나간 노드를 만지게 된다. 클릭 시점에 형제에서 다시 찾는다.
          const cur = e.currentTarget.previousElementSibling;
          if (cur) toggleBox(spec, boxOf(spec, cur));
        });
      }
      if (spec.collapseBack && !node.dataset.dioToggle) {
        node.dataset.dioToggle = '1';
        node.addEventListener('click', (e) => {
          if (DIO.visible) return;
          const b = boxOf(spec, e.currentTarget);
          if (!expanded.has(keyOf(spec, b))) return;
          e.stopPropagation();
          toggleBox(spec, b);
        });
      }

      /* 펼친 상태에서 라벨을 감추면 다시 접을 방법이 없어진다.
         스티커·사진은 collapseBack 으로 원본을 눌러 접지만, 임베드는 안에 제목
         링크가 있어 원본 클릭을 가로챌 수 없다. 그런 패스는 라벨을 접기
         컨트롤로 남긴다(keepLabel). */
      const reopened = !DIO.visible && show; // 숨김 모드인데 펼쳐둔 상태
      const keep = reopened && spec.keepLabel;
      const desc = keep ? spec.collapseText || '[접기]' : spec.text(node, box);
      if (lab.textContent !== desc) lab.textContent = desc;

      setDisplay(node, show);
      const labVal = show && !keep ? 'none' : spec.labelShow || 'inline';
      if (lab.style.display !== labVal) lab.style.display = labVal;

      // excel.css 의 cursor:zoom-out 규칙이 이 속성을 본다.
      // 상태의 근거는 위 Set 이고, 이건 표시용 미러일 뿐이다.
      if (!DIO.visible && show) node.dataset.dioExpanded = '1';
      else delete node.dataset.dioExpanded;

      if (spec.onState) spec.onState(node, box, show, lab);
    }
  }

  /* 접힌 자리를 한 줄 높이로 눌러 원본이 차지하던 공간을 없앤다.
     원래 값은 dataset 에 넣어뒀다가 펼칠 때 되돌린다. */
  function collapseHeight(el, show, px) {
    if (!el) return;
    if (!show) {
      if (el.dataset.dioH === undefined) el.dataset.dioH = el.style.height || '';
      if (el.style.height !== px) el.style.height = px;
    } else if (el.dataset.dioH !== undefined) {
      el.style.height = el.dataset.dioH;
      delete el.dataset.dioH;
    }
  }

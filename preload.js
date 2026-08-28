/* 리본 버튼 → 메인 프로세스 통로.

   주입 스크립트는 페이지의 메인 월드에서 돌기 때문에 ipcRenderer 에 직접 닿지
   못한다(contextIsolation 을 켠 채로 두려면 그래야 한다). 여기서 노출한 것만
   window.dioBridge 로 보인다.

   단축키와 메뉴는 이미 메인 프로세스가 처리하므로, 버튼도 같은 곳으로 보내야
   설정 저장·메뉴 라벨 갱신이 한 경로로 모인다. 렌더러에서 혼자 토글하면
   그 둘이 어긋난다. */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('dioBridge', {
  toggleEmoji: () => ipcRenderer.send('dio:toggle-emoji'),
  togglePanels: () => ipcRenderer.send('dio:toggle-panels'),
  /* 20초짜리 토큰 수집을 매번 되풀이하지 않도록 결과를 저장해 둔다.
     완성된 CSS 가 아니라 토큰 이름·값만 넘긴다 — 이 페이지는 원격 콘텐츠라
     한 번이라도 오염되면 임의 CSS 가 파일로 남아 다음 실행부터 계속 적용된다.
     CSS 문자열 조립은 메인 프로세스가 한다. */
  saveLightTokens: (tokens) => ipcRenderer.send('dio:save-light-tokens', tokens)
});

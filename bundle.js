/* src/*.js 를 파일명 순서대로 이어붙여 주입용 소스 한 덩어리로 만든다.

   조각들은 하나의 IIFE 를 나눠 가지므로 순서가 곧 문법이다 — 파일명 앞의 번호를
   바꾸거나 사이에 파일을 끼워 넣으면 깨진다. 대신 조각을 따로 검사할 수 없으니,
   테스트가 번들 전체를 파싱해서 확인한다.

   main.js(주입)와 test/(검증)가 같은 함수를 쓴다. 디버그 반복을 위해 호출할
   때마다 디스크에서 새로 읽는다. */
const fs = require('node:fs');
const path = require('node:path');

const SRC = path.join(__dirname, 'src');

module.exports = function bundle() {
  return fs
    .readdirSync(SRC)
    .filter((f) => f.endsWith('.js'))
    .sort()
    .map((f) => fs.readFileSync(path.join(SRC, f), 'utf8'))
    .join('\n');
};

# ASCII Christmas

문구를 입력하면 글자들이 모여 크리스마스 트리가 되는 웹사이트 (React + TypeScript + Vite).

```sh
npm install
npm run dev     # 개발 서버
npm run build   # 타입 체크 + 프로덕션 빌드
npm run check   # 공유 링크 파서 검증
```

- `src/tree/scene.ts` — 캔버스 애니메이션 (문구 모자이크 → 트리, 눈, 가랜드, 별)
- `src/tree/code.ts` — 에디터에 타이핑되는 파이썬 코드 타임라인
- `src/tree/link.ts` — `#tree=…&seed=…` 공유 링크 인코딩/파싱
- `src/tree/gif.ts` — 의존성 없는 GIF 인코더

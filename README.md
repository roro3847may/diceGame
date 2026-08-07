# 끝없는 원정

혼자 플레이하는 솔로 TRPG 스타일 웹 게임입니다. 3인 또는 5인 파티를 만들고, 물리/민첩/마법 속성과 탱커/딜러/힐러 직업 조합으로 끝없는 스테이지에 도전합니다.

## 실행

```bash
npm install
npm run dev
```

로컬 주소는 보통 `http://localhost:3000` 입니다.

## 빌드

```bash
npm run build
```

## Render 배포

이 저장소에는 `render.yaml`이 포함되어 있습니다. GitHub에 저장소를 올린 뒤 Render에서 `New +` → `Blueprint` 또는 `Web Service`로 이 저장소를 연결하면 됩니다.

권장 설정:

- Build Command: `npm install && npm run build`
- Start Command: `npm run start`
- Node Version: `22.13.0`

## 게임 규칙 요약

- 모든 캐릭터 기본 체력은 10입니다.
- 속성은 물리, 민첩, 마법 중 하나입니다.
- 직업은 탱커, 딜러, 힐러 중 하나입니다.
- 같은 속성의 장비만 착용할 수 있습니다.
- 투구, 갑옷, 신발은 최대 체력을 올립니다.
- 무기는 주사위 최종값에 배율을 곱합니다.
- 스테이지가 끝나면 체력은 모두 회복되고 실드는 제거됩니다.

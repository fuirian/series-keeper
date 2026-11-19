# 1주차 — 크리에이터 불편 조사 (공개 자료 기반)

> 조사 방법: 설문·인터뷰 대신 **공개된 가이드·블로그·기사**를 읽고 정리했다. (2026-11-19)
> 한계: 찾은 자료 대부분이 AI 영상 도구 회사의 블로그라 홍보 성격이 있고, 크리에이터가 직접 쓴 경험담은 적다. 5주차 사용자 테스트에서 실제 반응으로 검증해야 한다.

## 요약

1. **일관성은 여전히 해결되지 않은 문제다.** 2026년 기준 어떤 모델도 여러 클립에 걸쳐 완벽한 캐릭터 일관성을 보장하지 못한다는 게 공통된 설명이다. 연재물은 같은 인물이 계속 나오기 때문에 작은 차이가 회차를 거치며 쌓인다.
2. **검수는 지금 사람이 눈으로 한다.** 몇 컷씩 나란히 놓고 비교하거나, 새 프레임을 캐릭터 시트와 하나하나 대조하는 방식이 주로 소개된다. → **SeriesKeeper가 자동화하려는 바로 그 단계.**
3. **재생성은 일상적인 비용이다.** 한 사례에서는 쓸 수 있는 컷 하나에 평균 3번 생성했고, 3분짜리 에피소드에 클립 164개가 들었다. 문제 컷을 빨리 찾을수록 비용이 준다.
4. **해결책은 "레퍼런스 고정"으로 수렴한다.** 캐릭터·의상·장소·소품 레퍼런스를 먼저 만들고 모든 생성에 붙이라는 조언이 가장 많다. → 시리즈 바이블이 이 레퍼런스의 저장소 역할을 하면 자연스럽다.

## 크리에이터가 실제로 확인하는 항목

자료들에서 언급된 검수 항목을 모았다. MVP 범위 표시는 계획서 기준.

| 항목 | 예시 | 범위 |
| --- | --- | --- |
| 얼굴·정체성 | 회차마다 얼굴이 미묘하게 다른 사람이 됨 | **MVP** |
| 헤어 | 머리 길이·색 변화 | 확장 1 (CLIP) |
| 의상 | 재킷 단추가 하나 늘어남 | 확장 1 |
| 소품 | 물건을 든 손이 바뀜 | 미정 |
| 장소 배치 | 방 구조·문 위치 변화 | 확장 1 |
| 카메라 축·시선 | 촬영 축을 넘어 인물 방향이 뒤바뀜 | 확장 1 |
| 상처·이야기 상태 | 다친 상처가 다음 컷에서 사라짐 | 범위 밖 (메모로 대응?) |
| 색감 | 회차 간 색 보정 차이 | 범위 밖 |

## 제품에 반영할 점

- **바이블에 여러 각도의 레퍼런스를 받는다.** 정면 이미지만 있으면 옆·뒷모습에서 다른 사람이 된다는 지적이 있다. 비교할 때도 각도가 비슷한 레퍼런스와 맞대는 게 정확할 것. → `reference_image`에 각도(정면·측면·후면) 필드 추가 검토.
- **전신 이미지는 얼굴 기준으로 약하다.** 얼굴 크롭 레퍼런스를 따로 받거나 자동으로 잘라야 한다.
- **비슷하게 생긴 인물(쌍둥이 등)은 어려운 케이스.** 얼굴 매칭이 "누구인지"를 헷갈릴 수 있으므로, 2주차 검증에 닮은 인물 케이스를 넣는다.
- **리포트는 "나란히 비교" 화면이 핵심.** 지금 사람들이 하는 방식 그대로(레퍼런스 ↔ 문제 컷 나란히)를 보여 주면 익숙하다.
- **"단계별 승인" 습관이 있다.** 회차 전체 업로드 후 검수뿐 아니라, 컷 몇 개만 먼저 올려 확인하는 흐름도 나중에 고려할 만하다.

## 아직 모르는 것 (5주차에 확인)

- 크리에이터가 실제로 검수에 쓰는 시간 (회차당 몇 분/몇 시간?)
- 애니체·실사 중 어느 쪽 사용자가 더 많은지
- 문제 컷을 알려 주면 바로 재생성하는지, 그냥 넘기는지 (오탐 허용 정도)

## 출처

- [Morphic — Character consistency in AI video: the reference workflow](https://morphic.com/resources/how-to/character-consistency-in-ai-video)
- [Techloy — How to maintain character consistency across an AI microdrama series](https://www.techloy.com/how-to-maintain-character-consistency-across-an-ai-microdrama-series/)
- [CapCut — Character consistency across long-form AI video (early 2026)](https://www.capcut.com/create/ai-character-consistency-long-form-video-early-2026)
- [CapCut — Why characters change between scenes](https://capcut.com/create/ai-video-character-drift-prevention)
- [Higgsfield — Keep characters consistent in an AI animated series](https://higgsfield.ai/blog/keep-characters-consistent-ai-animated-series)
- [HackerNoon — How to keep an AI character's face consistent across scenes](https://hackernoon.com/how-to-keep-an-ai-characters-face-consistent-across-different-scenes)
- [invideo — How do you find and fix character continuity errors](https://invideo.io/faq/how-do-you-find-and-fix-character-continuity-errors-in/)
- [사다리필름 — AI 영상 인물 일관성 잡는 키 비주얼 제작법](https://maily.so/sadarifilm/posts/w6ovpknmok5)
- [GPTers — 영상 자동화 초기 단계 시행착오](https://www.gpters.org/media/post/trial-error-early-stages-xMeGIKyzy2bm1vg)
- [일간스포츠 — AI 숏드라마 관련 기사](https://isplus.com/article/view/isp202608130044)

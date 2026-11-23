"""생성 도구별 규칙. 도구 사양은 자주 바뀌므로 규칙은 여기 한곳에만 둔다.

1a에서는 범용(generic)만. 1b에서 테스터가 많이 쓰는 도구 2개를 추가한다
(추가할 때 참조 이미지 개수·네거티브 지원 여부를 공식 문서로 확인하고 checked 날짜를 남긴다).
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class ToolProfile:
    id: str
    label: str
    max_refs: int  # 함께 넣을 수 있는 레퍼런스 이미지 수
    separate_negative: bool  # 네거티브 프롬프트 칸이 따로 있는지 (없으면 프롬프트 끝에 붙임)
    tips: tuple[str, ...] = ()
    checked: str | None = None  # 사양을 확인한 날짜


TOOLS: dict[str, ToolProfile] = {
    "generic": ToolProfile(
        id="generic",
        label="범용",
        max_refs=4,
        separate_negative=True,
        tips=(
            "레퍼런스 이미지를 넣을 수 있는 칸(참조 이미지·캐릭터·요소 등)에 순서대로 넣으세요.",
            "네거티브 프롬프트 칸이 없는 도구라면 '피해야 할 것'을 프롬프트 끝에 붙이세요.",
            "영어 프롬프트가 대부분의 도구에서 결과가 좋습니다.",
        ),
    ),
}


def get_tool(tool_id: str) -> ToolProfile | None:
    return TOOLS.get(tool_id)

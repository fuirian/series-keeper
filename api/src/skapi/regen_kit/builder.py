"""키트 조립 (순수 함수, DB·네트워크 없음 → 테스트하기 쉽게).

AI 호출 없이 템플릿으로 조립한다. 지금 검사는 "얼굴이 덜 닮음"만 알기 때문에
"무엇을 고쳐라"가 아니라 "바이블대로 다시 그려라"가 중심이다.
"""

from dataclasses import dataclass, field

from .tools import ToolProfile

# 캐릭터 레퍼런스를 넣는 순서. 뒷모습은 얼굴이 없어 넣지 않는다
CHARACTER_REF_ORDER = ("front", "full", "side")
CHARACTER_REF_LABELS = {"front": "정면", "full": "전신", "side": "측면"}
LOCATION_REF_ORDER = ("wide", "angle1", "angle2")
LOCATION_REF_LABELS = {"wide": "와이드", "angle1": "다른 각도 1", "angle2": "다른 각도 2"}
REF_ANGLE_EN = {
    "front": "front view",
    "full": "full body",
    "side": "side view",
    "wide": "wide shot",
    "angle1": "another angle",
    "angle2": "another angle",
}

STYLE_DEFAULTS = {
    "anime": "2D anime style, consistent character design",
    "live_action": "photorealistic live-action footage",
    "other": "same art style as the rest of the series",
}

NEGATIVE_BASE = (
    "different face",
    "different hairstyle",
    "different hair color",
    "different outfit",
    "extra people",
    "distorted face",
)


@dataclass(frozen=True)
class BibleCharacter:
    id: str
    name: str
    description: str | None
    prompt: str | None
    refs: dict[str, str]  # angle → storage path (references 버킷)


@dataclass(frozen=True)
class BibleLocation:
    id: str
    name: str
    description: str | None
    prompt: str | None
    refs: dict[str, str]


@dataclass(frozen=True)
class IssueContext:
    issue_type: str  # low_similarity | ambiguous
    start_ms: int
    end_ms: int
    series_style: str
    style_note: str | None
    style_prompt: str | None


@dataclass(frozen=True)
class KitReference:
    order: int
    label: str  # 화면에 보일 이름 (예: "유나 정면")
    path: str  # references 버킷 안 경로
    kind: str  # character | location


@dataclass
class Kit:
    prompt: str
    negative_prompt: str | None
    references: list[KitReference]
    tips: list[str]
    missing: list[str] = field(default_factory=list)  # 비어서 대신 쓴 칸 (채우면 좋아지는 것)


def _clean(text: str | None) -> str | None:
    if text is None:
        return None
    text = " ".join(text.split())
    return text or None


def _pick_refs(refs: dict[str, str], order: tuple[str, ...]) -> list[tuple[str, str]]:
    return [(angle, refs[angle]) for angle in order if refs.get(angle)]


def build_kit(
    ctx: IssueContext,
    character: BibleCharacter,
    tool: ToolProfile,
    *,
    confused_with: BibleCharacter | None = None,
    location: BibleLocation | None = None,
    scene: str | None = None,
) -> Kit:
    missing: list[str] = []

    # ── 레퍼런스: 캐릭터 먼저, 장소는 남는 자리에 ──
    picked: list[tuple[str, str, str, str]] = []  # (kind, owner_name, angle, path)
    for angle, path in _pick_refs(character.refs, CHARACTER_REF_ORDER):
        picked.append(("character", character.name, angle, path))
    if not character.refs.get("front"):
        missing.append("character_front_ref")
    if location:
        for angle, path in _pick_refs(location.refs, LOCATION_REF_ORDER)[:1]:  # 장소는 한 장이면 충분
            picked.append(("location", location.name, angle, path))
    # 도구가 받는 개수만큼. 장소를 넣었으면 캐릭터를 줄여서라도 장소 한 장은 남긴다
    if len(picked) > tool.max_refs:
        has_location = picked[-1][0] == "location"
        if has_location and tool.max_refs >= 2:
            picked = picked[: tool.max_refs - 1] + [picked[-1]]
        else:
            picked = picked[: tool.max_refs]

    references = [
        KitReference(
            order=i + 1,
            label=f"{owner} {(CHARACTER_REF_LABELS if kind == 'character' else LOCATION_REF_LABELS)[angle]}",
            path=path,
            kind=kind,
        )
        for i, (kind, owner, angle, path) in enumerate(picked)
    ]

    # ── 프롬프트 ──
    lines: list[str] = []

    scene_text = _clean(scene)
    if scene_text:
        lines.append(f"Scene: {scene_text}")
    else:
        lines.append("Scene: recreate the original shot, keeping the same camera angle, framing and action.")

    char_text = _clean(character.prompt)
    if not char_text:
        missing.append("character_prompt")
        char_text = _clean(character.description)
    if not char_text:
        missing.append("character_description")
    lines.append(f"Character: {character.name}" + (f", {char_text}" if char_text else ""))

    if confused_with:
        lines.append(
            f"This must clearly be {character.name}, not {confused_with.name}. "
            f"Do not mix in {confused_with.name}'s facial features or hairstyle."
        )

    if location:
        loc_text = _clean(location.prompt)
        if not loc_text:
            missing.append("location_prompt")
            loc_text = _clean(location.description)
        lines.append(f"Location: {location.name}" + (f", {loc_text}" if loc_text else ""))

    style_text = _clean(ctx.style_prompt)
    if not style_text:
        missing.append("style_prompt")
        style_text = STYLE_DEFAULTS.get(ctx.series_style, STYLE_DEFAULTS["other"])
        note = _clean(ctx.style_note)
        if note:
            style_text = f"{style_text}, {note}"
    lines.append(f"Style: {style_text}")

    if references:
        ref_list = ", ".join(
            f"image {i + 1} = {owner} {REF_ANGLE_EN[angle]}" for i, (_, owner, angle, _) in enumerate(picked)
        )
        lines.append(
            f"Reference images: {ref_list}. Match the character in the reference images exactly: "
            "same face, hairstyle, hair color and outfit."
        )
    else:
        lines.append("Keep the character's face, hairstyle, hair color and outfit consistent with previous episodes.")

    negative_items = list(NEGATIVE_BASE)
    if confused_with:
        negative_items.append(f"looking like {confused_with.name}")
    negative = ", ".join(negative_items)

    if tool.separate_negative:
        prompt, negative_prompt = "\n".join(lines), negative
    else:
        prompt, negative_prompt = "\n".join([*lines, f"Avoid: {negative}."]), None

    return Kit(
        prompt=prompt,
        negative_prompt=negative_prompt,
        references=references,
        tips=list(tool.tips),
        missing=missing,
    )

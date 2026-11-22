"""키트 조립 (순수 함수)."""

from dataclasses import replace

from skapi.regen_kit import BibleCharacter, BibleLocation, IssueContext, ToolProfile, build_kit, get_tool

YUNA = BibleCharacter(
    id="c1",
    name="유나",
    description="단발 검은 머리, 동그란 안경",
    prompt="young woman, shoulder-length straight black hair, round glasses, navy cardigan",
    refs={"front": "u/s/c1/front.jpg", "side": "u/s/c1/side.jpg", "back": "u/s/c1/back.jpg", "full": "u/s/c1/full.jpg"},
)
MINHO = BibleCharacter(id="c2", name="민호", description=None, prompt=None, refs={"front": "u/s/c2/front.jpg"})
ROOFTOP = BibleLocation(
    id="l1",
    name="옥탑방",
    description="창가 책상",
    prompt="small rooftop room, wooden desk by the window",
    refs={"wide": "u/s/l1/wide.jpg", "detail": "u/s/l1/detail.jpg"},
)
CTX = IssueContext(
    issue_type="low_similarity",
    start_ms=12000,
    end_ms=15000,
    series_style="anime",
    style_note=None,
    style_prompt=None,
)
GENERIC = get_tool("generic")


def test_uses_character_prompt_and_reference_order():
    kit = build_kit(CTX, YUNA, GENERIC)

    assert "Character: 유나, young woman, shoulder-length straight black hair" in kit.prompt
    # 정면 → 전신 → 측면, 뒷모습은 빠짐
    assert [r.label for r in kit.references] == ["유나 정면", "유나 전신", "유나 측면"]
    assert [r.order for r in kit.references] == [1, 2, 3]
    assert all("back" not in r.path for r in kit.references)
    assert "image 1 = 유나 front view" in kit.prompt
    assert kit.negative_prompt and "different hair color" in kit.negative_prompt


def test_falls_back_to_description_and_reports_missing():
    no_prompt = replace(YUNA, prompt=None)
    kit = build_kit(CTX, no_prompt, GENERIC)

    assert "Character: 유나, 단발 검은 머리, 동그란 안경" in kit.prompt
    assert "character_prompt" in kit.missing
    assert "style_prompt" in kit.missing
    assert "Style: 2D anime style" in kit.prompt


def test_empty_bible_still_makes_a_kit():
    kit = build_kit(CTX, MINHO, GENERIC)

    assert "Character: 민호\n" in kit.prompt
    assert {"character_prompt", "character_description"} <= set(kit.missing)
    assert [r.label for r in kit.references] == ["민호 정면"]


def test_missing_front_ref_is_reported():
    kit = build_kit(CTX, replace(MINHO, refs={}), GENERIC)
    assert kit.references == []
    assert "character_front_ref" in kit.missing
    assert "consistent with previous episodes" in kit.prompt


def test_ambiguous_issue_names_the_confused_character():
    ctx = replace(CTX, issue_type="ambiguous")
    kit = build_kit(ctx, YUNA, GENERIC, confused_with=MINHO)

    assert "clearly be 유나, not 민호" in kit.prompt
    assert "looking like 민호" in kit.negative_prompt


def test_location_and_scene_and_style_prompt():
    ctx = replace(CTX, style_prompt="soft cel shading, pastel palette")
    kit = build_kit(ctx, YUNA, GENERIC, location=ROOFTOP, scene="  유나가 창밖을   본다 ")

    assert kit.prompt.startswith("Scene: 유나가 창밖을 본다")
    assert "Location: 옥탑방, small rooftop room" in kit.prompt
    assert "Style: soft cel shading, pastel palette" in kit.prompt
    assert "style_prompt" not in kit.missing
    # 4장 한도: 캐릭터 3장 + 장소 와이드 1장
    assert [r.label for r in kit.references] == ["유나 정면", "유나 전신", "유나 측면", "옥탑방 와이드"]


def test_ref_limit_keeps_one_location_image():
    small = ToolProfile(id="t", label="t", max_refs=2, separate_negative=True)
    kit = build_kit(CTX, YUNA, small, location=ROOFTOP)
    assert [r.label for r in kit.references] == ["유나 정면", "옥탑방 와이드"]
    assert [r.order for r in kit.references] == [1, 2]


def test_tool_without_negative_field_appends_avoid():
    tool = ToolProfile(id="t", label="t", max_refs=4, separate_negative=False)
    kit = build_kit(CTX, YUNA, tool)
    assert kit.negative_prompt is None
    assert kit.prompt.splitlines()[-1].startswith("Avoid: different face")


def test_name_with_space_in_reference_list():
    kit = build_kit(CTX, replace(YUNA, name="김 유나"), GENERIC)
    assert "image 1 = 김 유나 front view" in kit.prompt


def test_style_note_is_added_to_default_style():
    kit = build_kit(replace(CTX, style_note="수채화 느낌"), YUNA, GENERIC)
    assert "Style: 2D anime style, consistent character design, 수채화 느낌" in kit.prompt

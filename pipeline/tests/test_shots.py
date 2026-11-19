from skpipe.shots import Shot, detect_shots, extract_keyframes


def test_detects_three_shots(synthetic_video):
    shots = detect_shots(synthetic_video)
    assert len(shots) == 3
    assert abs(shots[1].start_ms - 1000) <= 50
    assert abs(shots[2].start_ms - 2500) <= 50
    assert shots[-1].end_ms >= 3400


def test_short_shots_are_merged(synthetic_video):
    # 최소 길이를 1.2초로 올리면 1초짜리 마지막 컷이 앞 컷에 합쳐진다
    shots = detect_shots(synthetic_video, min_shot_ms=1200)
    assert len(shots) == 2


def test_sample_times_stay_inside_shot():
    shot = Shot(0, 1000, 2000)
    times = shot.sample_times_ms(3)
    assert times == sorted(times)
    assert all(1000 < t < 2000 for t in times)
    assert shot.sample_times_ms(1) == [1500]


def test_extract_keyframes(synthetic_video, tmp_path):
    shots = detect_shots(synthetic_video)
    frames = extract_keyframes(synthetic_video, shots, tmp_path, per_shot=2)
    assert set(frames) == {0, 1, 2}
    assert all(len(v) == 2 for v in frames.values())
    assert len(list(tmp_path.glob("*.jpg"))) == 6
    # 두 번째 컷 프레임은 파란 계열 (BGR의 B가 큼)
    _, img = frames[1][0]
    b, g, r = img[60, 80]
    assert b > 150 and r < 100

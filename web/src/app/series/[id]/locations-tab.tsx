import { listLocations } from "@/lib/locations";
import { LOCATION_ANGLES } from "@/lib/reference-constants";
import { AddLocationForm, LocationInfo } from "./location-forms";
import { ReferenceSlot } from "./reference-slot";

/** 장소 탭: 장소 목록 + 시점별 레퍼런스 이미지 + 배치 메모 + 추가 폼. */
export async function LocationsTab({ seriesId, userId }: { seriesId: string; userId: string }) {
  const result = await listLocations(seriesId);

  if (!result.ok) {
    return (
      <p className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
        {result.reason === "missing_table"
          ? "DB에 장소 테이블이 없습니다. supabase/migrations/20261120000300_create_locations.sql을 Supabase SQL Editor에서 실행해 주세요."
          : result.reason === "no_permission"
            ? "장소 테이블 권한이 없습니다. 마이그레이션 SQL이 끝까지 실행됐는지 확인해 주세요."
            : "장소를 불러오지 못했습니다. 잠시 후 새로고침해 주세요."}
      </p>
    );
  }

  const { locations } = result;

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-black/60 dark:text-white/60">
        자주 나오는 장소를 등록해 두면 배경과 배치가 회차마다 달라졌는지 비교할 수 있습니다. 공간 전체가 보이는{" "}
        <strong>전경</strong> 이미지는 꼭 올려 주세요.
      </p>

      {locations.length > 0 && (
        <ul className="flex flex-col gap-4">
          {locations.map((l) => (
            <li
              key={l.id}
              className="flex flex-col gap-4 rounded-lg border border-black/10 p-4 lg:flex-row dark:border-white/15"
            >
              <LocationInfo seriesId={seriesId} location={l} />
              <div className="flex flex-wrap gap-3">
                {LOCATION_ANGLES.map((angle) => (
                  <ReferenceSlot
                    key={angle}
                    kind="location"
                    userId={userId}
                    seriesId={seriesId}
                    entityId={l.id}
                    angle={angle}
                    imageUrl={l.images[angle]?.url ?? null}
                    hasImage={Boolean(l.images[angle])}
                  />
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}

      {locations.length === 0 && (
        <p className="text-sm text-black/50 dark:text-white/50">아직 등록된 장소가 없습니다.</p>
      )}

      <div>
        <AddLocationForm seriesId={seriesId} userId={userId} startOpen={locations.length === 0} />
      </div>
    </div>
  );
}

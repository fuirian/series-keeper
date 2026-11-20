import { ANGLES } from "@/lib/character-constants";
import { listCharacters } from "@/lib/characters";
import { AddCharacterForm, CharacterInfo } from "./character-forms";
import { ReferenceSlot } from "./reference-slot";

/** 캐릭터 탭: 캐릭터 목록 + 각도별 레퍼런스 이미지 + 추가 폼. */
export async function CharactersTab({ seriesId, userId }: { seriesId: string; userId: string }) {
  const result = await listCharacters(seriesId);

  if (!result.ok) {
    return (
      <p className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
        {result.reason === "missing_table"
          ? "DB에 캐릭터 테이블이 없습니다. supabase/migrations/20261120000200_create_characters.sql을 Supabase SQL Editor에서 실행해 주세요."
          : result.reason === "no_permission"
            ? "캐릭터 테이블 권한이 없습니다. 마이그레이션 SQL이 끝까지 실행됐는지 확인해 주세요."
            : "캐릭터를 불러오지 못했습니다. 잠시 후 새로고침해 주세요."}
      </p>
    );
  }

  const { characters } = result;

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-black/60 dark:text-white/60">
        캐릭터별 레퍼런스 이미지가 일관성 검사의 기준이 됩니다. <strong>정면</strong> 얼굴이 잘 보이는 이미지는 꼭
        올려 주세요. 측면·후면이 있으면 각도가 다른 컷도 더 정확하게 비교합니다.
      </p>

      {characters.length > 0 && (
        <ul className="flex flex-col gap-4">
          {characters.map((c) => (
            <li
              key={c.id}
              className="flex flex-col gap-4 rounded-lg border border-black/10 p-4 lg:flex-row dark:border-white/15"
            >
              <CharacterInfo seriesId={seriesId} character={c} />
              <div className="flex flex-wrap gap-3">
                {ANGLES.map((angle) => (
                  <ReferenceSlot
                    key={angle}
                    userId={userId}
                    seriesId={seriesId}
                    characterId={c.id}
                    angle={angle}
                    imageUrl={c.images[angle]?.url ?? null}
                    hasImage={Boolean(c.images[angle])}
                    required={angle === "front"}
                  />
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}

      {characters.length === 0 && (
        <p className="text-sm text-black/50 dark:text-white/50">아직 등록된 캐릭터가 없습니다.</p>
      )}

      <div>
        <AddCharacterForm seriesId={seriesId} startOpen={characters.length === 0} />
      </div>
    </div>
  );
}

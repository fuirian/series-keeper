import Link from "next/link";

export default function SeriesNotFound() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <p className="text-lg font-semibold">시리즈를 찾을 수 없습니다</p>
      <p className="mt-1 text-sm text-black/60 dark:text-white/60">
        삭제되었거나, 다른 사람의 시리즈이거나, 주소가 잘못되었습니다.
      </p>
      <Link href="/" className="mt-6 text-sm font-medium underline underline-offset-4">
        내 시리즈로 돌아가기
      </Link>
    </div>
  );
}

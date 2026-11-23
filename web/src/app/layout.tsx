import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
// 한글 본문 글꼴. 쓰는 글자만 나눠 받는 dynamic subset이라 가볍다 (npm 패키지라 외부 CDN 없이 함께 배포됨)
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
import "./globals.css";
import { themeInitScript } from "@/lib/theme";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SeriesKeeper",
  description: "AI 연재물 시리즈 관리·일관성 검수 서비스",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // data-theme은 아래 스크립트가 화면을 그리기 전에 바꾸므로 hydration 경고를 끈다
    <html
      lang="ko"
      data-theme="light"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}

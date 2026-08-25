import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "万圣夜巡｜校园节日成就",
  description: "一个部署在校园内网、使用本地成就记录的节日扫码体验。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}

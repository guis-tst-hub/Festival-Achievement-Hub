import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NCPA｜校园节日成就平台",
  description: "NCPA 校园活动扫码成就平台。",
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

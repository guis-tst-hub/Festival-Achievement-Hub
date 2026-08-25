import type { Metadata } from "next";
import { FestivalExperience } from "./components/FestivalExperience";

export const metadata: Metadata = {
  title: "万圣夜巡｜校园节日成就",
  description: "扫描校园里的二维码，收集只在节日出现的秘密成就。",
};

export default function Home() {
  return <FestivalExperience />;
}

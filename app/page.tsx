import type { Metadata } from "next";
import { FestivalExperience } from "./components/FestivalExperience";

export const metadata: Metadata = {
  title: "NCPA｜校园活动成就",
  description: "扫描校园活动中的二维码，收集活动成就。",
};

export default function Home() {
  return <FestivalExperience />;
}

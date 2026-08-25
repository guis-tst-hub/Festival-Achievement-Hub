import type { Metadata } from "next";
import { AdminConsole } from "./AdminConsole";

export const metadata: Metadata = {
  title: "夜巡管理台｜本地原型",
  description: "节日、分类、成就和活动包的电脑端管理原型。",
};

export default function AdminPage() {
  return <AdminConsole />;
}

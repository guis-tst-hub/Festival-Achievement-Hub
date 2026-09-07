import type { Metadata } from "next";
import { AdminConsole } from "./AdminConsole";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "NCPA 管理台｜节日成就平台",
  description: "NCPA 活动、分类、成就和领取管理平台。",
};

export default function AdminPage() {
  return <AdminConsole />;
}

import type { Metadata } from "next";
import { LabApp } from "@/components/lab/lab-app";
export const metadata: Metadata = {
  title: "Optimization · Proof of Discovery",
};
export default function Page() {
  return <LabApp view="optimization" />;
}

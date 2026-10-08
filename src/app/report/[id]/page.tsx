"use client";

import dynamic from "next/dynamic";
import { useParams } from "next/navigation";

const ReportView = dynamic(() => import("@/components/report/ReportView"), { ssr: false });

export default function ReportPage() {
  const { id } = useParams<{ id: string }>();
  return <ReportView id={id} />;
}

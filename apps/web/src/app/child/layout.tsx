import type { ReactNode } from "react";
import { ChildAuthProvider } from "@/components/child-auth-provider";

export default function ChildLayout({ children }: { children: ReactNode }) {
  return <ChildAuthProvider>{children}</ChildAuthProvider>;
}

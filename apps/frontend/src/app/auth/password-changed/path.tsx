'use client';

import { ResetLinkSet } from "@/components/auth/ResetLinkSet";

export default function ResetPasswordPage() {
  return (
    <div className="flex h-screen w-full">
      <div className="w-1/2" />
      <div className="w-1/2">
        <ResetLinkSet />
      </div>
    </div>
  );
}

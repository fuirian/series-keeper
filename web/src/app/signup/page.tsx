import type { Metadata } from "next";
import { AuthLayout } from "@/components/form";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = {
  title: "회원가입 · SeriesKeeper",
};

export default function SignupPage() {
  return (
    <AuthLayout title="회원가입">
      <SignupForm />
    </AuthLayout>
  );
}

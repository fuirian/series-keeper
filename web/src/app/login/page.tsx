import type { Metadata } from "next";
import { AuthLayout } from "@/components/form";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "로그인 · SeriesKeeper",
};

export default function LoginPage() {
  return (
    <AuthLayout title="로그인">
      <LoginForm />
    </AuthLayout>
  );
}

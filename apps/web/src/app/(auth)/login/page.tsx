import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { LoginForm } from "@/features/auth/login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-16">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">Sign in to FinPal</CardTitle>
          <CardDescription>
            Safety-checked purchasing with PayPal Sandbox. No real money moves.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm next={next} callbackError={Boolean(error)} />
        </CardContent>
      </Card>
    </main>
  );
}

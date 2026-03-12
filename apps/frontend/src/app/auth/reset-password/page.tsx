import { ResetPasswordForm } from '@/components/auth/ResetPasswordForm';

export default function ResetPasswordPage() {
  return (
    <div className="flex h-screen w-full">
      <div className="w-1/2" />
      <div className="w-1/2 flex items-center justify-center">
        <ResetPasswordForm />
      </div>
    </div>
  );
}

import SignupForm from '@/components/ui/SignupForm';
import { Suspense } from 'react';

export default function SignupPage() {
  return (
    <main className="min-h-screen bg-gray-100 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">
            Join Fantasy Football Copilot
          </h1>
          <p className="mt-2 text-sm text-gray-600">
            Create your account to get started
          </p>
        </div>
        <Suspense fallback={<div className="text-center">Loading...</div>}>
          <SignupForm />
        </Suspense>
      </div>
    </main>
  );
}

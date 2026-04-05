import { Suspense } from 'react';
import CreateEventClient from './CreateEventClient';

export default function CreateEventPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <CreateEventClient />
    </Suspense>
  );
}

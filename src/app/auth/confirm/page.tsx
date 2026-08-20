import { Suspense } from 'react';
import ConfirmClient from './ConfirmClient';
import { FullScreenLoader } from '@/components/FullScreenLoader';

export default function ConfirmPage() {
  return (
    <Suspense fallback={<FullScreenLoader label="Validation en cours..." />}>
      <ConfirmClient />
    </Suspense>
  );
}

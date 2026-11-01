import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { ApprovalDetailPage } from '../../features/approvals/components/approval-detail-page.js';

const requestTypeSchema = z.enum(['overtime', 'correction']);
const requestIdSchema = z.uuid();

export const Route = createFileRoute('/_authenticated/approvals_/$requestType/$requestId')({
  component: ApprovalDetailRoute,
});

function ApprovalDetailRoute() {
  const { requestType, requestId } = Route.useParams();
  const parsedType = requestTypeSchema.safeParse(requestType);
  const isRequestIdValid = requestIdSchema.safeParse(requestId).success;

  return (
    <ApprovalDetailPage
      target={parsedType.success ? parsedType.data : 'overtime'}
      requestId={requestId}
      isValidPath={parsedType.success && isRequestIdValid}
    />
  );
}

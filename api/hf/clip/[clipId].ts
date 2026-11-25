import { handleGetClipRequest } from '../../../server/ahiBackend';

export async function GET(request: Request): Promise<Response> {
  try {
    return handleGetClipRequest(request);
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch generated clip.' },
      { status: 500 }
    );
  }
}

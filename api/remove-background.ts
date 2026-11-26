import { handleRemoveBackgroundRequest } from '../server/ahiBackend';

export async function POST(request: Request): Promise<Response> {
  try {
    return await handleRemoveBackgroundRequest(request);
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : 'Background removal failed.' },
      { status: 500 }
    );
  }
}

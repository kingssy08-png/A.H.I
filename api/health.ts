import { handleHealthRequest } from '../server/ahiBackend';

export async function GET(): Promise<Response> {
  try {
    return await handleHealthRequest();
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : 'Health check failed.' },
      { status: 500 }
    );
  }
}

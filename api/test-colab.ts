import { handleTestColabRequest } from '../server/ahiBackend';

export async function POST(request: Request): Promise<Response> {
  try {
    return await handleTestColabRequest(request);
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : 'Colab GPU connection test failed.' },
      { status: 500 }
    );
  }
}

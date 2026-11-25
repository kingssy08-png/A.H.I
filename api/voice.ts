import { handleVoiceRequest } from '../server/ahiBackend';

export async function POST(request: Request): Promise<Response> {
  try {
    return await handleVoiceRequest(request);
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : 'Voice synthesis failed.' },
      { status: 500 }
    );
  }
}

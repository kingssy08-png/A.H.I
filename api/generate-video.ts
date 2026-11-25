import { handleGenerateVideoRequest } from '../server/ahiBackend';

export async function POST(request: Request): Promise<Response> {
  try {
    return await handleGenerateVideoRequest(request);
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : 'Video generation failed.' },
      { status: 500 }
    );
  }
}

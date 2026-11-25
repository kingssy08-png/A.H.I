import { handleGenerateImageRequest } from '../server/ahiBackend';

export async function POST(request: Request): Promise<Response> {
  try {
    return await handleGenerateImageRequest(request);
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : 'Image generation failed.' },
      { status: 500 }
    );
  }
}

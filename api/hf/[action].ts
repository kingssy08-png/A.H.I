import {
  handleGenerateImageRequest,
  handleGenerateVideoRequest,
} from '../../server/ahiBackend';

export async function POST(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const action = url.pathname.split('/').filter(Boolean).pop() || '';

    switch (action) {
      case 'generate-image':
        return await handleGenerateImageRequest(request, false);
      case 'generate-image-stream':
        return await handleGenerateImageRequest(request, true);
      case 'generate-video':
        return await handleGenerateVideoRequest(request, 'video');
      case 'lipsync':
        return await handleGenerateVideoRequest(request, 'lipsync');
      case 'talking-scene':
        return await handleGenerateVideoRequest(request, 'talking-scene');
      default:
        return Response.json(
          { error: `Unknown HF endpoint: /api/hf/${action}` },
          { status: 404 }
        );
    }
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : 'Hugging Face API route failed.' },
      { status: 500 }
    );
  }
}

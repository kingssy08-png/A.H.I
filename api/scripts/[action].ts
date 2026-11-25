import { handleGenerateScriptRequest } from '../../server/ahiBackend';

export async function POST(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const action = url.pathname.split('/').filter(Boolean).pop() || '';

    if (action === 'generate') {
      return await handleGenerateScriptRequest(request, 'generate');
    }
    if (action === 'refine-scene') {
      return await handleGenerateScriptRequest(request, 'refine-scene');
    }

    return Response.json(
      { error: `Unknown scripts endpoint: /api/scripts/${action}` },
      { status: 404 }
    );
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : 'Scripts API route failed.' },
      { status: 500 }
    );
  }
}

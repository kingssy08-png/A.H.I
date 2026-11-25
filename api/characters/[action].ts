import { handleCharactersRequest } from '../../server/ahiBackend';

export async function POST(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const action = url.pathname.split('/').filter(Boolean).pop() || '';

    if (action === 'generate') {
      return await handleCharactersRequest(request, 'generate');
    }
    if (action === 'expression-sheet') {
      return await handleCharactersRequest(request, 'expression-sheet');
    }

    return Response.json(
      { error: `Unknown characters endpoint: /api/characters/${action}` },
      { status: 404 }
    );
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : 'Characters API route failed.' },
      { status: 500 }
    );
  }
}

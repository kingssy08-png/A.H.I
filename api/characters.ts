import { handleCharactersRequest } from '../server/ahiBackend';

export async function POST(request: Request): Promise<Response> {
  try {
    return await handleCharactersRequest(request);
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : 'Character generation failed.' },
      { status: 500 }
    );
  }
}

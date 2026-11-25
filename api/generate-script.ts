import { handleGenerateScriptRequest } from '../server/ahiBackend';

export async function POST(request: Request): Promise<Response> {
  try {
    return await handleGenerateScriptRequest(request);
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : 'Script generation failed.' },
      { status: 500 }
    );
  }
}

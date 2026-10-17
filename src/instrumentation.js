/**
 * Runs once when the Next.js server starts. Fails loudly (in the logs) when
 * the PRIM API key is missing instead of letting every request 503.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (!process.env.IDFM_API_KEY) {
    console.warn(
      '[drancybus] IDFM_API_KEY is not set. Copy .env.local.example to .env.local and add your key; ' +
        'the API routes will answer 503 until then.'
    );
  }
}

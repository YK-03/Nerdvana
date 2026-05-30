# Legacy OpenAI Static Retrieval System

This directory contains deprecated files that were initially built to support a local, static retrieval and AI summarization system using OpenAI models (e.g., `gpt-4.1-mini`).

**Status**: Archived  
**Date of Archival**: 2026-04-17  

## Reason for Archival

The Nerdvana project has successfully migrated its primary generative API layer to **Google Gemini** (handling all requests via the `/api/nerdvana-answer` route). As a result, this OpenAI retrieval implementation is no longer connected to the active runtime, and the `VITE_OPENAI_API_KEY` is no longer managed in the active environments.

These files have been scrubbed from `src` because they have zero active imports across the components and API routes.

## Files Preserved

- `staticRetriever.ts`: Handled static document ranking and called `summarizeChunksMulti`.
- `sourceIndex.ts`: Managed the fetching and grouping of sources using embeddings.
- `embeddings.ts`: Interfaced with OpenAI's `/v1/embeddings` endpoint.
- `vectorStore.ts`: Defined a basic in-memory vector database client.
- `itemDocuments.ts`: Hardcoded document chunks for the retrieval pipeline.

These files have been preserved here safely so that they can be referenced, reused, or further refactored in the future if a hybrid or multi-model local indexing system is reinstated.

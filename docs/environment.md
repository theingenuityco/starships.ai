# Environment Variables

This document lists all environment variables used by the starships.ai application.

## Server Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | `4000` | Port number for the HTTP server |
| `NODE_ENV` | No | `development` | Application environment (development, production, test) |

## Neo4j Database Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NEO4J_URI` | No | `[NEO4J-LOCAL-URL]` | Neo4j database URI |
| `NEO4J_USERNAME` | No | `neo4j` | Neo4j database username |
| `NEO4J_PASSWORD` | No | `[DEFAULT-PASSWORD]` | Neo4j database [DEFAULT-PASSWORD] |
| `NEO4J_DATABASE` | No | `neo4j` | Neo4j database name |

## LLM Provider Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `OPENAI_API_KEY` | Conditional | - | OpenAI API key (required if using OpenAI models) |
| `ANTHROPIC_API_KEY` | Conditional | - | Anthropic API key (required if using Anthropic models) |

## Default Model Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DEFAULT_CHAT_MODEL` | No | `gpt-4` | Default chat model name |
| `DEFAULT_EMBEDDING_MODEL` | No | `text-embedding-3-small` | Default embedding model for vector search |
| `DEFAULT_PROVIDER` | No | `openai` | Default LLM provider (`openai` or `anthropic`) |
| `DEFAULT_MODEL_ID` | No | `default-openai-gpt4` | Default model identifier |
| `DEFAULT_TEMPERATURE` | No | `0.7` | Default temperature for LLM responses (0.0-1.0) |
| `DEFAULT_MAX_TOKENS` | No | `4096` | Default maximum tokens for LLM responses |

## Vector Store Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `FAISS_INDEX_PATH` | No | `./data/faiss_index` | Path to store FAISS vector index files |

## Example .env File

```bash
# Server Configuration
PORT=4000
NODE_ENV=development

# Neo4j Configuration
NEO4J_URI=[NEO4J-LOCAL-URL]
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=your-neo4j-[DEFAULT-PASSWORD]
NEO4J_DATABASE=neo4j

# LLM Provider Configuration
OPENAI_API_KEY=your-openai-api-key
ANTHROPIC_API_KEY=your-anthropic-api-key

# Default Model Configuration
DEFAULT_CHAT_MODEL=gpt-4
DEFAULT_EMBEDDING_MODEL=text-embedding-3-small
DEFAULT_PROVIDER=openai
DEFAULT_MODEL_ID=default-openai-gpt4
DEFAULT_TEMPERATURE=0.7
DEFAULT_MAX_TOKENS=4096

# Vector Store Configuration
FAISS_INDEX_PATH=./data/faiss_index
```

## Notes

- If `DEFAULT_PROVIDER` is set to `openai`, ensure `OPENAI_API_KEY` is provided
- If `DEFAULT_PROVIDER` is set to `anthropic`, ensure `ANTHROPIC_API_KEY` is provided
- The FAISS index directory will be created automatically if it doesn't exist
- Temperature values should be between 0.0 (deterministic) and 1.0 (creative) 
# Credentials

kickd includes a credential vault for securely storing API keys, tokens, and other secrets. Sensitive fields are encrypted at rest with AES-256-CBC.

## Setup

Generate an encryption key and add it to `.env`:

```bash
openssl rand -base64 32
```

```bash
# .env
KICKD_ENCRYPTION_KEY=your-generated-key
```

Without this key, credentials are stored in plaintext. With the key, sensitive fields (tokens, passwords, secrets) are encrypted.

## Storing credentials

```bash
# GitHub token
kickd creds add my-github github '{"token":"ghp_abc123..."}'

# Slack bot
kickd creds add my-slack slack '{"botToken":"xoxb-...","webhookUrl":"https://hooks.slack.com/..."}'

# Generic API key
kickd creds add my-api api_key '{"apiKey":"sk-...","headerName":"X-API-Key"}'

# Basic auth
kickd creds add my-server basic_auth '{"username":"admin","password":"secret123"}'

# AWS
kickd creds add my-aws aws '{"accessKeyId":"AKIA...","secretAccessKey":"..."}'

# Custom
kickd creds add my-custom custom '{"field1":"value1","field2":"value2"}'
```

Via HTTP:

```bash
curl -X POST http://localhost:7400/credentials \
  -H "Content-Type: application/json" \
  -d '{"name":"my-github","typeId":"github","data":{"token":"ghp_abc123..."}}'
```

## Built-in types

| Type | Fields | Auth type |
|------|--------|-----------|
| `bearer` | `token` | Bearer token |
| `api_key` | `apiKey`, `headerName?` | API key header |
| `basic_auth` | `username`, `password` | Basic auth |
| `oauth2` | `clientId`, `clientSecret`, `accessToken`, `refreshToken?`, `tokenUrl?` | OAuth2 |
| `github` | `token` | Bearer token |
| `slack` | `botToken`, `webhookUrl?` | Bearer token |
| `discord` | `botToken`, `webhookUrl?` | Bot token |
| `stripe` | `secretKey`, `publishableKey?` | Bearer token |
| `openai` | `apiKey`, `organization?` | Bearer token |
| `anthropic` | `apiKey` | API key header |
| `linkedin` | `accessToken` | Bearer token |
| `sendgrid` | `apiKey` | Bearer token |
| `aws` | `accessKeyId`, `secretAccessKey`, `region?` | AWS Signature |
| `custom` | *(any fields)* | Custom |

## Viewing credentials

Sensitive values are automatically redacted in responses:

```bash
kickd creds get my-github
# token: ghp_****3456
```

## Testing connectivity

Test that a credential works by connecting to its API:

```bash
kickd creds test my-github
# OK: Authenticated as username (GitHub)
```

## Using credentials in code

```ts
import { resolveCredential, buildAuthHeaders } from "../src/credentials/store";

// Get credential data
const cred = resolveCredential("my-github");
const token = cred.data.token;

// Or build auth headers automatically
const headers = buildAuthHeaders("my-github");
// { "Authorization": "Bearer ghp_abc123..." }
```

## OAuth2 flows

Start an OAuth2 authorization flow:

```bash
curl -X POST http://localhost:7400/credentials/oauth2/start \
  -H "Content-Type: application/json" \
  -d '{
    "credentialName": "my-google",
    "typeId": "oauth2",
    "authorizeUrl": "https://accounts.google.com/o/oauth2/auth",
    "tokenUrl": "https://oauth2.googleapis.com/token",
    "clientId": "...",
    "clientSecret": "...",
    "redirectUri": "http://localhost:7400/credentials/oauth2/callback",
    "scope": "openid email"
  }'
```

The response includes an `authUrl` to redirect the user to. After authorization, the callback saves the tokens automatically.

Credentials with `expiresAt` are auto-refreshed when accessed via `resolveWithAutoRefresh()`.

## Audit log

Every credential operation is logged:

```bash
curl http://localhost:7400/credentials/<id>/audit?limit=20
```

## Managing credentials

```bash
kickd creds list              # List all credentials
kickd creds types             # List available types
kickd creds add <n> <t> <j>   # Store a credential
kickd creds get <name>        # View (redacted)
kickd creds test <name>       # Test connectivity
kickd creds delete <name>     # Delete
```

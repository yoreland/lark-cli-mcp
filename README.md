# @yoreland/lark-cli-mcp

> One-line `npx` MCP server that lets AI clients (Amazon Quick Desktop, Claude Desktop, …) operate **Feishu / Lark as your own user identity** — send, read, reply, and search messages.

It wraps the official [`lark-cli`](https://github.com/larksuite/cli) (bundled as a dependency, no separate install) and exposes 7 messaging tools over MCP stdio. Because every call runs with `--as user`, the sender shown in Feishu is **you**, not a bot.

---

## Quick start (for workshop attendees)

```bash
# 1) Log in once (OAuth device flow — opens a URL / shows a QR code)
npx -y @yoreland/lark-cli-mcp auth

# 2) Sanity check
npx -y @yoreland/lark-cli-mcp doctor
```

Then add the MCP server in your client:

| Field        | Value                          |
| ------------ | ------------------------------ |
| Connection   | Local (stdio)                  |
| Command      | `npx`                          |
| Arguments    | `-y @yoreland/lark-cli-mcp`    |

You should see **7 tools · Connected** ✅

> Quick Desktop tip: arguments are space-split. `-y @yoreland/lark-cli-mcp` is fine (no spaces inside the package name).

---

## Prerequisites

- **Node.js v18+** (`node -v`)
- An MCP client (Amazon Quick Desktop / Claude Desktop / etc.)
- A Feishu/Lark account in the org running the workshop
- Network access to npm registry and Feishu OAuth

The Feishu **App ID / Secret** is provided centrally by the workshop host and baked into the shared `lark-cli` config — attendees only do the OAuth login step. (See [Host setup](#host-setup).)

> Behind the Great Firewall? Use a mirror: `npm config set registry https://registry.npmmirror.com`

---

## Commands

```bash
npx -y @yoreland/lark-cli-mcp            # start MCP server (stdio) — what the client runs
npx -y @yoreland/lark-cli-mcp auth       # OAuth device-flow login (user identity)
npx -y @yoreland/lark-cli-mcp status     # show auth status
npx -y @yoreland/lark-cli-mcp logout     # clear token
npx -y @yoreland/lark-cli-mcp doctor     # environment + login self-check
npx -y @yoreland/lark-cli-mcp -- <args>  # passthrough to bundled lark-cli
```

---

## The tools

### Messaging (IM)

| Tool                     | What it does            |
| ------------------------ | ----------------------- |
| `feishu_send_message`    | Send a message          |
| `feishu_get_messages`    | Read recent messages    |
| `feishu_reply_message`   | Reply (thread optional) |
| `feishu_search_messages` | Search messages         |
| `feishu_list_chats`      | Find group chats        |
| `feishu_search_user`     | Find a user (→ open_id) |
| `feishu_get_thread`      | View a thread           |

### Docs / Wiki / Drive

| Tool                    | What it does                       |
| ----------------------- | ---------------------------------- |
| `feishu_search_docs`    | Search docs / wiki / sheets        |
| `feishu_doc_fetch`      | Read a document                    |
| `feishu_doc_create`     | Create a document (markdown)       |
| `feishu_doc_update`     | Update a document                  |
| `feishu_drive_search`   | Search Drive files (type filters)  |
| `feishu_wiki_node_list` | List wiki nodes                    |
| `feishu_wiki_node_get`  | Get a wiki node (accepts URL)      |

### Bitable (multi-dimensional tables)

| Tool                        | What it does                          |
| --------------------------- | ------------------------------------- |
| `feishu_base_table_list`    | List tables in a base                 |
| `feishu_base_field_list`    | List fields of a table                |
| `feishu_base_record_list`   | List records (filter/sort)            |
| `feishu_base_record_search` | Search records                        |
| `feishu_base_record_upsert` | Create/update a record                |

### Talk to it naturally

| Goal            | Say to your assistant                       |
| --------------- | ------------------------------------------- |
| Read a group    | "看看 XX 群最近聊了什么"                      |
| Send            | "在 XX 群说：明天会议改到 3 点"               |
| Reply           | "回复那条消息：收到，我来跟进"                |
| Search          | "搜一下谁提过客户报价"                        |
| Find someone    | "帮我找一下张三的 open_id"                    |
| View a thread   | "看看那条消息下面的讨论"                      |

---

## Host setup

The workshop host creates **one** Feishu custom app and configures it so attendees share the same App ID/Secret but each authorize their own account.

1. [Feishu Open Platform](https://open.feishu.cn) → create an internal custom app → note **App ID / App Secret**.
2. Enable **User token scopes** matching the `im`, `contact`, `search` domains (message read/write, reply, chat read, user search, message search).
3. Distribute the App ID/Secret to attendees via `lark-cli config` (or a pre-bound config). The login step requests scopes via `--domain im,contact,docs,wiki,drive,base`.

`auth` uses **OAuth Device Flow**, so no `redirect URL` / `localhost:3000` callback configuration is required.

---

## Troubleshooting

**`missing required scope(s)`** — re-login with the needed domain:
```bash
npx -y @yoreland/lark-cli-mcp auth --domain im,contact,docs,wiki,drive,base
```

**Client shows "No tools loaded"** — run `npx -y @yoreland/lark-cli-mcp doctor`; confirm Node ≥18 and that `auth status` is OK.

**Token expired** — just re-run `auth`.

---

## Known limitations

- No image/file attachment sending (text + markdown only)
- No interactive cards
- No group creation
- Tokens expire; re-run `auth` when they do

---

## How it works

```
MCP client (Quick Desktop / Claude Desktop)
    │  stdio (MCP / JSON-RPC)
    ▼
@yoreland/lark-cli-mcp  (server.mjs)
    │  child_process.execFile (no shell → injection-safe)
    ▼
lark-cli --as user   (bundled dependency)
    │  OAuth user_access_token (device flow)
    ▼
Feishu / Lark Open API
```

## License

MIT

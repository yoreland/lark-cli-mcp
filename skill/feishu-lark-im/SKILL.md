---
name: feishu-lark-im
description: Operate Feishu/Lark as the logged-in user — send, read, reply to, and search messages, find chats and users, and view threads. Use whenever the user wants to (1) send a Feishu/Lark message to a person or group, (2) read recent messages in a chat, (3) reply to a message (optionally in-thread), (4) search messages by keyword, (5) find a group chat's chat_id, (6) look up a user's open_id by name/email, or (7) view a message thread. Triggers include phrasing like "在飞书群里说…", "看看 XX 群最近聊了什么", "回复那条消息", "搜一下谁提过…", "帮我找一下某人", "send a Lark message", "check the group chat". Backed by the @yoreland/lark-cli-mcp MCP server (7 tools, all act as the real user, not a bot).
---

# Feishu / Lark IM (user identity)

Drive the `@yoreland/lark-cli-mcp` MCP server to operate Feishu/Lark messaging **as the logged-in human user** (the sender shown in Feishu is the user, not a bot).

## Prerequisites (one-time, already done if tools are visible)

The MCP server must be registered in the client and the user logged in:

- MCP config — Command `npx`, Arguments `-y @yoreland/lark-cli-mcp`
- First-time setup in a terminal:
  - `npx -y @yoreland/lark-cli-mcp -- config init --new` (scan QR to bind the Feishu app)
  - `npx -y @yoreland/lark-cli-mcp auth` (OAuth device-flow login as the user)

If the tools below are not available, instruct the user to run those two commands, then reconnect the MCP server. Do NOT attempt to install or log in on the user's behalf — login is interactive and personal.

## Tools

| Tool | Use for | Required args |
| --- | --- | --- |
| `feishu_send_message` | Send a message | `text` or `markdown`; plus `chat_id` OR `user_id` |
| `feishu_get_messages` | Read recent messages | `chat_id` OR `user_id` |
| `feishu_reply_message` | Reply to a message | `message_id`, `text` (optional `in_thread`) |
| `feishu_search_messages` | Search messages by keyword | `keyword` |
| `feishu_list_chats` | Find a group → its `chat_id` | (optional `keyword`) |
| `feishu_search_user` | Find a user → their `open_id` | `query` (name/email) |
| `feishu_get_thread` | View a thread's replies | `message_id` |

ID conventions: chat = `oc_xxx`, user open_id = `ou_xxx`, message = `om_xxx` (thread `omt_xxx`).

## Core workflows

### Send to a group by name
The user usually gives a group name, not a `chat_id`. Resolve first:
1. `feishu_list_chats` with `keyword: "<group name>"` → pick the matching `chat_id`.
2. `feishu_send_message` with that `chat_id` and `text` (or `markdown`).

If multiple chats match, show the candidates and ask which one before sending.

### Send a DM to a person
1. `feishu_search_user` with `query: "<name or email>"` → get `open_id`.
2. `feishu_send_message` with `user_id: <open_id>` and the message.

### Read / summarize a chat
1. Resolve `chat_id` via `feishu_list_chats` if only a name is given.
2. `feishu_get_messages` (`count` defaults to ~20; raise it if the user wants more history).
3. Summarize for the user; quote sender names where useful.

### Reply to a message
Need the `message_id` (`om_xxx`). If the user refers to "that message" from a recent read, reuse the `om_` id from prior tool output. Set `in_thread: true` for thread replies.

### Search
`feishu_search_messages` with `keyword`. Optionally scope with `chat_id` and time range (`start_time`/`end_time` as Unix seconds).

## Rules & safety

- **Sending is a write action performed as the real user.** Before sending to a group or person, confirm the target and the exact message text with the user, unless they already gave an explicit, unambiguous instruction.
- Never guess a `chat_id` / `open_id`. Always resolve via `feishu_list_chats` / `feishu_search_user` first.
- Prefer `markdown` for formatted messages; use `text` for plain.
- Markdown messages do not support image/file attachments or interactive cards (server limitation).

## Troubleshooting

- `missing required scope(s)` → the login lacks a permission. Tell the user to run:
  `npx -y @yoreland/lark-cli-mcp auth --domain im,contact`
  or for a specific scope, e.g. sending as user:
  `npx -y @yoreland/lark-cli-mcp auth --scope "im:message:send_as_user"`
- `not configured` / `not_configured` → run `npx -y @yoreland/lark-cli-mcp -- config init --new`.
- Token expired / auth errors → re-run `npx -y @yoreland/lark-cli-mcp auth`.
- Tools missing in client → verify MCP args are `-y @yoreland/lark-cli-mcp` and `npx -y @yoreland/lark-cli-mcp doctor` reports logged-in.

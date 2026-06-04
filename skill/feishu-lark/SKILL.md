---
name: feishu-lark
description: Operate Feishu/Lark as the logged-in user via the @yoreland/lark-cli-mcp MCP server — messaging (send/read/reply/search), people & chat lookup, cloud documents (search/read/create/update), Drive & Wiki, and Bitable (multi-dimensional tables). Use whenever the user wants to (1) send/read/reply/search Feishu messages, (2) find a group's chat_id or a user's open_id, (3) view a message thread, (4) search/read/create/update Feishu docs, (5) search Drive files or browse Wiki nodes, or (6) list/search/create/update Bitable records. Triggers include "在飞书群里说…", "看看 XX 群最近聊了什么", "回复那条消息", "搜一下谁提过…", "帮我找一下某人", "搜一下我的飞书文档", "读一下这篇文档", "列一下这个多维表格的记录", "send a Lark message", "search Feishu docs", "update a Bitable record". All actions run as the real user (not a bot).
---

# Feishu / Lark (user identity)

Drive the `@yoreland/lark-cli-mcp` MCP server to operate Feishu/Lark as the logged-in human user (sender/creator shown in Feishu is the user, not a bot). All tools return JSON — parse it to extract ids, titles, and content.

## Prerequisites (one-time)

MCP server registered in the client and the user logged in:

- MCP config — Command `npx`, Arguments `-y @yoreland/lark-cli-mcp`
- Terminal setup:
  - `npx -y @yoreland/lark-cli-mcp -- config init --new` (scan QR to bind the Feishu app)
  - `npx -y @yoreland/lark-cli-mcp auth` (OAuth device-flow login; requests domains im,contact,docs,wiki,drive,base)

If tools are missing or calls fail with auth errors, tell the user to run those commands and reconnect. Login is interactive/personal — never do it on their behalf.

## Tools

### Messaging (IM)

| Tool | Use for | Required args |
| --- | --- | --- |
| `feishu_send_message` | Send a message | `text` or `markdown`; plus `chat_id` OR `user_id` |
| `feishu_get_messages` | Read recent messages | `chat_id` OR `user_id` |
| `feishu_reply_message` | Reply to a message | `message_id`, `text` (opt `in_thread`) |
| `feishu_search_messages` | Search messages | `keyword` |
| `feishu_list_chats` | Find a group → `chat_id` | (opt `keyword`) |
| `feishu_search_user` | Find a user → `open_id` | `query` (name/email) |
| `feishu_get_thread` | View a thread | `message_id` |

### Docs / Wiki / Drive

| Tool | Use for | Required args |
| --- | --- | --- |
| `feishu_search_docs` | Search docs/wiki/sheets | `query` |
| `feishu_doc_fetch` | Read a document | `doc` (URL or token) |
| `feishu_doc_create` | Create a doc (markdown) | `title` (opt `markdown`, `folder_token`) |
| `feishu_doc_update` | Update a doc | `doc`, `markdown` (opt `mode`, `new_title`) |
| `feishu_drive_search` | Search Drive files | (opt `query`, `doc_types`, `mine`) |
| `feishu_wiki_node_list` | List wiki nodes | `space_id` (opt `parent_node_token`) |
| `feishu_wiki_node_get` | Get a wiki node | `node_token` (accepts a Lark URL) |

### Bitable (multi-dimensional tables)

| Tool | Use for | Required args |
| --- | --- | --- |
| `feishu_base_table_list` | List tables in a base | `base_token` |
| `feishu_base_field_list` | List a table's fields | `base_token`, `table_id` |
| `feishu_base_record_list` | List records | `base_token`, `table_id` (opt `limit`,`filter_json`,`sort_json`) |
| `feishu_base_record_search` | Search records | `base_token`, `table_id` (opt `limit`) |
| `feishu_base_record_upsert` | Create/update a record | `base_token`, `table_id`, `fields_json` (opt `record_id`) |

ID conventions: chat `oc_xxx`, user open_id `ou_xxx`, message `om_xxx` (thread `omt_xxx`), doc token from URL `/docx/<token>`, base app_token from URL `/base/<token>`, table `tbl_xxx`.

## Core workflows

### Send to a group by name
1. `feishu_list_chats` (`keyword`) → pick the matching `chat_id`; if several match, ask which.
2. `feishu_send_message` with that `chat_id` + `text`/`markdown`.

### Send a DM to a person
1. `feishu_search_user` (`query`) → `open_id`.
2. `feishu_send_message` with `user_id`.

### Read / summarize a chat
Resolve `chat_id` if only a name is given → `feishu_get_messages` (`count` ~20, raise for more) → summarize with sender names.

### Reply to a message
Use the `message_id` (`om_...`) from a prior read. `in_thread: true` for thread replies.

### Work with a document
- Search: `feishu_search_docs` (`query`) → get the doc token/URL.
- Read: `feishu_doc_fetch` (`doc` = URL or token).
- Create: `feishu_doc_create` (`title`, `markdown`).
- Update: `feishu_doc_update` (`doc`, `markdown`, `mode`); default `mode` is `append`. Use `overwrite`/`replace_all` to replace, `insert_before`/`insert_after` for positional edits.

### Work with a Bitable
The user usually pastes a Base URL. Extract `app_token` (`/base/<token>`) for `base_token`, and `table` query param for `table_id`.
1. `feishu_base_table_list` to discover tables; `feishu_base_field_list` to learn columns.
2. Read: `feishu_base_record_list` / `feishu_base_record_search`.
3. Write: `feishu_base_record_upsert` with `fields_json` = `{"FieldName":"value",...}` (no `fields` wrapper). Omit `record_id` to create; include it to update that row.

## Rules & safety

- **Sending messages and creating/updating docs or records run as the real user — real outbound effects.** Before sending a message or writing data, confirm the resolved target (show name + id) and the exact content, unless the user already gave an explicit, unambiguous instruction.
- Never invent a `chat_id` / `open_id` / `base_token` / `table_id`. Resolve via the search/list tools first and verify the match.
- For Bitable writes, prefer reading fields first (`feishu_base_field_list`) so `fields_json` keys match real column names.
- Use `markdown` for formatted messages/docs; `text` for plain messages.
- Attachments and interactive message cards are out of scope.

## Troubleshooting

- `missing required scope(s)` → re-login with the needed domains:
  `npx -y @yoreland/lark-cli-mcp auth --domain im,contact,docs,wiki,drive,base`
  or a specific scope, e.g.: `npx -y @yoreland/lark-cli-mcp auth --scope "im:message:send_as_user"`.
  Also ensure those permissions are enabled (and the app version published) in the Feishu Open Platform console.
- `not configured` → `npx -y @yoreland/lark-cli-mcp -- config init --new`.
- Token expired → re-run `npx -y @yoreland/lark-cli-mcp auth`.
- Tools missing → verify MCP args `-y @yoreland/lark-cli-mcp`; run `npx -y @yoreland/lark-cli-mcp doctor`.

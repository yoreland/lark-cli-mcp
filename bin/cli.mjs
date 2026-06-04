#!/usr/bin/env node
/**
 * @yoreland/lark-cli-mcp — CLI entry point (npx target)
 *
 *   npx @yoreland/lark-cli-mcp            # start the MCP server (stdio)
 *   npx @yoreland/lark-cli-mcp auth       # OAuth device-flow login (as user)
 *   npx @yoreland/lark-cli-mcp status     # show auth status
 *   npx @yoreland/lark-cli-mcp doctor     # environment self-check
 *   npx @yoreland/lark-cli-mcp -- <args>  # passthrough to bundled lark-cli
 *
 * Designed so workshop attendees never install lark-cli separately:
 * the bundled binary ships as a dependency of this package.
 */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Default scopes for a Feishu messaging workshop (user identity).
// `im` domain covers send/read/reply/search; `contact` for user search.
// NOTE: there is no `search` domain in lark-cli; message search lives under `im`.
const DEFAULT_DOMAINS = "im,contact";

function resolveLarkCli() {
  if (process.env.LARK_CLI_BIN && existsSync(process.env.LARK_CLI_BIN)) {
    return process.env.LARK_CLI_BIN;
  }
  try {
    const require = createRequire(import.meta.url);
    const pkgJson = require.resolve("@larksuite/cli/package.json");
    const binDir = join(dirname(pkgJson), "..", "..", ".bin");
    const candidate = join(
      binDir,
      process.platform === "win32" ? "lark-cli.cmd" : "lark-cli"
    );
    if (existsSync(candidate)) return candidate;
  } catch {
    /* fall through */
  }
  return "lark-cli";
}

const LARK_CLI = resolveLarkCli();

function runLark(args, opts = {}) {
  return new Promise((resolve) => {
    const child = spawn(LARK_CLI, args, { stdio: "inherit", ...opts });
    child.on("exit", (code) => resolve(code ?? 0));
    child.on("error", (err) => {
      console.error(`无法运行 lark-cli (${LARK_CLI}): ${err.message}`);
      resolve(1);
    });
  });
}

function startServer() {
  const serverPath = join(__dirname, "..", "server.mjs");
  const child = spawn(process.execPath, [serverPath], { stdio: "inherit" });
  child.on("exit", (code) => process.exit(code ?? 0));
  child.on("error", (err) => {
    console.error(`MCP server 启动失败: ${err.message}`);
    process.exit(1);
  });
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);

  switch (cmd) {
    case undefined:
    case "serve":
    case "start":
      startServer();
      return;

    case "auth":
    case "login": {
      // Allow override: `... auth --domain im,calendar` or `... auth --scope "..."`
      const hasScopeArg = rest.some(
        (a) => a === "--scope" || a === "--domain" || a === "--recommend"
      );
      const args = ["auth", "login"];
      if (hasScopeArg) args.push(...rest);
      else args.push("--domain", DEFAULT_DOMAINS, ...rest);
      console.error(
        `\n🔑 飞书 OAuth 登录（用户身份，scopes domains: ${
          hasScopeArg ? "(custom)" : DEFAULT_DOMAINS
        }）`
      );
      console.error("   浏览器/二维码授权后即可使用。\n");
      process.exit(await runLark(args));
      return;
    }

    case "status":
      process.exit(await runLark(["auth", "status", ...rest]));
      return;

    case "logout":
      process.exit(await runLark(["auth", "logout", ...rest]));
      return;

    case "doctor": {
      console.log("🩺 lark-cli-mcp 环境自检\n");
      console.log(`Node:      ${process.version}`);
      console.log(`Platform:  ${process.platform}/${process.arch}`);
      console.log(`lark-cli:  ${LARK_CLI}`);
      console.log(`  exists:  ${existsSync(LARK_CLI) || LARK_CLI === "lark-cli"}`);
      console.log("\n检查登录状态:\n");
      const code = await runLark(["auth", "status"]);
      console.log(
        code === 0
          ? "\n✅ 看起来已登录。现在可在 MCP 客户端用 `npx @yoreland/lark-cli-mcp` 启动。"
          : "\n⚠️  未登录。请先运行：npx @yoreland/lark-cli-mcp auth"
      );
      process.exit(code);
      return;
    }

    case "--":
      // Passthrough to bundled lark-cli
      process.exit(await runLark(rest));
      return;

    case "-h":
    case "--help":
    case "help":
      printHelp();
      return;

    default:
      // Unknown -> passthrough to lark-cli for power users
      process.exit(await runLark([cmd, ...rest]));
  }
}

function printHelp() {
  console.log(`@yoreland/lark-cli-mcp — Feishu/Lark MCP server (user identity)

USAGE
  npx @yoreland/lark-cli-mcp              启动 MCP server (stdio) — 给 MCP 客户端用
  npx @yoreland/lark-cli-mcp auth         OAuth 设备码登录（用户身份）
  npx @yoreland/lark-cli-mcp status       查看登录状态
  npx @yoreland/lark-cli-mcp logout       退出登录
  npx @yoreland/lark-cli-mcp doctor       环境与登录自检
  npx @yoreland/lark-cli-mcp -- <args>    透传给底层 lark-cli

MCP 客户端配置 (Quick Desktop / Claude Desktop):
  Command:   npx
  Arguments: -y @yoreland/lark-cli-mcp

更多: https://github.com/yoreland/lark-cli-mcp`);
}

main();

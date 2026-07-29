import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

/**
 * Register a "hello" tool that greets someone by name.
 *
 * The `parameters` field uses typebox to define a JSON Schema that describes
 * the tool's input. This schema tells the LLM what arguments the tool accepts,
 * so it can call the tool correctly when the user asks to greet someone.
 *
 * Typebox provides a type-safe way to define JSON Schema with automatic
 * TypeScript type inference. For example:
 *   Type.Object({ name: Type.String() })
 * generates:
 *   { type: "object", properties: { name: { type: "string" } }, required: ["name"] }
 *
 * When the user says "say hello to Alice", the LLM will:
 *   1. See this tool's description and parameter schema
 *   2. Determine this tool matches the user's intent
 *   3. Call it with { name: "Alice" }
 *   4. Receive and display the result "Hello, Alice!"
 */

/**
 * Shared greeting logic used by both the tool and command.
 */
function greet(name: string): string {
  return `Hello, ${name}!`;
}

export default function (pi: ExtensionAPI) {
  // Tool - LLM calls automatically based on user intent
  // Example: "say hello to Alice" -> LLM calls hello tool with { name: "Alice" }
  pi.registerTool({
    name: "hello",
    label: "Hello",
    description: "Greet someone by name",
    parameters: Type.Object({
      name: Type.String({ description: "Name to greet" }),
    }),
    async execute(_id, params, _signal, _onUpdate, _ctx) {
      const { name } = params as { name: string };
      return {
        content: [{ type: "text", text: greet(name) }],
        details: {},
      };
    },
  });

  // Command - User calls directly with slash command
  // Example: "/hello Alice" or "/hello" (defaults to "world")
  pi.registerCommand("hello", {
    description: "Say hello",
    handler: async (args, ctx) => {
      ctx.ui.notify(greet(args || "world"), "info");
    },
  });
}

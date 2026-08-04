# AGENTS.md

## Project Overview

This is a **Pi Extension** project that extends [Pi](https://pi.dev) - an AI coding agent. Extensions are TypeScript modules that extend Pi's behavior by registering custom tools, commands, and event handlers.

**Key Technologies:**

- TypeScript
- [Typebox](https://github.com/sinclairzx81/typebox) - JSON Schema definition with type inference
- [ESLint](https://eslint.org) - Linting
- [Prettier](https://prettier.io) - Formatting
- Pi Extension API (`@earendil-works/pi-coding-agent`)

## Documentation

**Official Pi Extension Documentation:**

- Main docs: <https://pi.dev/docs/latest/extensions>
- Examples: <https://github.com/earendil-works/pi/tree/main/packages/coding-agent/examples/extensions>

**Key Concepts:**

- Extensions export a default factory function receiving `ExtensionAPI`
- Tools are called by LLM automatically based on user intent
- Commands are called by users via slash commands (e.g., `/hello`)
- Typebox defines JSON Schema for tool parameters

## Setup Commands

```bash
# Install dependencies
pnpm install

# Start extension in development mode (hot-reload)
pnpm run dev

# Type check
pnpm run typecheck

# Lint code
pnpm run lint

# Format code
pnpm run format
```

## Development Workflow

1. **Edit `src/index.ts`** - Main extension entry point
2. **Run `pnpm run dev`** - Test with Pi in development mode
3. **Use `/reload`** in Pi to hot-reload extensions from `.pi/extensions/`

**Extension Locations:**

- Global: `~/.pi/agent/extensions/*.ts`
- Project-local: `.pi/extensions/*.ts`
- Test mode: `pi -e ./src/index.ts`

## Project Structure

```plaintext
├── src/
│   └── index.ts          # Extension entry point
├── package.json          # Dependencies and Pi config
├── tsconfig.json         # TypeScript configuration (extends @hacxy/tsconfig)
├── eslint.config.js      # ESLint configuration (extends @hacxy/eslint-config)
├── .prettierrc           # Prettier configuration (@hacxy/prettier-config)
├── .gitignore
└── README.md
```

## Code Style Guidelines

### Shared Configuration Packages

This template inherits its infrastructure from the `@hacxy/*` shared packages:

- `@hacxy/tsconfig/node.json` - TypeScript preset for Node.js projects
- `@hacxy/eslint-config` - ESLint flat config with `hacxy({ node: true })`
- `@hacxy/prettier-config` - unified Prettier formatting

### TypeScript

- Strict TypeScript (`strict: true`)
- Explicit return types for public functions
- Use `import type` for type-only imports
- Avoid `any` - use `unknown` or proper types

### Code Style

- Single quotes, no semicolons (managed by Prettier)
- 2-space indentation
- Run `pnpm run lint` before commits

### Naming Conventions

- **Files**: `kebab-case.ts`
- **Functions**: `camelCase`
- **Types/Interfaces**: `PascalCase`
- **Constants**: `UPPER_SNAKE_CASE`

## Writing Extensions

### Tool Registration

```typescript
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'
import { Type } from 'typebox'

pi.registerTool({
  name: 'tool-name',
  label: 'Tool Label',
  description: 'What this tool does (LLM reads this)',
  parameters: Type.Object({
    param: Type.String({ description: 'Parameter description' }),
  }),
  async execute(_id, params, _signal, _onUpdate, _ctx) {
    return {
      content: [{ type: 'text', text: 'Result' }],
      details: {},
    }
  },
})
```

### Command Registration

```typescript
pi.registerCommand('command-name', {
  description: 'What this command does',
  handler: async (args, ctx) => {
    ctx.ui.notify(`Result: ${args}`, 'info')
  },
})
```

### Event Handling

```typescript
pi.on('session_start', async (_event, ctx) => {
  ctx.ui.notify('Extension loaded!', 'info')
})
```

## Testing

**Manual Testing:**

1. Run `pnpm run dev`
2. In Pi, use natural language to trigger tools: "say hello to Alice"
3. In Pi, use slash commands: `/hello Alice`

**Type Checking:**

```bash
pnpm run typecheck
```

**Linting:**

```bash
pnpm run lint
```

## Build and Deployment

This project uses TypeScript directly via [jiti](https://github.com/unjs/jiti) - no build step required.

**Installation:**

- Copy this project to `~/.pi/agent/extensions/` (global) or `.pi/extensions/` (project-local)
- Or configure in `settings.json` under `extensions` array

## Pull Request Guidelines

- Title format: `[pi-extension] Description`
- Required checks: `pnpm run lint`, `pnpm run typecheck`
- Keep extensions focused and minimal
- Document tool descriptions clearly (LLM reads them)

## Common Issues

**Type errors with `params`:**

- Use type assertion: `const { name } = params as { name: string }`

**`async` function warning:**

- Handler must return `Promise<void>` - use `async` keyword
- Add `await Promise.resolve()` if no async operations

**Module not found errors:**

- Run `pnpm install` to install dependencies
- Check `package.json` for correct dependency versions

## Additional Notes

- Extensions run with full system permissions - only install trusted sources
- Tool descriptions are crucial - LLM uses them to decide when to call tools
- Use `ctx.ui` for user interaction (notify, confirm, select, input)
- State persistence: `pi.appendEntry(customType, data)`

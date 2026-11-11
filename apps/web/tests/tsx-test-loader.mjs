// Test-only JSX compilation with the TypeScript dependency already installed by Next.js.
// This is not bundled into the app and does not install a browser/test framework.
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
const ts = createRequire(import.meta.url)("typescript");

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "next/link") return nextResolve("next/link.js", context);
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    if (
      specifier.startsWith(".") &&
      context.parentURL?.includes("/apps/web/src/")
    ) {
      for (const extension of [".ts", ".tsx"]) {
        const candidate = new URL(specifier + extension, context.parentURL);
        if (existsSync(candidate))
          return { url: candidate.href, shortCircuit: true };
      }
    }
    throw error;
  }
}
export async function load(url, context, nextLoad) {
  if (url.includes("/apps/web/src/") && /\.tsx?$/.test(url)) {
    const source = await readFile(new URL(url), "utf8");
    return {
      format: "module",
      shortCircuit: true,
      source: ts.transpileModule(source, {
        compilerOptions: {
          module: ts.ModuleKind.ESNext,
          target: ts.ScriptTarget.ES2022,
          jsx: ts.JsxEmit.ReactJSX,
          verbatimModuleSyntax: true,
        },
        fileName: new URL(url).pathname,
      }).outputText,
    };
  }
  return nextLoad(url, context);
}

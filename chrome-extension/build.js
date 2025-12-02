const esbuild = require("esbuild");
const path = require("path");

const isWatch = process.argv.includes("--watch");

const buildOptions = {
  entryPoints: [
    "src/background.ts",
    "src/popup.ts",
    "src/contentScript.ts",
  ],
  bundle: true,
  outdir: "dist",
  platform: "browser",
  target: "chrome120",
  format: "iife",
  sourcemap: isWatch ? "inline" : false,
  minify: !isWatch,
  define: {
    "process.env.NODE_ENV": isWatch ? '"development"' : '"production"',
    global: "globalThis",
  },
  inject: [require.resolve("node-stdlib-browser/helpers/esbuild/shim")],
  alias: {
    stream: "stream-browserify",
    buffer: "buffer",
  },
  logLevel: "info",
};

async function build() {
  try {
    if (isWatch) {
      const ctx = await esbuild.context(buildOptions);
      await ctx.watch();
      console.log("Watching for changes...");
    } else {
      await esbuild.build(buildOptions);
      console.log("Build complete!");
    }
  } catch (error) {
    console.error("Build failed:", error);
    process.exit(1);
  }
}

build();

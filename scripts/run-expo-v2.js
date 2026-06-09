const { spawn } = require("child_process");

const expoArgs = process.argv.slice(2);
const targetArgs = expoArgs.length ? expoArgs : ["start"];
const runner = process.platform === "win32" ? "npx.cmd" : "npx";

const child = spawn(runner, ["expo", ...targetArgs], {
  stdio: "inherit",
  shell: false,
  env: {
    ...process.env,
    EXPO_PUBLIC_APP_TARGET: "v2",
  },
});

child.on("exit", (code) => {
  process.exit(code ?? 0);
});

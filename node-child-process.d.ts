// @types/node を足さずに vite.config.ts から git log を読むため、使う関数だけを宣言する。
declare module "node:child_process" {
  export const execFileSync: (
    file: string,
    args: readonly string[],
    options: { encoding: "utf8"; stdio: readonly ("ignore" | "pipe")[] },
  ) => string;
}

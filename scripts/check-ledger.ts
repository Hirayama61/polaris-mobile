// `bun run check` から呼ぶ。ブラウザを使わず、対応表 (e2e/ledger.json) の更新漏れを落とす。
import { readdirSync, readFileSync } from "node:fs";
import { checkLedger, parseLedger } from "./ledger";

const DEFINITION_FILE = "src/github.ts";

const isSourceFile = (path: string): boolean =>
  /\.tsx?$/.test(path) && !/\.(test|stories)\.tsx?$/.test(path) && path !== DEFINITION_FILE;

const readFiles = (dir: string, isTarget: (path: string) => boolean): Map<string, string> => {
  const paths = readdirSync(dir, { recursive: true, encoding: "utf8" })
    .map((name) => `${dir}/${name.replaceAll("\\", "/")}`)
    .filter(isTarget);
  return new Map(paths.map((path) => [path, readFileSync(path, "utf8")]));
};

const ledger = parseLedger(JSON.parse(readFileSync("e2e/ledger.json", "utf8")));
const sources = readFiles("src", isSourceFile);
const specs = readFiles("e2e", (path) => path.endsWith(".spec.ts"));
const errors = checkLedger(ledger, sources, specs);

if (errors.length > 0) {
  console.error("e2e/ledger.json と実装が食い違っています。");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}
console.log(`e2e/ledger.json: ${ledger.length} 件の書き込み操作を照合しました。`);

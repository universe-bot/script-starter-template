import commonjs from "@rollup/plugin-commonjs";
import nodeResolve from "@rollup/plugin-node-resolve";
import typescript from "@rollup/plugin-typescript";

export default {
  input: "src/index.ts",
  output: {
    file: `./dist/index.js`,
    format: "es",
    name: `samplescriptproject`,
  },
  plugins: [nodeResolve(), commonjs(), typescript()],
};

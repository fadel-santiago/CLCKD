import nextConfig from "eslint-config-next";
import typescriptConfig from "eslint-config-next/typescript";

const eslintConfig = [
  ...nextConfig,
  ...typescriptConfig,
  {
    ignores: ["coverage/**"],
  },
];

export default eslintConfig;

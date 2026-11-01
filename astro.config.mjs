// @ts-check
import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import mdx from '@astrojs/mdx';

// GitHub Pages 项目站点访问路径为 /仓库名/，本地开发保持根路径
const isCI = process.env.CI === 'true';

// https://astro.build/config
export default defineConfig({
  site: 'https://everwynn.github.io',
  base: isCI ? '/pulse-hub/' : '/',

  // 主题切换已改为纯 Astro + 内联脚本（见 components/ThemeToggle.astro），不再需要 Vue 集成。
  // 留着它会让每次构建都产出一个没人引用的 Vue runtime bundle（~72KB）。
  integrations: [tailwind(), mdx()],

  output: 'static',

  markdown: {
    shikiConfig: {
      theme: 'github-dark',
    },
  },
});

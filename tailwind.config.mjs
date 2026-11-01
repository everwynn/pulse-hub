import typography from '@tailwindcss/typography';

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      colors: {
        // 信号/脉搏风格主色（与 TechHub 的青绿区分）
        accent: {
          DEFAULT: '#0ea5e9',
          light: '#38bdf8',
          dark: '#0284c7',
        },
      },
      transitionProperty: {
        theme: 'background-color, border-color, color, fill, stroke, box-shadow',
      },
    },
  },
  plugins: [typography],
};

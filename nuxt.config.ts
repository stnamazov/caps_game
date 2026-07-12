import tailwindcss from "@tailwindcss/vite";
export default defineNuxtConfig({
  app: {
    head: {
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
      ],
      title: 'Вебсы'
    },
  },
  css: ['./app/assets/css/main.css'],
  vite: {
    optimizeDeps: {
      include: [
        '@tresjs/core',
        '@tresjs/cientos',
        '@tresjs/post-processing',
        '@vue/devtools-core',
        '@vue/devtools-kit',
        'gsap',
        'three',
        'howler'
      ]
    },
    plugins: [
      tailwindcss()
    ]
  },
  modules: [
    '@tresjs/nuxt',
    '@nuxt/devtools'
  ],
  compatibilityDate: '2025-01-01',
})
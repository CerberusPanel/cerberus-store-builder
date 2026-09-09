import { createApp } from 'vue'
import App from './App.vue'
import './style.css'

const storedTheme = localStorage.getItem('cerberus-store-builder:theme')
const themeMode = ['light', 'system', 'dark'].includes(storedTheme) ? storedTheme : 'system'
const effectiveTheme = themeMode === 'system'
  ? (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
  : themeMode

document.documentElement.dataset.theme = effectiveTheme
document.documentElement.style.colorScheme = effectiveTheme

createApp(App).mount('#app')

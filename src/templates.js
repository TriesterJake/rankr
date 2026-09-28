// Starter ideas shown when creating a list (the person can still type anything).
export const TEMPLATES = [
  'Favorite things',
  'Favorite songs',
  'Favorite movies',
  'Favorite TV shows',
  'Funniest people I know',
  'Favorite albums',
  'Favorite video games',
  'Favorite foods',
  'Favorite restaurants',
  'Favorite books',
  'Favorite comedians',
  'Favorite places I have been',
]

// Two rows of 12: bright colors on top, lighter pastel versions below.
export const COLORS = [
  '#f74545', '#f77a45', '#f7b045', '#f7da45', '#adf745', '#45f780',
  '#45f7da', '#45d4f7', '#458ff7', '#5445f7', '#bc45f7', '#f7459e',
  '#faa3a3', '#fabda3', '#fad7a3', '#faeca3', '#d6faa3', '#a3fac0',
  '#a3faec', '#a3e9fa', '#a3c7fa', '#aaa3fa', '#dda3fa', '#faa3cf',
]

export const randomColor = () => COLORS[Math.floor(Math.random() * COLORS.length)]

// Pick dark or white text so it stays readable on top of any list color.
export function inkOn(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '')
  if (!m) return '#ffffff'
  const n = parseInt(m[1], 16)
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return luminance > 0.35 ? '#14151a' : '#ffffff'
}

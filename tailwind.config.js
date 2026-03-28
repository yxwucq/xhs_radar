/** @type {import('tailwindcss').Config} */
export default {
  content: [
    'src/popup/**/*.{html,tsx}',
    'src/options/**/*.{html,tsx}',
    'src/stats/**/*.{html,tsx}',
    'src/onboarding/**/*.{html,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        cream: '#FBF8F4',
        sand: '#EDE8E1',
        bark: '#3D3529',
        muted: '#9A9084',
        amber: { warm: '#D4845A', light: '#F2DDD0' },
        sage: { DEFAULT: '#7BB686', light: '#E4F2E7' },
        coral: { DEFAULT: '#E08B7A', light: '#FBEAE6' },
      },
      fontFamily: {
        serif: ['"Noto Serif SC"', 'Georgia', 'serif'],
        body: ['system-ui', '-apple-system', 'sans-serif'],
      },
      borderRadius: {
        '2xl': '16px',
        '3xl': '20px',
      },
      boxShadow: {
        soft: '0 2px 12px rgba(61, 53, 41, 0.06)',
        card: '0 1px 8px rgba(61, 53, 41, 0.04)',
      },
    },
  },
  plugins: [],
}

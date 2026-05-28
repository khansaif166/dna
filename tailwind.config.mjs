/** @type {import('tailwindcss').Config} */
export default {
  theme: {
    extend: {
      colors: {
        'green-900': 'var(--green-900)',
        'green-800': 'var(--green-800)',
        'green-700': 'var(--green-700)',
        'green-600': 'var(--green-600)',
        'gold-500': 'var(--gold-500)',
        'gold-300': 'var(--gold-300)',
        cream: 'var(--cream)',
        white: 'var(--white)',
        'gray-100': 'var(--gray-100)',
        'gray-400': 'var(--gray-400)',
        'gray-600': 'var(--gray-600)',
        'text-dark': 'var(--text-dark)',
        'text-mid': 'var(--text-mid)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        serif: ['Playfair Display', 'Georgia', 'serif'],
      },
    },
  },
};

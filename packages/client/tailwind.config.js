/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['class'],
  content: ['./pages/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      colors: {
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
          rgb: 'var(--primary-rgb, 59 130 246)',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        chart: {
          1: 'hsl(var(--chart-1))',
          2: 'hsl(var(--chart-2))',
          3: 'hsl(var(--chart-3))',
          4: 'hsl(var(--chart-4))',
          5: 'hsl(var(--chart-5))',
          1: 'hsl(var(--chart-1))',
          2: 'hsl(var(--chart-2))',
          3: 'hsl(var(--chart-3))',
          4: 'hsl(var(--chart-4))',
          5: 'hsl(var(--chart-5))',
        },
      },
      backdropFilter: {
        frosted: 'blur(20px) saturate(180%)',
        'frosted-light': 'blur(15px) saturate(160%)',
        'frosted-heavy': 'blur(25px) saturate(200%)',
      },
      backgroundImage: {
        'frosted-light': 'linear-gradient(135deg, hsl(var(--background) / 0.05) 0%, hsl(var(--background) / 0.02) 100%)',
        'frosted-subtle': 'linear-gradient(135deg, hsl(var(--background) / 0.03) 0%, hsl(var(--background) / 0.01) 100%)',
        'frosted-card': 'linear-gradient(135deg, hsl(var(--card) / 0.1) 0%, hsl(var(--card) / 0.05) 100%)',
      },
      boxShadow: {
        frosted: '0 8px 32px 0 rgba(31, 38, 135, 0.37)',
        'frosted-lg': '0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(255, 255, 255, 0.05)',
        'frosted-xl': '0 25px 50px -12px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.1)',
      },
    },
  },
  plugins: [
    require('tailwindcss-animate'),
    function ({ addUtilities }) {
      const newUtilities = {
        '.frosted-glass': {
          background: 'linear-gradient(135deg, hsl(var(--background) / 0.03) 0%, hsl(var(--background) / 0.01) 100%)',
          backdropFilter: 'blur(20px) saturate(180%)',
          WebkitBackdropFilter: 'blur(20px) saturate(180%)',
          border: '1px solid hsl(var(--border) / 0.2)',
        },
        '.frosted-glass-card': {
          background: 'linear-gradient(135deg, hsl(var(--card) / 0.1) 0%, hsl(var(--card) / 0.05) 100%)',
          backdropFilter: 'blur(20px) saturate(180%)',
          WebkitBackdropFilter: 'blur(20px) saturate(180%)',
          border: '1px solid hsl(var(--border) / 0.2)',
        },
        '.frosted-glass-light': {
          background: 'linear-gradient(135deg, hsl(var(--background) / 0.05) 0%, hsl(var(--background) / 0.02) 100%)',
          backdropFilter: 'blur(15px) saturate(160%)',
          WebkitBackdropFilter: 'blur(15px) saturate(160%)',
          border: '1px solid hsl(var(--border) / 0.3)',
        },
      }
      addUtilities(newUtilities)
    },
  ],
}

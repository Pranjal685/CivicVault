/** @type {import('tailwindcss').Config} */
export default {
    content: [
        './index.html',
        './src/**/*.{js,ts,jsx,tsx}',
    ],
    darkMode: 'class',
    theme: {
        extend: {
            colors: {
                vault: {
                    50: '#fdf8ef',
                    100: '#f9edd4',
                    200: '#f2d8a8',
                    300: '#e9bd72',
                    400: '#e2a44e',
                    500: '#d98c2e',
                    600: '#c07024',
                    700: '#a05520',
                    800: '#834421',
                    900: '#6c391e',
                    950: '#3a1b0e',
                },
                dark: {
                    50: '#f6f6f9',
                    100: '#ececf2',
                    200: '#d5d5e2',
                    300: '#b1b1c8',
                    400: '#8686aa',
                    500: '#676790',
                    600: '#535277',
                    700: '#444361',
                    800: '#3b3a53',
                    900: '#1e1e2e',
                    925: '#161624',
                    950: '#0d0d1a',
                    975: '#080812',
                },
            },
            fontFamily: {
                sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
                display: ['Outfit', 'Inter', 'system-ui', 'sans-serif'],
                mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
            },
            boxShadow: {
                'vault': '0 0 30px rgba(217, 140, 46, 0.15)',
                'vault-lg': '0 0 60px rgba(217, 140, 46, 0.25)',
                'inner-glow': 'inset 0 1px 0 rgba(255,255,255,0.05)',
            },
            animation: {
                'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
                'shimmer': 'shimmer 2s linear infinite',
                'float': 'float 6s ease-in-out infinite',
            },
            keyframes: {
                shimmer: {
                    '0%': { backgroundPosition: '-200% 0' },
                    '100%': { backgroundPosition: '200% 0' },
                },
                float: {
                    '0%, 100%': { transform: 'translateY(0px)' },
                    '50%': { transform: 'translateY(-10px)' },
                },
            },
        },
    },
    plugins: [],
};

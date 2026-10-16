/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        navy: {
          DEFAULT: "#26387B",
          deep: "#192965",
          ink: "#000F48",
        },
        brand: {
          DEFAULT: "#ED1C24",
          hot: "#E4082C",
        },
        mist: "#EFF2FD",
        ice: "#E2E7FA",
      },
      fontFamily: {
        sans: ["Open Sans", "Segoe UI", "sans-serif"],
        display: ["Montserrat", "Open Sans", "sans-serif"],
      },
      boxShadow: {
        card: "0 10px 30px rgba(25, 41, 101, 0.08)",
      },
    },
  },
  plugins: [],
};

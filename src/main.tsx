import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

/**
 * Publishes the *visible* viewport height as --app-height.
 *
 * iOS Safari reports 100dvh as the large viewport (browser toolbars
 * retracted) even while those toolbars are on screen, so a shell sized with
 * dvh alone ends up taller than what the user can actually see -- the top of
 * the app hides behind the URL bar. visualViewport reports what is genuinely
 * visible, including mid-transition, so the shell always matches the window.
 *
 * Runs before render so the first paint is already the right height.
 */
function trackViewportHeight() {
  const viewport = window.visualViewport;
  if (!viewport) return; // Older browsers keep the 100dvh fallback in index.css.

  const apply = () => {
    document.documentElement.style.setProperty("--app-height", `${viewport.height}px`);
  };
  apply();
  viewport.addEventListener("resize", apply);
  // Pinch-zoom and the on-screen keyboard shift the visual viewport without
  // resizing it; re-applying on scroll keeps the shell aligned to it.
  viewport.addEventListener("scroll", apply);
}

trackViewportHeight();

createRoot(document.getElementById("root")!).render(<App />);

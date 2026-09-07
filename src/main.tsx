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

  const isEditing = () => {
    const el = document.activeElement;
    if (!(el instanceof HTMLElement)) return false;
    return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable;
  };

  const apply = () => {
    // Ignore the shrink caused by the on-screen keyboard.
    //
    // The keyboard cuts visualViewport.height roughly in half. Following it
    // would shrink the whole app shell to the strip above the keyboard,
    // dragging the bottom tab bar up over the form and collapsing the
    // layout -- which is exactly what focusing the resident-code field did.
    // The shell keeps its height and the focused field scrolls into view
    // inside its own overflow-y-auto pane, which is the behaviour a native
    // app has.
    if (isEditing()) return;
    document.documentElement.style.setProperty("--app-height", `${viewport.height}px`);
  };

  apply();
  viewport.addEventListener("resize", apply);
  // Pinch-zoom shifts the visual viewport without resizing it; re-applying
  // on scroll keeps the shell aligned to it.
  viewport.addEventListener("scroll", apply);
  // Once the keyboard closes the reading is trustworthy again. focusout
  // fires before the viewport has finished animating back, hence the tick.
  document.addEventListener("focusout", () => setTimeout(apply, 100));
}

trackViewportHeight();

createRoot(document.getElementById("root")!).render(<App />);

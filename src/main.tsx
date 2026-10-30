import { registerSW } from "virtual:pwa-register";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";

registerSW({ immediate: true });

const root = document.getElementById("root");
if (root === null) {
  throw new Error("#root が index.html にありません");
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

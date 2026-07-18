/**
 * React entry point. Imports the design tokens exactly once (every component below inherits
 * the CSS variables and the two-register helper classes from here), then mounts the shell.
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./theme/tokens.css";
import { App } from "./app/App.js";

const container = document.getElementById("root");
if (!container) throw new Error("Missing #root element in index.html");

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>
);

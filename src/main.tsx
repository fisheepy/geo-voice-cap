import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

function setAppHeight() {
  document.documentElement.style.setProperty("--app-h", `${window.innerHeight}px`);
}
setAppHeight();
window.addEventListener("resize", setAppHeight);
window.addEventListener("orientationchange", setAppHeight);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

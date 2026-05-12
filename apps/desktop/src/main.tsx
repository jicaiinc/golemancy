import { activateInitialLocale, GolemancyI18nProvider } from "@golemancy/i18n";
import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./app";
import "./styles.css";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Desktop root element was not found");
}

async function boot() {
  const initialLocale = await activateInitialLocale();

  ReactDOM.createRoot(rootElement as HTMLElement).render(
    <React.StrictMode>
      <GolemancyI18nProvider initialLocale={initialLocale}>
        <App />
      </GolemancyI18nProvider>
    </React.StrictMode>,
  );
}

void boot();

import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { registerPushServiceWorker } from "./lib/pushServiceWorker";

createRoot(document.getElementById("root")!).render(<App />);

void registerPushServiceWorker();

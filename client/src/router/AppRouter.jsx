import { BrowserRouter, HashRouter } from "react-router-dom";

export default function AppRouter({ children }) {
  const isElectron =
    typeof window !== "undefined" &&
    window.electronAPI?.isDesktop;

  const Router = isElectron ? HashRouter : BrowserRouter;

  return <Router>{children}</Router>;
}
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AppProvider } from './context/AppContext.jsx'
import { AuthProvider } from './context/AuthContext.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import './index.css'
import App from './App.jsx'

console.log("main.jsx: Definined imports");

try {
  const rootElement = document.getElementById('root');
  console.log("main.jsx: Root element:", rootElement);

  if (!rootElement) {
    throw new Error("Element with id 'root' not found");
  }

  const root = createRoot(rootElement);
  console.log("main.jsx: Root created");

  root.render(
    <StrictMode>
      <ErrorBoundary>
        <BrowserRouter>
          <AuthProvider>
            <AppProvider>
              <App />
            </AppProvider>
          </AuthProvider>
        </BrowserRouter>
      </ErrorBoundary>
    </StrictMode>
  );
  console.log("main.jsx: Render called");

} catch (error) {
  console.error("main.jsx: Fatal error:", error);
  document.body.innerHTML = `<div style="color:red; margin:20px; font-family:sans-serif;"><h1>Error de Carga</h1><pre>${error.stack}</pre></div>`;
}

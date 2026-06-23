//-----------------------------------------------------------------------
// <copyright company="Microsoft Corporation">
//        Copyright (c) Microsoft Corporation.  All rights reserved.
//        Licensed under the MIT license. See LICENSE file in the project root for full license information.
// </copyright>
//-----------------------------------------------------------------------

import { createRoot } from 'react-dom/client';
import { ErrorBoundary } from "react-error-boundary";

import App from './App.tsx';
import { ErrorFallback } from './ErrorFallback';
import { useAppTheme } from './hooks/use-theme';
import { ThemeContext } from './hooks/theme.context';
import { AuthProvider } from './hooks/use-auth';
import { bootstrapAuth } from './services/rayfin-auth.service';
import { AuthGate } from './components/auth-gate.component';

import "./global.css"

const isPublicApp = import.meta.env.VITE_PUBLIC_APP === "true";

function Root() {
    const { isDark, toggleTheme } = useAppTheme();
    const app = isPublicApp ? (
        <App />
    ) : (
        <AuthProvider rayfinAuthService={bootstrapAuth()}>
            <AuthGate>
                <App />
            </AuthGate>
        </AuthProvider>
    );

    return (
        <ThemeContext.Provider value={{ isDark, toggleTheme }}>
            <ErrorBoundary FallbackComponent={ErrorFallback}>
                {app}
            </ErrorBoundary>
        </ThemeContext.Provider>
    );
}

createRoot(document.getElementById('root')!).render(<Root />)

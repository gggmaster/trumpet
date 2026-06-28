//-----------------------------------------------------------------------
// <copyright company="Microsoft Corporation">
//        Copyright (c) Microsoft Corporation.  All rights reserved.
//        Licensed under the MIT license. See LICENSE file in the project root for full license information.
// </copyright>
//-----------------------------------------------------------------------

import { PropertyDashboard } from "./PropertyDashboard";
import { ApiPropertyDashboard } from "./ApiPropertyDashboard";
import { PublicPropertyDashboard } from "./PublicPropertyDashboard";

function App() {
    if (import.meta.env.VITE_API_APP === "true") return <ApiPropertyDashboard />;

    return import.meta.env.VITE_PUBLIC_APP === "true" ? (
        <PublicPropertyDashboard />
    ) : (
        <PropertyDashboard />
    );
}

export default App;

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
// Path aliases mirror tsconfig.app.json and the domain-boundary folder
// structure documented in README.md. Keep both files in sync if a
// boundary is renamed.
export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: {
            "@domain": fileURLToPath(new URL("./src/domain", import.meta.url)),
            "@ui-state": fileURLToPath(new URL("./src/ui-state", import.meta.url)),
            "@derived": fileURLToPath(new URL("./src/derived", import.meta.url)),
            "@streaming": fileURLToPath(new URL("./src/streaming", import.meta.url)),
            "@api": fileURLToPath(new URL("./src/api", import.meta.url)),
            "@panels": fileURLToPath(new URL("./src/panels", import.meta.url)),
            "@shell": fileURLToPath(new URL("./src/shell", import.meta.url)),
            "@shared": fileURLToPath(new URL("./src/shared", import.meta.url)),
            "@types": fileURLToPath(new URL("./src/types", import.meta.url)),
        },
    },
    server: {
        port: 5173,
    },
    test: {
        environment: "jsdom",
        css: false,
        server: {
            deps: {
                inline: [/@csstools/, /@asamuzakjp/],
            },
        },
    },
});

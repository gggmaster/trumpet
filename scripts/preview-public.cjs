const http = require("http");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..", "dist");
const types = {
    ".html": "text/html",
    ".js": "text/javascript",
    ".css": "text/css",
    ".json": "application/json",
    ".txt": "text/plain",
};

http.createServer((request, response) => {
    let urlPath = decodeURIComponent((request.url || "/").split("?")[0]);

    if (urlPath === "/trumpet" || urlPath === "/trumpet/") {
        urlPath = "/index.html";
    } else if (urlPath.startsWith("/trumpet/")) {
        urlPath = urlPath.slice("/trumpet".length);
    } else if (urlPath === "/") {
        urlPath = "/index.html";
    }

    const filePath = path.join(root, urlPath);
    if (!filePath.startsWith(root)) {
        response.writeHead(403);
        response.end("Forbidden");
        return;
    }

    fs.readFile(filePath, (error, data) => {
        if (error) {
            response.writeHead(404);
            response.end("Not found");
            return;
        }

        response.writeHead(200, {
            "Content-Type": types[path.extname(filePath)] || "application/octet-stream",
        });
        response.end(data);
    });
}).listen(4176, "127.0.0.1");

self.addEventListener("install", event => {
    event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", event => {
    event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", event => {
    if (event.request.mode === "navigate") {
        event.respondWith(
            new Response(`
                <!DOCTYPE html>
                <html>
                <head>
                    <meta name="viewport"
                    content="width=device-width, initial-scale=1">
                    <title>Playcode Discontinued</title>
                </head>
                <body style="background:#101010;color:white;
                font-family:Arial;text-align:center;padding:60px 20px;">
                    <h1>Playcode</h1>
                    <h2>Service Discontinued</h2>
                    <p>This version of Playcode is no longer supported.</p>
                    <p>Please uninstall this application.</p>
                </body>
                </html>
            `, {
                status: 410,
                headers: {
                    "Content-Type": "text/html; charset=utf-8"
                }
            })
        );
    }
});

import express, { type Express } from "express";
import fs from "fs";
import path from "path";

export function serveStatic(app: Express) {
  // In production, dist/index.cjs is the compiled file, so __dirname is dist/
  // Static files are in dist/public
  const distPath = path.resolve(process.cwd(), "dist", "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  // Serve static files with proper MIME types
  // This middleware will serve files from dist/public and call next() if file not found
  app.use(express.static(distPath, {
    maxAge: "1y",
    etag: true,
    setHeaders: (res, filePath) => {
      // Ensure proper MIME types for JavaScript modules
      if (filePath.endsWith('.js') || filePath.endsWith('.mjs')) {
        res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      }
    },
    // Don't redirect, just return 404 if file not found
    redirect: false,
  }));

  // fall through to index.html if the file doesn't exist (SPA routing)
  // But only for non-static file requests
  app.get("*", (req, res, next) => {
    const url = req.originalUrl || req.url;
    
    // Skip API routes
    if (url.startsWith('/api/')) {
      return next();
    }
    
    // Check if this is a request for a static file by extension
    const staticFileExtensions = ['.js', '.mjs', '.css', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.woff', '.woff2', '.ttf', '.eot', '.json', '.map', '.webp', '.avif'];
    const hasStaticExtension = staticFileExtensions.some(ext => url.toLowerCase().endsWith(ext));
    
    // Also check if it's in the assets directory (Vite build output)
    const isAssetRequest = url.startsWith('/assets/');
    
    // If it's a static file request that wasn't served by static middleware, return 404
    if (hasStaticExtension || isAssetRequest) {
      return res.status(404).json({ message: 'File not found' });
    }
    
    // For non-static file requests (SPA routes), serve index.html
    const indexPath = path.resolve(distPath, "index.html");
    if (fs.existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      res.status(404).json({ message: 'index.html not found' });
    }
  });
}

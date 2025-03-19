#!/usr/bin/env bash
set -e  
echo "Running tests..."
npm run test
echo "Tests passed. Preparing build..."
mkdir -p dist
cp -r *.js *.html *.css *.png *.json *.ttf *.md LICENSE dist/
echo "Build completed successfully."
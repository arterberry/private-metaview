#!/usr/bin/env bash
set -e  
echo "Running tests..."
npm run test
echo "Tests passed. Preparing build..."
mkdir -p dist
cp -r *.js *.html *.css *.png *.json *.ttf *.md LICENSE dist/
cp -r images dist/
echo "Build completed successfully."

# set -e  

# echo "Preparing build..."

# # Load env vars from .env
# set -o allexport
# source .env
# set +o allexport

# mkdir -p dist

# # Generate manifest.json from template
# envsubst < manifest.template.json > dist/manifest.json

# # Copy remaining files
# cp -r *.js *.html *.css *.ttf *.md LICENSE dist/
# cp -r sounds dist/
# cp -r images dist/

# echo "Build completed successfully."
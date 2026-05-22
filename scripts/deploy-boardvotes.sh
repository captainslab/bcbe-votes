#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "Building client..."
cd client
npm run build

echo "Deploying static frontend..."
sudo rsync -a --delete dist/ /var/www/bcbe-votes/

echo "Preserving FCC SPA entrypoint..."
sudo cp /var/www/bcbe-votes/index.html /var/www/bcbe-votes/index-fcc.html

echo "Deploying FCC proposal pages..."
cd ..
sudo cp docs/proposal-fcc-chris-mcneil.html /var/www/bcbe-votes/proposal.html
sudo cp docs/proposal-fcc-chris-mcneil.html /var/www/bcbe-votes/proposal-fcc.html

echo "Building server..."
cd server
npm run build

echo "Restarting API and reloading nginx..."
sudo systemctl restart bcbe-votes-api.service
sudo nginx -t
sudo systemctl reload nginx

echo "Verifying FCC pages..."
for u in "" dashboard meetings votes members proposal proposal.html; do
  curl -skI "https://fcc.boardvotes.io/$u" | head -1
done

echo "Verifying API..."
curl -s "https://fcc.boardvotes.io/api/members" | python3 -c "import sys,json; d=json.load(sys.stdin); print('members:',len(d))"
curl -s "https://fcc.boardvotes.io/api/votes?nonUnanimousOnly=false" | python3 -c "import sys,json; d=json.load(sys.stdin); d=d.get('votes',d) if isinstance(d,dict) else d; print('votes:',len(d))"
curl -s "https://bcbe.boardvotes.io/api/health"
echo

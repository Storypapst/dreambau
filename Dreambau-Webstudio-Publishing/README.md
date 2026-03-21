# Webstudio Publishing Pipeline

This directory contains the automated publishing pipeline for Webstudio sites.

## Architecture

1. **Builder** (`webstudio.dreambau.com`) - The Webstudio Builder UI where you design sites
2. **Publishing Service** - Webhook handler that triggers builds when "Publish" is clicked
3. **Site Hosting** - Docker containers or static hosting for published sites

## Workflow

1. User designs a site in the Builder
2. User clicks "Publish" in the Builder
3. Webhook triggers the publishing service
4. Service runs: `webstudio sync` → `webstudio build` → Deploy
5. Site becomes available at `{project-name}.sites.dreambau.com`

## Components

- `webhook-server/` - Express server that handles publish webhooks
- `build-script.sh` - Script that builds and deploys a site
- `docker/` - Docker setup for hosting published sites
- `k8s/` - Kubernetes manifests for the publishing infrastructure

## Setup

See individual component READMEs for setup instructions.






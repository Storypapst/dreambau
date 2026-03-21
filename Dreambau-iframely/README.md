# Dreambau Iframely

Self-hosted Iframely service for link previews and oEmbed support. Saves **$50/month** compared to hosted service!

## 🚀 Quick Start

### Prerequisites

- Kubernetes cluster (k3s) with Traefik ingress
- cert-manager installed for SSL certificates
- DNS record: `iframely.dreambau.com` → Your server IP

### Deployment

```bash
cd Dreambau-iframely
chmod +x scripts/deploy-iframely.sh
./scripts/deploy-iframely.sh
```

## 📋 API Information

**API URL**: `https://iframely.dreambau.com`

**API Key**: 
```bash
kubectl get secret iframely-secret -n wcr -o jsonpath='{.data.API_KEY}' | base64 -d
```

Or check `config/iframely-secret.yaml` (the API key is stored there).

## 🔧 Usage Examples

### 1. Iframely API (Main Endpoint)

```bash
# With API key as URL parameter
curl "https://iframely.dreambau.com/iframely?url=YOUR_URL&api_key=YOUR_API_KEY"

# With API key in header
curl -H "X-API-Key: YOUR_API_KEY" \
     "https://iframely.dreambau.com/iframely?url=YOUR_URL"
```

### 2. oEmbed API

```bash
# oEmbed endpoint
curl "https://iframely.dreambau.com/oembed?url=YOUR_URL&api_key=YOUR_API_KEY"
```

### 3. Example: YouTube Video

```bash
curl "https://iframely.dreambau.com/iframely?url=https://youtube.com/watch?v=dQw4w9WgXcQ&api_key=YOUR_API_KEY"
```

### 4. Example: Twitter/X Post

```bash
curl "https://iframely.dreambau.com/iframely?url=https://twitter.com/user/status/123456&api_key=YOUR_API_KEY"
```

### 5. Example: Any Website

```bash
curl "https://iframely.dreambau.com/iframely?url=https://example.com&api_key=YOUR_API_KEY"
```

## 📝 Response Format

Iframely returns JSON with link metadata:

```json
{
  "meta": {
    "title": "Page Title",
    "description": "Page description",
    "canonical": "https://example.com/page"
  },
  "links": {
    "thumbnail": [{
      "href": "https://example.com/image.jpg",
      "type": "image/jpeg",
      "rel": ["thumbnail"]
    }]
  },
  "html": "<iframe src=\"...\"></iframe>"
}
```

## 🔐 Security

- **API Key**: Required for all requests (configured in secret)
- **CORS**: Enabled for all origins (configurable via `ALLOW_ORIGIN`)
- **HTTPS**: Enforced via cert-manager and Let's Encrypt
- **Dedicated Domain**: Recommended for security (isolated from main domain)

## ⚙️ Configuration

### Environment Variables

Edit `config/iframely-deployment.yaml`:

- `IFRAMELY_KEY`: API key (from secret) - **Required for API access**
- `PORT`: Server port (default: 8061)
- `ALLOW_ORIGIN`: CORS origin (default: "*")
- `CACHE_ENGINE`: Cache type - `node-cache` (default), `redis`, `memcached`, or `no-cache`
- `CACHE_TTL`: Cache TTL in milliseconds (0 = never expire)

### Available Endpoints

According to [Iframely documentation](https://iframely.com/docs/host), these endpoints are available:

- `/iframely` - Main API endpoint with query parameters
- `/oembed` - oEmbed API endpoint
- `/r/.+` - Static files (including iframely.js client library)
- `/debug` - Optional debugger UI
- `/reader.js` - API endpoint for article rendering
- `/render` - API endpoint for custom widgets
- `/meta-mappings` - Available unified meta
- `/supported-plugins-re.json` - List of regexps for plugins

### Redis Cache (Optional)

To use Redis instead of memory cache:

1. Deploy Redis in your cluster
2. Uncomment Redis environment variables in `config/iframely-deployment.yaml`:
   ```yaml
   - name: REDIS_HOST
     value: "redis.wcr.svc.cluster.local"
   - name: REDIS_PORT
     value: "6379"
   - name: REDIS_PASSWORD
     valueFrom:
       secretKeyRef:
         name: iframely-secret
         key: REDIS_PASSWORD
   ```
3. Update `CACHE_ENGINE` to `redis`
4. Update `iframely-secret.yaml` with `REDIS_PASSWORD`

## 🛠️ Troubleshooting

### Check Pod Status

```bash
kubectl get pods -n wcr -l app=iframely
```

### View Logs

```bash
kubectl logs -n wcr -l app=iframely -f
```

### Test API

```bash
# Test with a simple URL
curl "https://iframely.dreambau.com/iframely?url=https://example.com&api_key=YOUR_API_KEY"
```

### Restart Deployment

```bash
kubectl rollout restart deployment/iframely -n wcr
```

### Shell Access

```bash
kubectl exec -it -n wcr deployment/iframely -- sh
```

## 🔄 Updates

To update Iframely to the latest version:

```bash
kubectl set image deployment/iframely iframely=itteco/iframely:latest -n wcr
kubectl rollout status deployment/iframely -n wcr
```

## 📚 Documentation

- [Iframely Official Self-Hosting Docs](https://iframely.com/docs/host)
- [Iframely GitHub Repository](https://github.com/itteco/iframely)
- [oEmbed Specification](https://oembed.com/)

## 💰 Cost Savings

Self-hosting Iframely saves **$50/month** compared to the hosted service!

## 📌 Important Notes

1. **API Key Required**: The self-hosted version can work without an API key, but we've configured it with one for security and compatibility with services that require it.

2. **Cache**: Default is `node-cache` (in-memory). For production with high traffic, consider Redis or Memcached.

3. **Updates**: Keep Iframely updated to get the latest domain plugins and fixes:
   ```bash
   kubectl set image deployment/iframely iframely=itteco/iframely:latest -n wcr
   ```

4. **DNS**: Ensure `iframely.dreambau.com` DNS record points to your server IP before deployment.

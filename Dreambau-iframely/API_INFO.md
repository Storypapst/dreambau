# Iframely API Information

## ✅ Deployment Complete!

Your self-hosted Iframely is now running and ready to use.

## 📋 API Details

### API URL
```
https://iframely.dreambau.com
```

### API Key
```
e62d9b27ece1ad7a548712a93827d6aa61730dd547ec1b127d86233541f1e4f8
```

## 🔧 Usage Examples

### 1. Iframely API (Main Endpoint)

```bash
curl "https://iframely.dreambau.com/iframely?url=YOUR_URL&api_key=e62d9b27ece1ad7a548712a93827d6aa61730dd547ec1b127d86233541f1e4f8"
```

### 2. oEmbed API

```bash
curl "https://iframely.dreambau.com/oembed?url=YOUR_URL&api_key=e62d9b27ece1ad7a548712a93827d6aa61730dd547ec1b127d86233541f1e4f8"
```

### 3. Test with Example.com

```bash
curl "https://iframely.dreambau.com/iframely?url=https://example.com&api_key=e62d9b27ece1ad7a548712a93827d6aa61730dd547ec1b127d86233541f1e4f8"
```

### 4. Test with YouTube

```bash
curl "https://iframely.dreambau.com/iframely?url=https://youtube.com/watch?v=dQw4w9WgXcQ&api_key=e62d9b27ece1ad7a548712a93827d6aa61730dd547ec1b127d86233541f1e4f8"
```

## 📝 Important Notes

1. **Self-hosted version**: According to [Iframely documentation](https://iframely.com/docs/host), the self-hosted version doesn't require an API key by default, but we've configured one for security and compatibility.

2. **API Key Usage**: You can pass the API key as:
   - URL parameter: `?api_key=YOUR_KEY`
   - Header: `X-API-Key: YOUR_KEY`

3. **Endpoints Available**:
   - `/iframely` - Main API endpoint
   - `/oembed` - oEmbed API endpoint
   - `/r/.+` - Static files
   - `/debug` - Debugger UI (optional)

## 💰 Cost Savings

You're now saving **$50/month** by self-hosting Iframely instead of using the hosted service!

## 🔄 Getting API Key Programmatically

```bash
kubectl get secret iframely-secret -n wcr -o jsonpath='{.data.API_KEY}' | base64 -d
```






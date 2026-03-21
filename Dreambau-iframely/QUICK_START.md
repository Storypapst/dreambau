# Iframely Quick Start

## 🚀 Deploy

```bash
cd Dreambau-iframely
./scripts/deploy-iframely.sh
```

## 📋 API Info

**URL**: `https://iframely.dreambau.com`

**API Key**: 
```bash
kubectl get secret iframely-secret -n wcr -o jsonpath='{.data.API_KEY}' | base64 -d
```

## 🔧 Quick Test

```bash
# Get your API key first
API_KEY=$(kubectl get secret iframely-secret -n wcr -o jsonpath='{.data.API_KEY}' | base64 -d)

# Test with example.com
curl "https://iframely.dreambau.com/iframely?url=https://example.com&api_key=$API_KEY"
```

## 📝 Usage

### Iframely API
```
https://iframely.dreambau.com/iframely?url=YOUR_URL&api_key=YOUR_API_KEY
```

### oEmbed API
```
https://iframely.dreambau.com/oembed?url=YOUR_URL&api_key=YOUR_API_KEY
```

## 🛠️ Commands

```bash
# View logs
kubectl logs -n wcr -l app=iframely -f

# Check status
kubectl get pods -n wcr -l app=iframely

# Restart
kubectl rollout restart deployment/iframely -n wcr
```






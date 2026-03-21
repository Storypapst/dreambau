# CORS Configuration for Iframely

## ✅ CORS is Now Fully Configured!

Your Iframely API at `https://iframely.dreambau.com` now allows requests from **any website** (CORS enabled).

## 🔧 What Was Configured

### 1. **Traefik Middleware** (Ingress Level)
- Sets CORS headers on all responses
- Handles preflight OPTIONS requests
- Headers configured:
  - `Access-Control-Allow-Origin: *`
  - `Access-Control-Allow-Methods: GET, POST, OPTIONS, HEAD`
  - `Access-Control-Allow-Headers: Content-Type, Authorization, X-API-Key, X-Requested-With`
  - `Access-Control-Max-Age: 3600`

### 2. **Iframely Application** (Application Level)
- Enhanced CORS handler in `app.js`
- Always sets CORS headers when `allowedOrigins: ["*"]` is configured
- Handles OPTIONS preflight requests
- Sets CORS headers even when no `Origin` header is present

### 3. **Configuration File**
- `config.local.js` has `allowedOrigins: ["*"]` configured

## 🧪 Test Results

### OPTIONS Preflight Request
```bash
curl -I -X OPTIONS "https://iframely.dreambau.com/iframely?url=https://example.com" \
  -H "Origin: https://example.com" \
  -H "Access-Control-Request-Method: GET"
```

**Response Headers:**
```
access-control-allow-origin: *
access-control-allow-methods: GET, POST, OPTIONS, HEAD
access-control-allow-headers: Content-Type, Authorization, X-API-Key, X-Requested-With
access-control-max-age: 3600
```

### Regular GET Request
```bash
curl -I "https://iframely.dreambau.com/iframely?url=https://example.com" \
  -H "Origin: https://test.com"
```

**Response Headers:**
```
access-control-allow-origin: *
access-control-allow-methods: GET, POST, OPTIONS, HEAD
access-control-allow-headers: Content-Type, Authorization, X-API-Key, X-Requested-With
access-control-expose-headers: Content-Type, Content-Length
access-control-max-age: 3600
```

## 📝 Usage from Any Website

### JavaScript Example

```javascript
// Fetch from any website
fetch('https://iframely.dreambau.com/iframely?url=https://example.com&api_key=YOUR_API_KEY')
  .then(response => response.json())
  .then(data => console.log(data))
  .catch(error => console.error('Error:', error));
```

### jQuery Example

```javascript
$.ajax({
  url: 'https://iframely.dreambau.com/iframely',
  data: {
    url: 'https://example.com',
    api_key: 'YOUR_API_KEY'
  },
  success: function(data) {
    console.log(data);
  }
});
```

### XMLHttpRequest Example

```javascript
var xhr = new XMLHttpRequest();
xhr.open('GET', 'https://iframely.dreambau.com/iframely?url=https://example.com&api_key=YOUR_API_KEY');
xhr.onload = function() {
  if (xhr.status === 200) {
    console.log(JSON.parse(xhr.responseText));
  }
};
xhr.send();
```

## 🔒 Security Notes

- **Wildcard Origin (`*`)**: Allows requests from any origin
- **API Key**: Still required for API access (configured in secret)
- **HTTPS Only**: All requests must use HTTPS
- **No Credentials**: Wildcard origin doesn't allow credentials (cookies/auth headers)

If you need to restrict to specific origins, update `config.local.js`:
```javascript
allowedOrigins: [
  "https://yourdomain.com",
  "https://anotherdomain.com"
]
```

## 📚 Files Modified

1. `config/iframely-deployment.yaml` - Added middleware to IngressRoute, enhanced CORS headers
2. `docker/iframely-source/app.js` - Enhanced CORS handler to always set headers
3. `docker/iframely-source/config.local.js` - Configured `allowedOrigins: ["*"]`

## ✅ Verification

CORS is working correctly! Any website can now make requests to:
- `https://iframely.dreambau.com/iframely`
- `https://iframely.dreambau.com/oembed`





